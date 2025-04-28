import logging
from time import sleep
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup
import requests
import json, os
import signal
import sys
from datetime import datetime, timezone
from tqdm import tqdm
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, String, Text, Integer, DateTime, Float, Boolean, Table, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import subprocess

from utils.utilsDatabase import addDiceJob, DbConfig, getSession
from utils.utilsDataScraping import getDiceSearchKeywords, createDiceDummyKeywords

load_dotenv()

# Setup database connection
dbConfig = DbConfig()

# Initialize logger
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger()

# Initialize metadata
Base = declarative_base()
metadata = MetaData()

# RawDiceJobs model to store raw job data
class RawDiceJob(Base):
    __tablename__ = 'diceRawJobs'
    
    jobId = Column(String(255), primary_key=True)
    timestamp = Column(Float, nullable=False)
    processed = Column(Boolean, default=False)
    
    def __repr__(self):
        return f"<RawDiceJob(jobId='{self.jobId}', timestamp='{self.timestamp}', processed={self.processed})>"

# Create tables if they don't exist
Base.metadata.create_all(create_engine(dbConfig.connectionUrl))

# Initialize parameters for job filtering
contentOut = [
    "security clearance", "security-clearance", 
    "us citizenship", "us citizen", "citizenship required", "residency required", "residence required",
    "4+ years", "5+ years", "6+ years", "7+ years", "8+ years", "9+ years", "10+ years", "11+ years", "12+ years",
    "green card required", "permanent resident", "work authorization required"
]

contentIn = [
    "python", "full-stack", "fullstack", "backend", "frontend", "web development", 
    "FastAPI", "Flask", "Django", "Node.js", "React", "Next.js", "TypeScript", 
    "devops", "pipeline", "pipelines", "azure", "aws", "cloud", "cloud engineer", 
    "cloud developer", "terraform", "ansible", "cicd", "ci-ci", "ci/cd", "kubernetes", 
    "ETL", "data scraping", "automation", "bot", "scraper", "web scraping", "beautifulsoup", "selenium", 
    "data engineering", "data pipelines", "big data", "airflow", "spark", "hadoop", "stream processing", 
    "ml", "machine learning", "llm", "fine-tuning", "transformers", "huggingface", "nlp", "artificial intelligence",
    "deep learning", "model training", "vector databases", "retrieval augmented generation", "rag pipeline"
]

def bhaiTimeKyaHai(watch):
    try:
        watch = datetime.strptime(watch, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
        timeHai = int(watch.timestamp())
        return timeHai
    except Exception:
        return None

def getJobDescription(jobID):
    url = f"https://www.dice.com/job-detail/{jobID}"
    try:
        response = requests.get(url)
        response.raise_for_status()
    except requests.RequestException:
        return False

    try:
        htmlContent = response.text
        soup = BeautifulSoup(htmlContent, 'html.parser')
        scriptTag = soup.select('script#__NEXT_DATA__')[0].text
        data = json.loads(scriptTag)
        thisData = data["props"]["pageProps"]["initialState"]["api"]["queries"][f'getJobById("{jobID}")']["data"]

        jobDescription = thisData["description"]
        datePosted = bhaiTimeKyaHai(thisData["datePosted"])
        dateUpdated = bhaiTimeKyaHai(thisData["dateUpdated"])
        jobDescription = BeautifulSoup(jobDescription, 'html.parser').prettify()
        jobDescription = BeautifulSoup(jobDescription, 'html.parser').get_text().split("\n")
        jobDescription = " \n".join([element.strip() for element in jobDescription if element != ''])
        return jobDescription, datePosted, dateUpdated
    except Exception:
        return False

# Function to check if a job exists in the database
def jobExists(jobId):
    session = getSession()
    try:
        existingJob = session.query(RawDiceJob).filter_by(jobId=jobId).first()
        return existingJob is not None
    except Exception:
        return False
    finally:
        session.close()

# Function to add a job to the raw jobs database
def addRawJob(jobId, timestamp):
    session = getSession()
    try:
        newJob = RawDiceJob(jobId=jobId, timestamp=timestamp, processed=False)
        session.add(newJob)
        session.commit()
        return True
    except Exception:
        session.rollback()
        return False
    finally:
        session.close()

# Function to mark a job as processed
def markJobAsProcessed(jobId):
    session = getSession()
    try:
        job = session.query(RawDiceJob).filter_by(jobId=jobId).first()
        if job:
            job.processed = True
            session.commit()
            return True
        return False
    except Exception:
        session.rollback()
        return False
    finally:
        session.close()

# Function to ensure Chrome is completely terminated
def cleanupChrome(driver, service_instance=None):
    """Ensure Chrome is properly terminated."""
    # Close the driver
    if driver:
        try:
            driver.quit()
        except Exception:
            pass
    
    # Stop the service
    if service_instance:
        try:
            service_instance.stop()
        except Exception:
            pass
    
    # On Windows, look for any Chrome WebDriver processes that might be leftover
    if os.name == 'nt':  # Windows
        try:
            # Kill any chromedriver processes that might be leftover
            subprocess.run(
                ['taskkill', '/F', '/IM', 'chromedriver.exe'], 
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False
            )
            
            # Find headless Chrome processes
            result = subprocess.run(
                ['wmic', 'process', 'where', 
                 "commandline like '%--headless%'", 
                 'get', 'processid'],
                capture_output=True,
                text=True,
                check=False
            )
            
            # Parse the output to get PIDs
            lines = result.stdout.strip().split('\n')
            
            if len(lines) > 1:  # First line is header
                for line in lines[1:]:
                    if line.strip().isdigit():
                        pid = line.strip()
                        subprocess.run(
                            ['taskkill', '/F', '/PID', pid], 
                            check=False,
                            stderr=subprocess.PIPE,
                            stdout=subprocess.PIPE
                        )
        except Exception:
            pass

def scrapeTheJobs():
    def checkRequirementMatching(taroText, shouldBe, shouldNot):
        for temp1 in shouldBe:
            if temp1 in taroText.lower():
                for temp2 in shouldNot:
                    if temp2 in taroText.lower():
                        return False
                return True
        return False
        
    def writeTheJob(jobID, link, title, location, company, empType):
        """Process a job and add it to the database if it meets requirements"""
        try:
            # Skip if job already exists
            if jobExists(jobID):
                return False
                
            # Add to raw jobs database
            currentTime = int(datetime.now(timezone.utc).timestamp())
            if not addRawJob(jobID, currentTime):
                return False
                
            # Get and process job description
            jdData = getJobDescription(jobID)
            if not jdData:
                return False
                
            description, datePosted, dateUpdated = jdData
            
            # Check if job meets content requirements
            if not checkRequirementMatching(description, contentIn, contentOut):
                return False
                
            # Determine job type and add to database
            jobType = "Contract" if empType == "CONTRACTS" else "FullTime"
            if addDiceJob(jobID, link, title, company, location, "EasyApply", dateUpdated, jobType, description, "NO"):
                markJobAsProcessed(jobID)
                return True
                
            return False
        except Exception:
            return False

    # Initialize driver and service before the try block
    driver = None
    service = None
    
    try:
        options = Options()
        options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-notifications")
        options.add_argument("--incognito")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-popup-blocking")
        options.add_argument("--disable-infobars")
        
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)

        # Get keywords from database
        keywordsData = getDiceSearchKeywords()
        if not keywordsData["noCompany"] and not keywordsData["searchList"]:
            print("No dice keywords found in database. Creating dummy data...")
            createDiceDummyKeywords()
            keywordsData = getDiceSearchKeywords()
        
        print(f"Using dice keywords: {keywordsData}")
        excludedCompanies = keywordsData["noCompany"]
        jobKeyWords = keywordsData["searchList"]
        
        employmentType = ['CONTRACTS', 'FULLTIME']
        passCount = 0
        totalJobsProcessed = 0
        
        # Track jobs by type for summary
        job_stats = {
            "by_keyword": {},
            "by_employment": {
                "CONTRACTS": {"success": 0, "total": 0},
                "FULLTIME": {"success": 0, "total": 0}
            }
        }
        
        # Initialize keyword stats
        for keyword in jobKeyWords:
            job_stats["by_keyword"][keyword] = {"success": 0, "total": 0}

        for jobKeyWord in jobKeyWords:
            for empType in employmentType:
                page = 1
                has_more_pages = True
                
                while has_more_pages:
                    try:
                        url = f"https://www.dice.com/jobs?q={jobKeyWord.replace(' ','%20')}&countryCode=US&radius=30&radiusUnit=mi&page={page}&pageSize=100&filters.postedDate=ONE&filters.employmentType={empType}&filters.easyApply=true&language=en"
                        driver.get(url)
                        try:
                            WebDriverWait(driver, 10).until(
                                EC.presence_of_element_located((By.CSS_SELECTOR, 'div.card.search-card, p.no-jobs-message'))
                            )
                        except Exception:
                            pass
                        sleep(1)
                        
                        pageSource = driver.page_source
                        soup = BeautifulSoup(pageSource, 'html.parser')

                        # Check if we've hit the no results page
                        no_results = soup.select_one('p.no-jobs-message')
                        if no_results:
                            has_more_pages = False
                            break

                        currentElements = soup.select('div.card.search-card')
                        if not currentElements:
                            has_more_pages = False
                            break

                        # Initialize counters for this page
                        page_success = 0
                        page_fail = 0
                        page_total = len(currentElements)
                        
                        # Process jobs for current page
                        for element in tqdm(currentElements, desc=f"Processing {jobKeyWord} jobs - Type: {empType} - Page {page}"):
                            try:
                                if element.find('div', {'data-cy': 'card-easy-apply'}):
                                    jobID = element.select('a.card-title-link')[0].get('id').strip()
                                    location = element.select('span.search-result-location')[0].text.strip()
                                    title = element.select('a.card-title-link')[0].text.strip()
                                    company = element.select('[data-cy="search-result-company-name"]')[0].text.strip()
                                    link = f"https://www.dice.com/job-detail/{jobID}"
                                    
                                    totalJobsProcessed += 1
                                    if writeTheJob(jobID, link, title, location, company, empType):
                                        passCount += 1
                                        page_success += 1
                                    else:
                                        page_fail += 1
                            except Exception:
                                page_fail += 1
                            
                        # Print summary for this page
                        print(f"\nSummary for {jobKeyWord} - {empType} - Page {page}:")
                        print(f"  Success: {page_success} | Failed: {page_fail} | Total: {page_total}")
                        print(f"  Progress: {passCount}/{totalJobsProcessed} jobs added successfully overall\n")
                        
                        # Move to next page
                        page += 1
                        
                    except Exception:
                        has_more_pages = False
                
    except Exception as e:
        logger.error(f"An error occurred during scraping: {e}")
    finally:
        # Safely close the driver without killing other Chrome processes
        cleanupChrome(driver, service)
        print(f"\n===== FINAL SUMMARY =====")
        print(f"Total jobs processed: {totalJobsProcessed}")
        print(f"Total jobs successfully added: {passCount}")
        print(f"Success rate: {(passCount/totalJobsProcessed)*100:.2f}% (if jobs were processed)" if totalJobsProcessed > 0 else "No jobs processed")

# Function to run scraping in visible command prompt
def run_in_background():
    """
    Run the Dice scraping process in a visible command prompt
    """
    # Get the current script path
    script_path = os.path.abspath(__file__)
    
    # Start the process in a visible window
    if os.name == 'nt':  # Windows
        # Use regular python.exe to get a visible window
        python_exe = sys.executable
        
        # Start in a new visible command prompt window
        subprocess.Popen(
            ['start', 'cmd', '/k', python_exe, script_path],
            shell=True  # Required for 'start' command
        )
    else:  # Linux/Mac
        # Use xterm or gnome-terminal based on availability
        try:
            # Try gnome-terminal first
            subprocess.Popen(['gnome-terminal', '--', sys.executable, script_path])
        except FileNotFoundError:
            try:
                # Try xterm if gnome-terminal isn't available
                subprocess.Popen(['xterm', '-e', f"{sys.executable} {script_path}"])
            except FileNotFoundError:
                # Fallback to regular terminal
                subprocess.Popen(
                    [sys.executable, script_path],
                    start_new_session=True
                )
    
    return True

if __name__ == "__main__":
    # Run directly rather than being imported
    # Set up logging to file since we're running in the background
    log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dice_scraping.log')
    logging.basicConfig(
        filename=log_file,
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    logger = logging.getLogger()
    
    # Log start of scraping
    logger.info("Starting Dice job scraping")
    
    try:
        scrapeTheJobs()
        logger.info("Dice job scraping completed successfully")
    except Exception as e:
        logger.error(f"Error during Dice job scraping: {e}")
        raise 