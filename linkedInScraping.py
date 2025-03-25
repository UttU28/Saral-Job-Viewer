import subprocess
from time import sleep
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from utils.utilsDataScraping import checkJob, addJob, getSearchKeywords, createDummyKeywords
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import NoSuchElementException
from dotenv import load_dotenv
import os
from urllib.parse import urlencode
import pyautogui


# Load environment variables
load_dotenv()

# Environment Variables
chromeDriverPath = os.getenv('CHROME_DRIVER_PATH')
chromeAppPath = os.getenv('CHROME_APP_PATH')
chromeUserDataDir = os.getenv('SCRAPING_CHROME_DIR')
debuggingPort = os.getenv('SCRAPING_PORT')


def waitForPageLoad(driver):
    """Wait for the job listings page to load."""
    WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.CLASS_NAME, "job-card-container--clickable"))
    )

def readJobListingsPage(driver, excludedCompanies):
    """Scrape job postings from the current page."""
    currentPageData = driver.find_element(By.CLASS_NAME, "scaffold-layout__list")
    jobPostings = currentPageData.find_elements(By.CLASS_NAME, "job-card-container--clickable")

    for posting in jobPostings:
        try:
            jobId = posting.get_attribute("data-job-id")
            jobData = posting.find_element(By.CLASS_NAME, "job-card-container__link")
            jobTitle = jobData.text.strip()
            jobLink = jobData.get_attribute('href')
            companyName = posting.find_element(By.CLASS_NAME, "artdeco-entity-lockup__subtitle ").text.strip()
            jobLocation = posting.find_element(By.CLASS_NAME, "artdeco-entity-lockup__caption ").text.strip()
            applyMethod = None

            if checkJob(jobId) and companyName not in excludedCompanies:
                posting.click()
                sleep(1)
                try:
                    applyButton = driver.find_element(By.CLASS_NAME, "jobs-apply-button")
                    buttonText = applyButton.find_element(By.CLASS_NAME, "artdeco-button__text").text
                    applyMethod = 'EasyApply' if 'easy' in buttonText.lower() else 'Manual'
                except NoSuchElementException:
                    applyMethod = 'CHECK'

                jobDescription = driver.find_element(By.CLASS_NAME, "jobs-description__container").text
                addJob(jobId, jobLink, jobTitle, companyName, jobLocation, applyMethod, time.time(), 'FullTime', jobDescription, "NO")

        except Exception as e:
            print(f"Error in readJobListingsPage: {e}")


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

    chromeDataDir = os.path.join(os.getcwd(), 'chromeData')
    if not os.path.exists(chromeDataDir):
        os.makedirs(chromeDataDir)
        print(f"'{chromeDataDir}' directory was created.")
    else:
        print(f"'{chromeDataDir}' directory already exists.")

    for keyword in jobKeywords:
        print(f"\nStarting search for keyword: {keyword}")
        
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
        
        while True:
            # Check if 8 minutes have passed
            if time.time() - start_time > 480:  # 480 seconds = 8 minutes
                print("Session timeout reached (8 minutes). Moving to next keyword...")
                break
                
            sleep(4)
            try:
                driver.find_element(By.CLASS_NAME, "jobs-search-no-results-banner")
                print("All Jobs have been scraped")
                break
            except NoSuchElementException:
                screen_width, screen_height = pyautogui.size()
                click_x = screen_width // 3
                click_y = screen_height // 2
                pyautogui.click(click_x, click_y)
                readJobListingsPage(driver, excludedCompanies)
            except Exception as error:
                print(f"Error: {error}")

            try:
                nextButton = driver.find_element(By.CLASS_NAME, "jobs-search-pagination__button--next")
                nextButton.click()
            except:
                print("No more pages to scrape")
                break

        # Clean up processes before next keyword
        print("Cleaning up Chrome processes...")
        
        # Close and quit driver
        driver.quit()
        
        # Terminate Chrome process
        chromeApp.terminate()
        try:
            chromeApp.wait(timeout=5)  # Wait for normal termination
        except subprocess.TimeoutExpired:
            print("Force terminating Chrome...")
            chromeApp.kill()  # Force kill if normal termination fails
            
        # Clean up any remaining Chrome processes
        try:
            if os.name == 'nt':  # Windows
                subprocess.run(['taskkill', '/F', '/IM', 'chrome.exe'], 
                             stdout=subprocess.DEVNULL, 
                             stderr=subprocess.DEVNULL)
            else:  # Linux/Mac
                subprocess.run(['pkill', '-f', 'chrome'], 
                             stdout=subprocess.DEVNULL, 
                             stderr=subprocess.DEVNULL)
        except Exception as e:
            print(f"Error cleaning up Chrome processes: {e}")
        
        print(f"Finished keyword: {keyword}")
        print("Waiting 30 seconds before next keyword...")
        sleep(30)
