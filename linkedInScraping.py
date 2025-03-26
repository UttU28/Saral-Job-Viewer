import subprocess
from time import sleep
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from utils.utilsDataScraping import checkJob, addJob, getSearchKeywords, createDummyKeywords
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import NoSuchElementException, TimeoutException, StaleElementReferenceException
from dotenv import load_dotenv
import os
import signal
from urllib.parse import urlencode
from sqlalchemy import create_engine, Column, String, Text, Integer, DateTime, Float, Boolean, Table, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

from utils.utilsDatabase import DbConfig, getSession

# Load environment variables
load_dotenv()

# Environment Variables
chromeDriverPath = os.getenv('CHROME_DRIVER_PATH')
chromeAppPath = os.getenv('CHROME_APP_PATH')
dataDir = os.getenv('DATA_DIR', 'data')
debuggingPort = os.getenv('SCRAPING_PORT')

# Update Chrome user data directory to use data/chromeData/irangarick
chromeDataDir = os.path.join(os.getcwd(), dataDir, 'chromeData')
chromeUserDataDir = os.path.join(chromeDataDir, 'irangarick')

# Update the environment variable for future use
os.environ['SCRAPING_CHROME_DIR'] = chromeUserDataDir

# Setup database connection
dbConfig = DbConfig()

# Initialize SQLAlchemy base
Base = declarative_base()
metadata = MetaData()

# Model to store raw LinkedIn job IDs that have been processed
class RawLinkedInJob(Base):
    __tablename__ = 'linkedInRawJobs'
    
    jobId = Column(String(255), primary_key=True)
    timestamp = Column(Float, nullable=False)
    processed = Column(Boolean, default=False)
    
    def __repr__(self):
        return f"<RawLinkedInJob(jobId='{self.jobId}', timestamp='{self.timestamp}', processed={self.processed})>"

# Create tables if they don't exist
Base.metadata.create_all(create_engine(dbConfig.connectionUrl))

# Function to check if a LinkedIn job exists in the database
def jobExists(jobId):
    session = getSession()
    try:
        existingJob = session.query(RawLinkedInJob).filter_by(jobId=jobId).first()
        return existingJob is not None
    except Exception as e:
        print(f"Error checking job existence: {e}")
        return False
    finally:
        session.close()

# Function to add a job to the raw jobs database
def addRawJob(jobId, timestamp):
    session = getSession()
    try:
        newJob = RawLinkedInJob(jobId=jobId, timestamp=timestamp, processed=False)
        session.add(newJob)
        session.commit()
        print(f"Added raw LinkedIn job {jobId} to database")
        return True
    except Exception as e:
        session.rollback()
        print(f"Error adding raw LinkedIn job: {e}")
        return False
    finally:
        session.close()

# Function to mark a job as processed
def markJobAsProcessed(jobId):
    session = getSession()
    try:
        job = session.query(RawLinkedInJob).filter_by(jobId=jobId).first()
        if job:
            job.processed = True
            session.commit()
            print(f"Marked LinkedIn job {jobId} as processed")
    except Exception as e:
        session.rollback()
        print(f"Error marking LinkedIn job as processed: {e}")
    finally:
        session.close()

def waitForPageLoad(driver):
    """Wait for the job listings page to load."""
    try:
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CLASS_NAME, "job-card-container--clickable"))
        )
        return True
    except (TimeoutException, NoSuchElementException):
        print("Timeout waiting for job listings to load")
        return False

def readJobListingsPage(driver, excludedCompanies):
    """Scrape job postings from the current page."""
    try:
        currentPageData = driver.find_element(By.CLASS_NAME, "scaffold-layout__list")
        jobPostings = currentPageData.find_elements(By.CLASS_NAME, "job-card-container--clickable")

        for posting in jobPostings:
            try:
                jobId = posting.get_attribute("data-job-id")
                
                # Skip if job was already processed
                if jobExists(jobId):
                    print(f"Job {jobId} already exists in database, skipping")
                    continue
                
                # Add the job to the raw database first
                if not addRawJob(jobId, time.time()):
                    print(f"Failed to add job {jobId} to raw database, skipping")
                    continue
                    
                jobData = posting.find_element(By.CLASS_NAME, "job-card-container__link")
                jobTitle = jobData.text.strip()
                jobLink = jobData.get_attribute('href')
                companyName = posting.find_element(By.CLASS_NAME, "artdeco-entity-lockup__subtitle ").text.strip()
                jobLocation = posting.find_element(By.CLASS_NAME, "artdeco-entity-lockup__caption ").text.strip()
                applyMethod = None

                if checkJob(jobId) and companyName not in excludedCompanies:
                    # Use Selenium's click method
                    try:
                        driver.execute_script("arguments[0].click();", posting)
                        sleep(1)
                    except Exception as e:
                        print(f"Error clicking job posting: {e}")
                        continue
                        
                    try:
                        applyButton = driver.find_element(By.CLASS_NAME, "jobs-apply-button")
                        buttonText = applyButton.find_element(By.CLASS_NAME, "artdeco-button__text").text
                        applyMethod = 'EasyApply' if 'easy' in buttonText.lower() else 'Manual'
                    except NoSuchElementException:
                        applyMethod = 'CHECK'

                    try:
                        jobDescription = driver.find_element(By.CLASS_NAME, "jobs-description__container").text
                        result = addJob(jobId, jobLink, jobTitle, companyName, jobLocation, applyMethod, time.time(), 'FullTime', jobDescription, "NO")
                        
                        if result:
                            markJobAsProcessed(jobId)
                            print(f"Entry with ID {jobId} added.")
                    except Exception as e:
                        print(f"Error processing job description: {e}")

            except Exception as e:
                print(f"Error in readJobListingsPage for a specific job: {e}")
        
        return True
    except Exception as e:
        print(f"Error in readJobListingsPage: {e}")
        return False


params = {
    "distance": "25.0",
    "f_JT": "F",
    "f_TPR": "r86400",
    "geoId": "103644278",
    "keywords": "{searchText}",
    "origin": "JOB_SEARCH_PAGE_JOB_FILTER",
    "refresh": "true",
    "sortBy": "DD",
    "spellCorrectionEnabled": "true",
    "f_E": "2,3",
}


def buildLinkedinUrl(searchText):
    """Construct a LinkedIn job search URL."""
    params["keywords"] = searchText
    baseUrl = "https://www.linkedin.com/jobs/search/"
    queryString = urlencode(params)
    return f"{baseUrl}?{queryString}"

# Function to safely close a Chrome process by its PID
def safelyTerminateProcess(process):
    """Safely terminate a process without killing other Chrome instances."""
    if process is None:
        return
        
    print(f"Terminating Chrome process with PID: {process.pid}")
    try:
        # First try to terminate gracefully
        process.terminate()
        try:
            # Wait for process to terminate (with timeout)
            process.wait(timeout=5)
            print("Process terminated gracefully.")
        except subprocess.TimeoutExpired:
            # If it doesn't terminate in time, force kill it
            print("Process didn't terminate in time, force killing...")
            if os.name == 'nt':  # Windows
                try:
                    # Kill process tree on Windows using taskkill
                    subprocess.run(
                        ['taskkill', '/F', '/T', '/PID', str(process.pid)],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        check=True
                    )
                    print(f"Chrome process tree with PID {process.pid} forcibly terminated")
                except subprocess.CalledProcessError as e:
                    print(f"Error using taskkill: {e}")
                    # Fallback to basic kill
                    process.kill()
            else:  # Linux/Mac
                os.kill(process.pid, signal.SIGKILL)
            print("Process force killed.")
            
        # Verify process has terminated
        try:
            # Check if process is still running
            if process.poll() is None:  # Returns None if process is still running
                print("Warning: Process might still be running. Trying alternative termination...")
                if os.name == 'nt':
                    # As a last resort on Windows, try to terminate all matching chrome processes
                    # related to our debugging port to avoid killing user's Chrome instances
                    port_str = str(debuggingPort)
                    try:
                        # Find specific chrome processes with our debugging port
                        result = subprocess.run(
                            ['wmic', 'process', 'where', 
                             f"commandline like '%--remote-debugging-port={port_str}%'", 
                             'get', 'processid'],
                            capture_output=True,
                            text=True
                        )
                        # Parse output to get PIDs
                        lines = result.stdout.strip().split('\n')
                        if len(lines) > 1:  # First line is header
                            for line in lines[1:]:
                                if line.strip().isdigit():
                                    pid = line.strip()
                                    print(f"Terminating Chrome instance with PID: {pid}")
                                    subprocess.run(['taskkill', '/F', '/PID', pid], 
                                                 check=False,
                                                 stderr=subprocess.PIPE,
                                                 stdout=subprocess.PIPE)
                    except Exception as e:
                        print(f"Error in final cleanup attempt: {e}")
            else:
                print(f"Verified: Process with PID {process.pid} has been terminated")
        except Exception as e:
            print(f"Error verifying process termination: {e}")
    except Exception as e:
        print(f"Error terminating process: {e}")

# Function to ensure Chrome is cleaned up properly
def cleanupChrome(driver, chrome_process):
    """Ensure Chrome is properly terminated."""
    print("Starting Chrome cleanup...")
    
    # Close and quit the driver
    if driver:
        try:
            print("Closing WebDriver...")
            driver.quit()
            print("WebDriver closed successfully")
        except Exception as e:
            print(f"Error closing WebDriver: {e}")
    
    # Terminate the Chrome process
    if chrome_process:
        safelyTerminateProcess(chrome_process)
    
    # As a final check, look for any Chrome processes with our debugging port
    if os.name == 'nt':  # Windows
        try:
            port_str = str(debuggingPort)
            print(f"Checking for any remaining Chrome processes using port {port_str}...")
            
            # Find Chrome processes using our debugging port
            result = subprocess.run(
                ['wmic', 'process', 'where', 
                 f"commandline like '%--remote-debugging-port={port_str}%'", 
                 'get', 'processid'],
                capture_output=True,
                text=True
            )
            
            # Parse the output to get PIDs
            lines = result.stdout.strip().split('\n')
            pids_found = False
            
            if len(lines) > 1:  # First line is header
                for line in lines[1:]:
                    if line.strip().isdigit():
                        pids_found = True
                        pid = line.strip()
                        print(f"Terminating leftover Chrome instance with PID: {pid}")
                        subprocess.run(
                            ['taskkill', '/F', '/PID', pid], 
                            check=False,
                            stderr=subprocess.PIPE,
                            stdout=subprocess.PIPE
                        )
            
            if not pids_found:
                print("No leftover Chrome processes found.")
        except Exception as e:
            print(f"Error in final Chrome cleanup: {e}")
    
    print("Chrome cleanup completed.")

if __name__ == "__main__":
    # Check if keywords exist in DB, if not create dummy data
    keywordsData = getSearchKeywords()
    if not keywordsData["noCompany"] and not keywordsData["searchList"]:
        print("No keywords found in database. Creating dummy data...")
        createDummyKeywords()
        keywordsData = getSearchKeywords()
    
    print(keywordsData)
    excludedCompanies = keywordsData["noCompany"]
    jobKeywords = keywordsData["searchList"]

    # Ensure chrome data directory exists
    if not os.path.exists(chromeDataDir):
        os.makedirs(chromeDataDir, exist_ok=True)
        print(f"'{chromeDataDir}' directory was created.")
    else:
        print(f"'{chromeDataDir}' directory already exists.")
    
    # Ensure user profile directory exists
    if not os.path.exists(chromeUserDataDir):
        os.makedirs(chromeUserDataDir, exist_ok=True)
        print(f"'{chromeUserDataDir}' directory was created.")
    else:
        print(f"'{chromeUserDataDir}' directory already exists.")

    print(f"Using Chrome user data directory: {chromeUserDataDir}")

    for keyword in jobKeywords:
        print(f"\nStarting search for keyword: {keyword}")
        
        # Initialize driver and chrome_app as None
        driver = None
        chromeApp = None
        
        try:
            # Start Chrome process
            print("Starting Chrome...")
            start_time = time.time()
            chromeApp = subprocess.Popen([
                chromeAppPath,
                f'--remote-debugging-port={debuggingPort}',
                f'--user-data-dir={chromeUserDataDir}'
            ])
            sleep(2)

            options = Options()
            options.add_experimental_option("debuggerAddress", f"localhost:{debuggingPort}")
            options.add_argument(f"webdriver.chrome.driver={chromeDriverPath}")
            options.add_argument("--disable-notifications")
            driver = webdriver.Chrome(options=options)

            searchUrl = buildLinkedinUrl(keyword.strip())
            print(searchUrl)
            driver.get(searchUrl)
            
            # Wait for initial page load
            if not waitForPageLoad(driver):
                print("Failed to load initial job listings page. Moving to next keyword.")
                continue
                
            while True:
                # Check if 8 minutes have passed
                if time.time() - start_time > 480:  # 480 seconds = 8 minutes
                    print("Session timeout reached (8 minutes). Moving to next keyword...")
                    break
                    
                sleep(4)
                try:
                    # Check for no results banner
                    driver.find_element(By.CLASS_NAME, "jobs-search-no-results-banner")
                    print("All Jobs have been scraped")
                    break
                except NoSuchElementException:
                    # Check if job listings exist on the page
                    job_listings = driver.find_elements(By.CLASS_NAME, "job-card-container--clickable")
                    if not job_listings:
                        print("No job listings found on this page. Moving to next page or keyword.")
                        break
                        
                    # Try to find and click the job list container to ensure we're on the page
                    try:
                        list_container = driver.find_element(By.CLASS_NAME, "scaffold-layout__list")
                        driver.execute_script("arguments[0].scrollIntoView();", list_container)
                        # No need to click, just make sure it's in view
                    except Exception as e:
                        print(f"Error finding list container: {e}")
                        
                    # Process the job listings
                    if not readJobListingsPage(driver, excludedCompanies):
                        print("Failed to process job listings. Moving to next page.")
                except Exception as error:
                    print(f"Error navigating page: {error}")

                # Try to navigate to the next page
                try:
                    nextButton = driver.find_element(By.CLASS_NAME, "jobs-search-pagination__button--next")
                    if nextButton.is_enabled():
                        # Use JavaScript to click the button to avoid any potential issues
                        driver.execute_script("arguments[0].click();", nextButton)
                        # Wait for the next page to load
                        sleep(3)
                    else:
                        print("Next button is disabled. No more pages to scrape.")
                        break
                except NoSuchElementException:
                    print("No more pages to scrape - Next button not found")
                    break
                except Exception as e:
                    print(f"Error clicking next button: {e}")
                    break
        except Exception as e:
            print(f"Error during scraping for keyword '{keyword}': {e}")
        finally:
            # Ensure cleanup happens regardless of any exceptions
            print("Cleaning up Chrome processes...")
            cleanupChrome(driver, chromeApp)
            
            print(f"Finished keyword: {keyword}")
            print("Waiting 30 seconds before next keyword...")
            sleep(30)
