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
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import socket
from utils.utilsScrapingQuestions import readTheInputsFrom
import json
from pathlib import Path
from utils.utilsApplyBot import getPendingEasyApplyJobs, updateEasyApplyStatus

load_dotenv()

chromeDriverPath = os.getenv('CHROME_DRIVER_PATH')
chromeAppPath = os.getenv('CHROME_APP_PATH')
chromeUserDataDir = os.getenv('APPLYING_CHROME_DIR')
debuggingPort = os.getenv('APPLYING_PORT')
questionsJson = os.getenv('QUESTIONS_JSON')

def isPortInUse(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('localhost', int(port)))
            return False
        except socket.error:
            return True

def startChrome(debuggingPort, userDataDir, chromeAppPath):
    if isPortInUse(debuggingPort):
        return None
    
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
        except Exception:
            pass

def processJob(driver, jobId, jobURL):
    status = 'STARTED'
    try:
        driver.get(jobURL)
        time.sleep(2)
        
        # Check if already applied
        try:
            submitted_resume = driver.find_element(By.CSS_SELECTOR, "a[aria-label='Download your submitted resume']")
            if submitted_resume and "Submitted resume" in submitted_resume.text:
                status = 'ALREADY'
                updateEasyApplyStatus(jobId, status)
                return status
        except NoSuchElementException:
            pass
        
        # Check if no longer available
        try:
            error_div = driver.find_element(By.CLASS_NAME, "jobs-details-top-card__apply-error")
            error_message = error_div.find_element(By.CLASS_NAME, "artdeco-inline-feedback__message").text
            
            if "No longer accepting applications" in error_message:
                status = 'NOTAVAIL'
                updateEasyApplyStatus(jobId, status)
                return status
        except NoSuchElementException:
            pass
        
        existingQuestions = loadExistingQuestions()
        
        try:
            topCardDiv = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, "jobs-apply-button--top-card"))
            )
            
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
                        status = 'RESUBMIT'
                        break
                else:
                    samePageCount = 0
                
                newQuestions = readTheInputsFrom(driver, existingQuestions)
                updateQuestionsFile(newQuestions, existingQuestions)
                
                previousFormHtml = currentFormHtml
                
                try:
                    footer = driver.find_element(By.TAG_NAME, "footer")
                    try:
                        submitButton = footer.find_element(By.CSS_SELECTOR, "button[aria-label='Submit application']")
                        if submitButton:
                            try:
                                followLabel = driver.find_element(By.CSS_SELECTOR, "label[for='follow-company-checkbox']")
                                followCheckbox = driver.find_element(By.ID, "follow-company-checkbox")
                                if followCheckbox.is_selected():
                                    driver.execute_script("arguments[0].click();", followLabel)
                            except Exception:
                                pass
                            
                            submitButton.click()
                            try:
                                success_message = WebDriverWait(driver, 5).until(
                                    EC.presence_of_element_located((By.CLASS_NAME, "artdeco-modal__content"))
                                )
                                if "Your application was sent" in success_message.text:
                                    status = 'COMPLETED'
                                else:
                                    status = 'RESUBMIT'
                            except TimeoutException:
                                status = 'RESUBMIT'
                            break
                    except:
                        try:
                            nextButton = footer.find_element(By.CSS_SELECTOR, "button[aria-label='Continue to next step']")
                        except:
                            nextButton = footer.find_element(By.CSS_SELECTOR, "button[aria-label='Review your application']")
                        nextButton.click()
                except Exception:
                    status = 'RESUBMIT'
        except TimeoutException:
            status = 'FAILED'
    except Exception:
        status = 'FAILED'
    
    updateEasyApplyStatus(jobId, status)
    return status

def loadExistingQuestions():
    questionsFile = Path(questionsJson)
    if questionsFile.exists():
        with open(questionsFile, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def updateQuestionsFile(newQuestions, existingQuestions):
    if newQuestions is None:
        # print("Warning: No new questions to process")
        return
        
    existingSet = {(q.get('question', ''), q.get('type', '')) for q in existingQuestions}
    
    for question in newQuestions:
        questionTuple = (question.get('question', ''), question.get('type', ''))
        if questionTuple not in existingSet:
            existingQuestions.append(question)
            # print(f"Added new question: {question['question']}")
    
    with open(questionsJson, 'w', encoding='utf-8') as f:
        json.dump(existingQuestions, f, indent=2, ensure_ascii=False)
    
    # print(f"Added new questions to the database.")

if __name__ == "__main__":
    try:
        chromeApp = startChrome(debuggingPort, chromeUserDataDir, chromeAppPath)
        driver = setupChromeDriver(debuggingPort, chromeDriverPath)
        
        pending_jobs = getPendingEasyApplyJobs()
        
        for jobId in pending_jobs:
            jobURL = f"https://www.linkedin.com/jobs/view/{jobId}/"
            processJob(driver, jobId, jobURL)
        
        input("Press Enter to close the browser...")
    except Exception as e:
        print(f"Error in main execution: {str(e)}")
    finally:
        if 'driver' in locals():
            cleanupChrome(driver, chromeApp)
