import subprocess
from time import sleep
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from dotenv import load_dotenv
import os
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
import socket
from utils.utilsScrapingQuestions import readTheInputsFrom
import json
from pathlib import Path
from utils.utilsApplyBot import getPendingEasyApplyJobs, updateEasyApplyStatus

load_dotenv()

chromeDriverPath = os.getenv('CHROME_DRIVER_PATH')
chromeAppPath = os.getenv('CHROME_APP_PATH')
chromeUserDataDir = os.getenv('CHROME_USER_DATA_DIR')
debuggingPort = os.getenv('DEBUGGING_PORT')

def isPortInUse(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('localhost', int(port)))
            return False
        except socket.error:
            return True

def startChrome(debuggingPort, userDataDir, chromeAppPath):
    if isPortInUse(debuggingPort):
        # print(f"Chrome is already running on port {debuggingPort}, reusing existing instance...")
        return None
    
    # print("Starting new Chrome instance...")
    chromeApp = subprocess.Popen([
        chromeAppPath,
        f'--remote-debugging-port={debuggingPort}',
        f'--user-data-dir={userDataDir}'
    ])
    sleep(2)
    return chromeApp

def setupChromeDriver(debuggingPort, chromeDriverPath):
    options = Options()
    options.add_experimental_option("debuggerAddress", f"localhost:{debuggingPort}")
    options.add_argument(f"webdriver.chrome.driver={chromeDriverPath}")
    options.add_argument("--disable-notifications")
    return webdriver.Chrome(options=options)

def cleanupChrome(driver, chromeApp):
    driver.quit()
    if chromeApp is not None:
        chromeApp.terminate()
        try:
            chromeApp.wait(timeout=5)
        except subprocess.TimeoutExpired:
            # print("Force terminating Chrome...")
            chromeApp.kill()

        try:
            if os.name == 'nt':
                subprocess.run(['taskkill', '/F', '/IM', 'chrome.exe'], 
                             stdout=subprocess.DEVNULL, 
                             stderr=subprocess.DEVNULL)
            else:
                subprocess.run(['pkill', '-f', 'chrome'], 
                             stdout=subprocess.DEVNULL, 
                             stderr=subprocess.DEVNULL)
        except Exception as e:
            # print(f"Error cleaning up Chrome processes: {e}")
            pass

def loadExistingQuestions():
    questionsFile = Path('linkedinQuestions.json')
    if questionsFile.exists():
        with open(questionsFile, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def updateQuestionsFile(newQuestions, existingQuestions):
    if newQuestions is None:
        # print("Warning: No new questions to process")
        return
        
    existingSet = {(q.get('question', ''), q.get('type', '')) for q in existingQuestions}
    
    questionsAdded = 0
    for question in newQuestions:
        questionTuple = (question.get('question', ''), question.get('type', ''))
        if questionTuple not in existingSet:
            existingQuestions.append(question)
            questionsAdded += 1
            # print(f"Added new question: {question['question']}")
    
    with open('linkedinQuestions.json', 'w', encoding='utf-8') as f:
        json.dump(existingQuestions, f, indent=2, ensure_ascii=False)
    
    # print(f"Added {questionsAdded} new questions to the database.")

if __name__ == "__main__":
    chromeDataDir = os.path.join(os.getcwd(), 'chromeData')
    if not os.path.exists(chromeDataDir):
        os.makedirs(chromeDataDir)
    
    chromeApp = startChrome(debuggingPort, chromeUserDataDir, chromeAppPath)
    driver = setupChromeDriver(debuggingPort, chromeDriverPath)

    # Get all pending jobs
    pending_jobs = getPendingEasyApplyJobs()
    print(pending_jobs)
    exit()
    
    for jobId in pending_jobs:
        jobURL = f"https://www.linkedin.com/jobs/view/{jobId}/"
        status = 'STARTED'
        print(f"Processing job {jobId} with status: {status}")
        driver.get(jobURL)
        
        try:
            topCardDiv = WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.CLASS_NAME, "jobs-apply-button--top-card"))
            )
            
            existingQuestions = loadExistingQuestions()
            
            easyApplyButton = topCardDiv.find_element(By.CLASS_NAME, "jobs-apply-button")
            easyApplyButton.click()
            
            previousFormHtml = ""
            samePageCount = 0
            maxSamePageAttempts = 1
            
            while True:
                time.sleep(1)
                formModal = WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "jobs-easy-apply-modal"))
                )
                currentFormHtml = formModal.get_attribute('outerHTML')
                
                if currentFormHtml == previousFormHtml:
                    samePageCount += 1
                    if samePageCount >= maxSamePageAttempts:
                        status = 'FAILED'
                        print(f"Processing job {jobId} with status: {status}")
                        break
                else:
                    samePageCount = 0
                
                newQuestions = readTheInputsFrom(driver, existingQuestions)
                updateQuestionsFile(newQuestions, existingQuestions)
                
                previousFormHtml = currentFormHtml
                
                try:
                    footer = driver.find_element(By.TAG_NAME, "footer")
                    try:
                        # Try to find submit application button
                        submitButton = footer.find_element(By.CSS_SELECTOR, "button[aria-label='Submit application']")
                        if submitButton:
                            # Uncheck the follow company checkbox by clicking its label
                            try:
                                followLabel = driver.find_element(By.CSS_SELECTOR, "label[for='follow-company-checkbox']")
                                followCheckbox = driver.find_element(By.ID, "follow-company-checkbox")
                                if followCheckbox.is_selected():
                                    driver.execute_script("arguments[0].click();", followLabel)
                            except Exception as e:
                                pass
                            
                            # submitButton.click()
                            status = 'COMPLETED'
                            print(f"Processing job {jobId} with status: {status}")
                            break
                    except:
                        # If not submit button, look for next/review button
                        try:
                            nextButton = footer.find_element(By.CSS_SELECTOR, "button[aria-label='Continue to next step']")
                        except:
                            nextButton = footer.find_element(By.CSS_SELECTOR, "button[aria-label='Review your application']")
                        nextButton.click()
                except Exception as e:
                    status = 'FAILED'
                    print(f"Processing job {jobId} with status: {status}")
                
                if status in ['COMPLETED', 'FAILED']:
                    # Update the job status in database
                    updateEasyApplyStatus(jobId, status == 'COMPLETED')
                    print(f"Updated job {jobId} status to: {status}")
                    break
                
        except TimeoutException:
            status = 'FAILED'
            updateEasyApplyStatus(jobId, False)
            print(f"Processing job {jobId} with status: {status}")
        except Exception as e:
            status = 'FAILED'
            updateEasyApplyStatus(jobId, False)
            print(f"Error processing job {jobId}: {str(e)}")
    
    input("Press Enter to close the browser...")
    cleanupChrome(driver, chromeApp)
