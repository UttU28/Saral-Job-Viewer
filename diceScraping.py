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
from datetime import datetime, timezone
from tqdm import tqdm
from dotenv import load_dotenv

from utils.utilsDatabase import addDiceJob

load_dotenv()

# Initialize JSON file paths
jsonFilePath = "jobsData.json"
rawFilePath = "rawData.json"

# Initialize or load existing JSON files
def initializeJsonFiles():
    if not os.path.exists(jsonFilePath):
        with open(jsonFilePath, 'w') as f:
            json.dump({}, f)
    if not os.path.exists(rawFilePath):
        with open(rawFilePath, 'w') as f:
            json.dump({}, f)

    with open(jsonFilePath, 'r') as f:
        jobsData = json.load(f)
    with open(rawFilePath, 'r') as f:
        rawData = json.load(f)
    return jobsData, rawData

# Load the JSON data
jobsData, rawData = initializeJsonFiles()

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger()

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
    except Exception as e:
        logger.error(f"Error converting time: {watch}", exc_info=e)
        return None

def getJobDescription(jobID):
    url = f"https://www.dice.com/job-detail/{jobID}"
    try:
        response = requests.get(url)
        response.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"Failed to retrieve the webpage. URL: {url}, Error: {e}", exc_info=e)
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
    except Exception as e:
        logger.error(f"Error processing job description for jobID: {jobID}", exc_info=e)
        return False


def scrapeTheJobs():
    # Move these variables to the outer scope so they're accessible
    global jobsData, rawData
    
    def checkRequirementMatching(taroText, shouldBe, shouldNot):
        for temp1 in shouldBe:
            if temp1 in taroText:
                for temp2 in shouldNot:
                    if temp2 in taroText:
                        return False
                return True
        return False
    def writeTheJob(jobID, title, location, company, empType):
        if jobID not in rawData:
            currentTime = int(datetime.now(timezone.utc).timestamp())
            jobsData[jobID] = currentTime
            rawData[jobID] = currentTime
            jdData = getJobDescription(jobID)
            # Save rawData immediately after new job is found
            with open(rawFilePath, 'w', encoding='utf-8') as jsonFile:
                json.dump(rawData, jsonFile, ensure_ascii=False, indent=4)
            if jdData:
                description, datePosted, dateUpdated = jdData
                checkRequirements = checkRequirementMatching(description, contentIn, contentOut)
                if checkRequirements:
                    # Save jobsData only if requirements match
                    with open(jsonFilePath, 'w', encoding='utf-8') as jsonFile:
                        json.dump(jobsData, jsonFile, ensure_ascii=False, indent=4)
                    jobType = "Contract" if empType == "CONTRACTS" else "FullTime"
                    return addDiceJob(jobID, title, company, location, "EasyApply", dateUpdated, jobType, description, "NO")
        return False

    options = Options()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-notifications")
    options.add_argument("--incognito")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-popup-blocking")
    options.add_argument("--disable-infobars")
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)

    jobKeyWords = ['Python developer', 'software engineer', 'Django Flask', 'Python LLM']
    employmentType = ['CONTRACTS', 'FULLTIME']
    passCount = 0

    for jobKeyWord in jobKeyWords:
        for empType in employmentType:
            page = 1
            has_more_pages = True
            
            while has_more_pages:
                try:
                    url = f"https://www.dice.com/jobs?q={jobKeyWord.replace(' ','%20')}&countryCode=US&radius=30&radiusUnit=mi&page={page}&pageSize=100&filters.postedDate=ONE&filters.employmentType={empType}&filters.easyApply=true&language=en"
                    logger.info(f"Fetching jobs for keyword: {jobKeyWord} - Type: {empType} - Page {page}")
                    driver.get(url)
                    try:
                        WebDriverWait(driver, 10).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, 'div.card.search-card, p.no-jobs-message'))
                        )
                    except Exception as e:
                        logger.error("Error waiting for data to load", exc_info=e)
                    sleep(1)
                    
                    pageSource = driver.page_source
                    soup = BeautifulSoup(pageSource, 'html.parser')

                    # Check if we've hit the no results page
                    no_results = soup.select_one('p.no-jobs-message')
                    if no_results:
                        logger.info(f"No more results found for {jobKeyWord} after page {page-1}")
                        has_more_pages = False
                        break

                    currentElements = soup.select('div.card.search-card')
                    if not currentElements:
                        logger.info(f"No job cards found for {jobKeyWord} on page {page}")
                        has_more_pages = False
                        break

                    logger.info(f"Found {len(currentElements)} jobs for {jobKeyWord} on page {page}")
                    
                    # Process jobs for current page
                    for element in tqdm(currentElements, desc=f"Processing {jobKeyWord} jobs - Type: {empType} - Page {page}"):
                        try:
                            if element.find('div', {'data-cy': 'card-easy-apply'}):
                                jobID = element.select('a.card-title-link')[0].get('id').strip()
                                location = element.select('span.search-result-location')[0].text.strip()
                                title = element.select('a.card-title-link')[0].text.strip()
                                company = element.select('[data-cy="search-result-company-name"]')[0].text.strip()
                                if writeTheJob(jobID, title, location, company, empType):
                                    passCount += 1
                        except Exception as e:
                            logger.error("Error processing job", exc_info=e)
                    
                    # Move to next page
                    page += 1
                    
                except Exception as e:
                    logger.error(f"Error fetching data for {jobKeyWord} on page {page}", exc_info=e)
                    has_more_pages = False
            
            # Clean and save data after finishing all pages for current employment type
            logger.info(f"Data cleaned and saved after processing all pages for {jobKeyWord} - {empType}")

    driver.quit()
    logger.info(f"Total PASS COUNT = {passCount}")

if __name__ == "__main__":
    scrapeTheJobs()
