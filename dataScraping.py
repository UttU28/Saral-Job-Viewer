import subprocess
from time import sleep
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import pyautogui as py
from addToJSON import *
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import NoSuchElementException


def pageLoadHoneDe(driver1):
    WebDriverWait(driver1, 10).until(
        EC.presence_of_element_located((By.CLASS_NAME, "job-card-container--clickable"))
    )

def readingBhawishyawaniPage(driver1):
    currentPageData = driver1.find_element(By.CLASS_NAME, "scaffold-layout__list-container")
    jobPostings = currentPageData.find_elements(By.CLASS_NAME, "job-card-container--clickable")
    print(len(jobPostings))

    for posting in jobPostings:
        # try:
            # posting.click()
            id = posting.get_attribute("data-job-id")
            data = posting.find_element(By.CLASS_NAME, "job-card-container__link")
            title = data.text.strip()
            link = data.get_attribute('href')
            companyName = posting.find_element(By.CLASS_NAME, "job-card-container__primary-description ").text.strip()
            location = posting.find_element(By.CLASS_NAME, "job-card-container__metadata-item ").text.strip()
            applyMethod = None

            try:
                thisButton = posting.find_element(By.CLASS_NAME, "job-card-container__apply-method")
                if thisButton:
                    applyMethod = 'Manual'
            except NoSuchElementException:
                applyMethod = 'EasyApply'
            if checkBhawishyaWani(id):
                posting.click()
                sleep(1.5)
                jobType = driver.find_element(By.CSS_SELECTOR, 'li.job-details-jobs-unified-top-card__job-insight').text
                jobDescription = driver.find_element(By.CLASS_NAME, "jobs-description-content__text").text
                addBhawishyaWani(id, link, title, companyName, location, applyMethod, time.time(), jobType, jobDescription)

        # except Exception as e:
        #     print(f"Error in readingBhawishyawaniPage: {e}")

def scrollToSpecific(distance):
    sleepTime = 0.4
    rangeNo = 2
    print("Scrolled")
    screenX, screenY = py.size()
    py.moveTo(screenX//3, screenY//2)
    for _ in range(rangeNo):
        py.scroll(distance)
        sleep(sleepTime)

if __name__ == "__main__":
    chrome_driver_path = 'C:/chromeDriver/chromedriver.exe'  # Ensure the path is correct
    chromeApp = subprocess.Popen(['C:/Program Files/Google/Chrome/Application/chrome.exe', '--remote-debugging-port=9003', '--user-data-dir=C:/chromeDriver/letsCheck/'])
    sleep(2)
    options = Options()
    options.add_experimental_option("debuggerAddress", "localhost:9003")
    options.add_argument(f"webdriver.chrome.driver={chrome_driver_path}")
    options.add_argument("--disable-notifications")
    driver = webdriver.Chrome(options=options)

    myList = ["devops*", "cloud engineer", "cloud architect", "site reliability", "platform engineer", "aws", "azure"]
    for eachElement in myList:
        currentPage = 0
        searchText = eachElement.strip().replace(" ","%20")
        print(searchText)
        while True:
            pageURL = f"https://www.linkedin.com/jobs/search/?&distance=25.0&f_JT=F%2CC&f_T=25764%2C30006%2C6483%2C22848%2C25165&f_TPR=r86400&geoId=103644278&keywords={searchText}&origin=JOB_SEARCH_PAGE_SEARCH_BUTTON&refresh=true&sortBy=DD&spellCorrectionEnabled=true&start="
            driver.get(pageURL+str(currentPage*25))
            currentPage += 1
            sleep(3)
            try: 
                driver.find_element(By.CLASS_NAME, "jobs-search-no-results-banner")
                print("All Jobs have been scraped")
                break
            except:
                scrollToSpecific(-800)
                sleep(1)
                scrollToSpecific(800)

                readingBhawishyawaniPage(driver)

    chromeApp.terminate()
    driver.quit()
