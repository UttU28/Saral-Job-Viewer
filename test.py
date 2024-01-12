import subprocess
from time import sleep
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import pyautogui as py
import time
from addToJSON import checkAndAdd
 


chrome_driver_path = "C:/chromeDriver/chromedriver.exe"
subprocess.Popen(['C:/Program Files/Google/Chrome/Application/chrome.exe', '--remote-debugging-port=8989', '--user-data-dir=C:/chromeDriver/chromeData/'])
sleep(2)

options = Options()
options.add_experimental_option("debuggerAddress", "localhost:8989")
options.add_argument(f"webdriver.chrome.driver={chrome_driver_path}")
options.add_argument("--disable-notifications")
driver = webdriver.Chrome(options=options)

# driver.get("https://www.linkedin.com/jobs/search/?currentJobId=3794059232&distance=25.0&f_E=1%2C2%2C3&f_JT=F%2CP%2CI&f_T=9%2C25169%2C39%2C30006%2C25194%2C2732&f_WT=1%2C3%2C2&geoId=103644278&keywords=python%20developer&origin=JOB_SEARCH_PAGE_JOB_FILTER&sortBy=R")
driver.get("https://www.linkedin.com/jobs/search/?currentJobId=3778956671&distance=25.0&geoId=103644278&keywords=python%20developer&origin=JOB_SEARCH_PAGE_JOB_FILTER&sortBy=R")

if __name__ == "__main__":
    py.moveTo(500,500)
    for i in range(5):
        py.scroll(-5000)
        sleep(0.5)

    sleep(2)

    currentPageData = driver.find_element(By.CSS_SELECTOR, "#main > div.scaffold-layout__list-detail-inner > div.scaffold-layout__list > div > ul")
    jobPostings = currentPageData.find_elements(By.CLASS_NAME, "job-card-container--clickable")
    print(len(jobPostings))

    index = -1
    
    for posting in jobPostings:
        timeStamp = time.time()
        thisPageEasyApply = {}
        thisPageMajooriApply = {}
        try:
            id = posting.get_attribute("data-job-id")
            # Condition checking of job ID already handled in past, by checkoing in database

            state = posting.find_element(By.CLASS_NAME, "job-card-container__footer-item").text.strip().lower()
            # print(state)
            # continue
            if state == "applied":
                # Check in database and add the data to the database
                checkAndAdd(id, link, title, state, companyName, location, "EasyApply", timeStamp, timeStamp, "Applied", "No")
                pass
            else:

                data = posting.find_element(By.CLASS_NAME, "job-card-container__link")
                title = data.text.strip()
                link = data.get_attribute('href')
                companyName = posting.find_element(By.CLASS_NAME, "job-card-container__primary-description ").text.strip()
                location = posting.find_element(By.CLASS_NAME, "job-card-container__metadata-item ").text.strip()

                # print(title, link)
                # print(companyName, location)
                # CHecking if the foram is Easy Apply
                try:
                    if posting.find_element(By.CLASS_NAME, "job-card-container__apply-method"):
                        checkAndAdd(id, link, title, state, companyName, location, "EasyApply", timeStamp, "NoTime", "NotApplied", "No")
                except:
                    # If not EASY APPLY, save it to dir for manual labor 
                    checkAndAdd(id, link, title, state, companyName, location, "Manual", timeStamp, "NoTime", "NotApplied", "No")
                
                # driver.execute_script('window.open("{link}","_blank");'.format(link=link))

        except Exception as e:
            print("Error:", e)
            break

        index += 1
driver.quit()
