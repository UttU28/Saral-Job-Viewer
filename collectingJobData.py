import subprocess
from time import sleep
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import pyautogui as py
from addToJSON import checkAndAdd
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import NoSuchElementException


chrome_driver_path = "C:/chromeDriver/chromedriver.exe"
subprocess.Popen(['C:/Program Files/Google/Chrome/Application/chrome.exe', '--remote-debugging-port=8989', '--user-data-dir=C:/chromeDriver/tempData/'])
# subprocess.Popen(['C:/Program Files/Google/Chrome/Application/chrome.exe', '--remote-debugging-port=8989', '--user-data-dir=C:/chromeDriver/linkedInData/'])
sleep(2)
options = Options()
options.add_experimental_option("debuggerAddress", "localhost:8989")

# options.add_argument("--start-maximized")
options.add_argument(f"webdriver.chrome.driver={chrome_driver_path}")
options.add_argument("--disable-notifications")
driver = webdriver.Chrome(options=options)

driver.get(input("LinkedIn Job Link: "))
def pageLoadHoneDe(driver1, classToFind):
    WebDriverWait(driver1, 30).until(
        EC.presence_of_element_located((By.CLASS_NAME, classToFind))
    )

def readingBhawishyawaniPage(driver1):
    currentPageData = driver1.find_element(By.CSS_SELECTOR, "#main > div.scaffold-layout__list-detail-inner > div.scaffold-layout__list > div > ul")
    jobPostings = currentPageData.find_elements(By.CLASS_NAME, "job-card-container--clickable")
    print(len(jobPostings))

    for posting in jobPostings:
        timeStamp = time.time()
        try:
            id = posting.get_attribute("data-job-id")
            state = posting.find_element(By.CLASS_NAME, "job-card-container__footer-item").text.strip().lower()
            if state == "applied":
                checkAndAdd(id, link, title, state, companyName, location, "EasyApply", timeStamp, timeStamp, "Applied", "No")
                pass
            else:
                data = posting.find_element(By.CLASS_NAME, "job-card-container__link")
                title = data.text.strip()
                link = data.get_attribute('href')
                companyName = posting.find_element(By.CLASS_NAME, "job-card-container__primary-description ").text.strip()
                location = posting.find_element(By.CLASS_NAME, "job-card-container__metadata-item ").text.strip()
                try:
                    if posting.find_element(By.CLASS_NAME, "job-card-container__apply-method"):
                        print(id, title, companyName, "EasyApply")
                        checkAndAdd(id, link, title, state, companyName, location, "EasyApply", timeStamp, "NoTime", "NotApplied", "No")
                    else:
                        print(id, title, companyName, "Manual", "else")
                        checkAndAdd(id, link, title, state, companyName, location, "Manual", timeStamp, "NoTime", "NotApplied", "No")
                except:
                    print(id, title, companyName, "Manual")
                    checkAndAdd(id, link, title, state, companyName, location, "Manual", timeStamp, "NoTime", "NotApplied", "No")
        except Exception as e:
            print(f"Error in readingBhawishyawaniPage")

def scrollToSpecific(distance, sleepTime, rangeNo):
    print("Scrolled")
    py.moveTo(500, 500)
    for _ in range(rangeNo):
        py.scroll(distance)
        sleep(sleepTime)

if __name__ == "__main__":
    currentPage = 0
    scrollToSpecific(distance=-800, sleepTime=1, rangeNo=10)
    sleep(2)
    # scrollToSpecific(distance=800, sleepTime=0.4, rangeNo=10)

    readingBhawishyawaniPage(driver)

    for i in range(5):
        pagingData = driver.find_element(By.CLASS_NAME, "jobs-search-results-list__pagination")
        allPages = pagingData.find_elements(By.TAG_NAME, "button")
        print("Current page", i+2)
        for ii in range(len(allPages)):
            if allPages[ii].text == str(i+2):
                allPages[ii].click()
                sleep(5)
                scrollToSpecific(distance=-800, sleepTime=1, rangeNo=10)
                sleep(2)
                readingBhawishyawaniPage(driver)
                break


driver.quit()
