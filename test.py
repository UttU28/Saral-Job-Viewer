import subprocess
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
import pyautogui as py

chrome_driver_path = "C:/chromeDriver/chromedriver.exe"
subprocess.Popen(['C:/Program Files/Google/Chrome/Application/chrome.exe', '--remote-debugging-port=8989', '--user-data-dir=C:/chromeDriver/chromeData/'])
time.sleep(2)

options = Options()
options.add_experimental_option("debuggerAddress", "localhost:8989")
options.add_argument(f"webdriver.chrome.driver={chrome_driver_path}")
options.add_argument("--disable-notifications")
driver = webdriver.Chrome(options=options)

driver.get("https://www.linkedin.com/jobs/search/?currentJobId=3794059232&distance=25.0&f_E=1%2C2%2C3&f_JT=F%2CP%2CI&f_T=9%2C25169%2C39%2C30006%2C25194%2C2732&f_WT=1%2C3%2C2&geoId=103644278&keywords=python%20developer&origin=JOB_SEARCH_PAGE_JOB_FILTER&sortBy=R")

for i in range(5):
    py.scroll(-5000)
    time.sleep(0.5)

currentPageData = driver.find_element(By.CSS_SELECTOR, "#main > div.scaffold-layout__list-detail-inner > div.scaffold-layout__list > div > ul")
list_items = currentPageData.find_elements(By.TAG_NAME, "li")

for item in list_items:
    print(item.text)

driver.quit()
