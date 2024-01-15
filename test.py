import json
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
from random import randint
from selenium.webdriver.support.ui import Select
from datetime import datetime

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

def buttonLoadHoneDe(driver1, classToFind): WebDriverWait(driver1, 30).until(EC.element_to_be_clickable((By.CLASS_NAME, classToFind)))
    
def saveDataToFile(formData):
    try:
        with open('data.json', 'r') as fp:
            existing_data = json.load(fp)
    except FileNotFoundError:
        existing_data = {}

    for key, value in formData.items():
        if key not in existing_data:
            existing_data[key] = value

    with open('data.json', 'w') as fp:
        json.dump(existing_data, fp, indent=4)
    
def readingAndFillingForm(driver1, form_data):

    try:
        with open('data.json', 'r') as fp:
            existing_data = json.load(fp)
    except FileNotFoundError:
        existing_data = {}

    
    form_content = driver1.find_element(By.CLASS_NAME, "jobs-easy-apply-content")
    form_sections = form_content.find_elements(By.CLASS_NAME, "jobs-easy-apply-form-section__grouping")

    print(len(form_sections))
    # Write a condition that checks the text of all the buttons present inside the <footer> tag, and if there is next then add the data to form_data and press next and keep doing and adding data to from_data until you reach "review" instead of "next"
    for section in form_sections:
        # print(question_label.split("\n")[-1])
        try:
            form_element = section.find_element(By.CSS_SELECTOR, "[data-test-form-element]")
            question_label = section.find_element(By.CLASS_NAME, "fb-dash-form-element__label-title--is-required").text.split("\n")[-1]
            try:
                select = form_element.find_element(By.TAG_NAME, "select")
                if select:
                    options = [option.text for option in form_element.find_elements(By.TAG_NAME, "option")]
                    selected_answer = form_element.find_element(By.CSS_SELECTOR, "option:checked").text
                    # print(selected_answer, "selected Ansertr")
                    if question_label in existing_data:
                        finalAnswer = existing_data[question_label]["answer"]
                        # print("JSK", selected_answer, finalAnswer)
                        if finalAnswer == selected_answer:
                            # print("SAME ANSWER")
                            continue
                        else:
                            Select(select).select_by_visible_text(finalAnswer)
                            # print("Different Answer")
                    form_data[question_label] = {
                        "options": options,
                        "answer": selected_answer
                    }
                    continue
            except: pass
            try:
                if "Resume" in section.text:
                    resume_container = section.find_element(By.CLASS_NAME, "jobs-document-upload-redesign-card__container")
                    resume_name = resume_container.find_element(By.CLASS_NAME, "jobs-document-upload-redesign-card__file-name").text
                    resume_uploaded_date = resume_container.find_element(By.CLASS_NAME, "pt1.t-12.t-black--light").text
                    form_data["Resume"] = {
                        "Resume Name": resume_name,
                        "Uploaded Date": resume_uploaded_date
                    }
                    continue
            except: pass
        except:
            form_element = section.find_element(By.CSS_SELECTOR, "[data-test-form-element]")
            try:
                if form_element.find_element(By.TAG_NAME, "fieldset"):
                    options = [label.find_element(By.TAG_NAME, "input").get_attribute("value") for label in form_element.find_elements(By.CLASS_NAME, "fb-text-selectable__option")]
                    selected_answer = form_element.find_element(By.CSS_SELECTOR, "input:checked").get_attribute("data-test-text-selectable-option__input")
                    for key, value in existing_data.items():
                        if "options" in value and value["options"] == options:
                            # print(f"The key is: {key, value}")
                            if selected_answer == value["answer"]:
                                print("SAME")
                            else:
                                print("DIFFERENT")
                            for label in form_element.find_elements(By.CLASS_NAME, "fb-text-selectable__option"):
                                temp = label.find_element(By.TAG_NAME, "input")
                                if temp.get_attribute("value") == value["answer"]:
                                    is_temp_selected = temp.is_selected()  # Assign the result to a variable
                                    print("SHDBV", value["answer"], is_temp_selected)
                                    # temp.click() 
                                    ogLabel = label.find_element(By.TAG_NAME, "label")
                                    ogLabel.click()
                                    print("AFTER CLICKING,", temp.is_selected()) # For example, you might want to click the element to select it
                                    break
                    else:
                        form_data[f"randomMCQ{randint(0,1000000)}"] = {
                            "options": options,
                            "answer": selected_answer
                        }
                    continue
            except: pass
            try:
                input_element = form_element.find_element(By.TAG_NAME, "input")
                try:
                    question_label = form_element.find_element(By.TAG_NAME, "label").text.strip()
                    if input_element:
                        entered_answer = input_element.get_attribute("value") or ""
                        if question_label in existing_data:
                            final_answer = existing_data[question_label]["answer"]
                            if final_answer == entered_answer:continue
                            else:
                                input_element.clear()
                                input_element.send_keys(final_answer)
                        form_data[question_label] = {
                            "answer": entered_answer
                        }
                        continue
                except:
                    if input_element.get_attribute("placeholder").strip() == "mm/dd/yyyy":
                        today_date = datetime.now().strftime("%m/%d/%Y")
                        input_element.clear()
                        input_element.send_keys(today_date)
            except: pass

    sleep(2)
    allButtons = driver1.find_element(By.CLASS_NAME, "jobs-easy-apply-content").find_element(By.TAG_NAME, "footer").find_elements(By.TAG_NAME, "button")
    # print("Done")


    currentProgress = form_content.find_element(By.CLASS_NAME, "artdeco-completeness-meter-linear__progress-element").get_attribute("value")
    print(f"CURRENT PROGRESS: {currentProgress}")
    # print(allButtons[0].tartdeco-button__textext)
    try:
        for eachButton in allButtons:
            try:
                print(eachButton.find_element(By.CLASS_NAME, "artdeco-button__text").text)
                if eachButton.text.strip() == "Next":
                    eachButton.click()
                    if form_content.find_element(By.CLASS_NAME, "artdeco-completeness-meter-linear__progress-element").get_attribute("value") == currentProgress:
                        print("SAME PAGE")
                        return "SAME PAGE", form_data
                        # print(form_data)
                    return "0", form_data
                elif eachButton.text.strip() == "Review":
                    eachButton.click()
                    return "1", form_data

                    sleep(2)
            except:
                sdvsdv = driver1.find_element(By.CLASS_NAME, "jobs-easy-apply-content").find_elements(By.TAG_NAME, "footer")
                print(len(sdvsdv))
                buttonText = driver1.find_element(By.TAG_NAME, "span").text
                print(buttonText)

    except: return "hello", form_data
        
    # print(form_data)
    # return form_data



with open('bhawishyaWani.json') as bhawishyaWani:
    data = json.load(bhawishyaWani)

for key, bhawishyaWani in data.items():
    if bhawishyaWani["status"] != "Applied" and bhawishyaWani["method"] == "EasyApply":
        driver.get(bhawishyaWani['link'])
        
        # driver.get("https://www.linkedin.com/jobs/view/3800594550")
        # driver.get("https://www.linkedin.com/jobs/view/3781909181/?eBP=JOB_SEARCH_ORGANIC&refId=r965w6QB8bwDN%2FpLffkawA%3D%3D&trackingId=wCQ9pu1YITMzieqLW%2FaK2Q%3D%3D&trk=flagship3_search_srp_jobs")
        sleep(5)
        # buttonLoadHoneDe(driver, "jobs-s-apply")
        applyButton = driver.find_elements(By.CLASS_NAME, "jobs-apply-button")
        # button = driver.find_elements(By.TAG_NAME, "button")
        for button in applyButton:
            print(button.text)
            if button.text == "Easy Apply":
                button.click()
                sleep(5)
                break
        form_data = {}
        
        status, formData = readingAndFillingForm(driver, form_data)
        print(status, formData)
        while status=="0":
            status, formData = readingAndFillingForm(driver, formData)
        
        saveDataToFile(formData)

        thisForm = driver.find_element(By.CLASS_NAME, "jobs-easy-apply-content")
        print(status)
        if status == "1":
            unselectFollowButton = thisForm.find_element(By.CLASS_NAME, "job-details-easy-apply-footer__section").find_element(By.TAG_NAME, "label").click()
            sleep(3)
            allButtons = thisForm.find_element(By.TAG_NAME, "footer").find_elements(By.TAG_NAME, "button")
            for button in allButtons:
                thisLabel = button.find_element(By.TAG_NAME, "span")
                if thisLabel.text == "Submit application":
                    thisLabel.click()
                    sleep(3)
                    bhawishyaWani["status"] = "Applied"
                    with open('bhawishyaWani.json', 'w') as bhawishyaWani_file:
                        json.dump(data, bhawishyaWani_file, indent=2)

        # print(status)
        
    # break

        

