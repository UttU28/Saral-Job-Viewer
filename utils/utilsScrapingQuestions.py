import json
import os
from datetime import datetime
from selenium.webdriver.common.by import By

# Define the JSON file path as a constant at the top of the file
QUESTIONS_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'linkedinQuestions.json')

def readTheInputsFrom(driver, existingQuestions):
    """
    Analyze the Easy Apply form using Selenium and extract relevant information
    """
    # print("Analyzing Easy Apply form data:")
    
    # Find all form elements
    formElements = driver.find_elements(By.CLASS_NAME, 'fb-dash-form-element')
    
    # Counter for questions
    questionCount = 0
    questions = []
    
    # Analyze each form element
    for element in formElements:
        # Determine input type
        inputType = "Unknown"
        questionText = ""
        
        # Check for checkbox fieldset first
        try:
            checkboxFieldset = element.find_element(By.CSS_SELECTOR, 'fieldset[data-test-checkbox-form-component="true"]')
            inputType = "Multiple Select (Checkbox)"
            # Find the question text in the legend div
            legendDiv = checkboxFieldset.find_element(By.CLASS_NAME, 'fb-dash-form-element__label')
            innerSpan = legendDiv.find_element(By.CSS_SELECTOR, 'span[aria-hidden="true"]')
            questionText = innerSpan.text.strip()
        except:
            pass
        
        # Check for radio button fieldset
        if not questionText:
            try:
                radioFieldset = element.find_element(
                    By.CSS_SELECTOR, 
                    'fieldset[data-test-form-builder-radio-button-form-component="true"]'
                )
                inputType = "Radio Button"
                legendSpan = radioFieldset.find_element(By.CLASS_NAME, 'fb-dash-form-element__label')
                innerSpan = legendSpan.find_element(By.CSS_SELECTOR, 'span[aria-hidden="true"]')
                questionText = innerSpan.text.strip()
            except:
                pass
        
        # If not a radio button or checkbox, check other types
        if not questionText:
            try:
                selectElement = element.find_element(By.TAG_NAME, 'select')
                inputType = "Dropdown"
                label = element.find_element(By.CLASS_NAME, 'fb-dash-form-element__label')
                innerSpan = label.find_element(By.CSS_SELECTOR, 'span[aria-hidden="true"]')
                questionText = innerSpan.text.strip()
            except:
                try:
                    if element.find_element(By.CSS_SELECTOR, 'input[type="text"]'):
                        inputType = "Text Input"
                except:
                    pass
                try:
                    if element.find_element(By.CSS_SELECTOR, 'input[type="email"]'):
                        inputType = "Email Input"
                except:
                    pass
                try:
                    if element.find_element(By.CSS_SELECTOR, 'input[type="tel"]'):
                        inputType = "Phone Input"
                except:
                    pass
                
                # Look for labels if question text not found yet
                if not questionText:
                    try:
                        label = element.find_element(By.TAG_NAME, 'label')
                    except:
                        try:
                            legend = element.find_element(By.TAG_NAME, 'legend')
                            label = legend.find_element(By.CLASS_NAME, 'fb-dash-form-element__label')
                        except:
                            continue
                    
                    if label:
                        questionText = label.text.strip()
        
        if questionText:
            # Check if required using element attributes
            isRequired = ('required' in element.get_attribute('innerHTML') or 
                       'aria-required="true"' in element.get_attribute('innerHTML'))
            
            # Get options and current answer if available
            options = []
            currentAnswer = None
            
            matchingQuestion = next((q for q in existingQuestions if q.get('question', '') == questionText and q.get('verified', False)), None)
            
            if inputType in ["Multiple Select (Checkbox)", "Radio Button"]:
                optionLabels = element.find_elements(By.CLASS_NAME, 't-14')
                options = [opt.text.strip() for opt in optionLabels if opt.text.strip()]
                
                # Check for selected checkboxes/radio buttons
                selectedInputs = element.find_elements(By.CSS_SELECTOR, 'input:checked')
                if selectedInputs:
                    currentAnswer = [inputElem.get_attribute('value') for inputElem in selectedInputs]
                    # For radio buttons, convert single-item list to string
                    if inputType == "Radio Button" and currentAnswer:
                        currentAnswer = currentAnswer[0]
                
                if matchingQuestion and matchingQuestion.get('currentAnswer') != currentAnswer:
                    try:
                        if inputType == "Radio Button":
                            if matchingQuestion and matchingQuestion.get('verified', False):
                                # Map Yes/No to 1/0 for radio buttons
                                value = "1" if matchingQuestion["currentAnswer"] == "Yes" else "0"
                                label = element.find_element(By.CSS_SELECTOR, f'label[for$="{value}"]')
                                label.click()
                                currentAnswer = matchingQuestion["currentAnswer"]
                        else:
                            # For single-option checkboxes (like "Confirmed")
                            if len(options) == 1 and matchingQuestion["currentAnswer"] == options[0]:
                                # Find and click the label instead of the checkbox
                                label = element.find_element(By.CSS_SELECTOR, 'label[data-test-text-selectable-option__label="Confirmed"]')
                                if not element.find_element(By.TAG_NAME, 'input').is_selected():
                                    label.click()
                            else:
                                # Original multiple-checkbox handling logic
                                labels = element.find_elements(By.TAG_NAME, 'label')
                                checkboxes = element.find_elements(By.TAG_NAME, 'input')
                                checkbox_map = {}
                                
                                for i, label in enumerate(labels):
                                    if i < len(checkboxes):
                                        checkbox_map[label.text.strip()] = label  # Store label instead of checkbox
                                
                                for answer_text in matchingQuestion["currentAnswer"]:
                                    if answer_text in checkbox_map:
                                        label = checkbox_map[answer_text]
                                        checkbox = checkboxes[list(checkbox_map.keys()).index(answer_text)]
                                        if not checkbox.is_selected():
                                            label.click()  # Click label instead of checkbox
                                
                                for label_text, label in checkbox_map.items():
                                    if label_text not in matchingQuestion["currentAnswer"] and label.is_selected():
                                        label.click()
                            
                            currentAnswer = matchingQuestion["currentAnswer"]
                    except Exception as e:
                        # print(f"Error updating {inputType} for {questionText}: {e}")
                        pass
                
            elif inputType == "Dropdown":
                # Get dropdown options
                optionElements = element.find_elements(By.TAG_NAME, 'option')
                options = [opt.text.strip() for opt in optionElements 
                          if opt.text.strip() and opt.text.strip() != "Select an option"]
                
                # Check for selected option
                try:
                    selectedOption = element.find_element(By.CSS_SELECTOR, 'option:checked')
                    if selectedOption.text.strip() != "Select an option":
                        currentAnswer = selectedOption.text.strip()
                except:
                    pass
                    
                if matchingQuestion and matchingQuestion.get('currentAnswer') != currentAnswer:
                    from selenium.webdriver.support.ui import Select
                    select = Select(element.find_element(By.TAG_NAME, 'select'))
                    select.select_by_visible_text(matchingQuestion["currentAnswer"])
                    currentAnswer = matchingQuestion["currentAnswer"]
                    
            elif inputType in ["Text Input", "Email Input", "Phone Input"]:
                # Check for existing input value
                try:
                    inputElement = element.find_element(By.TAG_NAME, 'input')
                    if inputElement.get_attribute('value'):
                        currentAnswer = inputElement.get_attribute('value')
                except:
                    pass
                
                if matchingQuestion and matchingQuestion.get('currentAnswer') != currentAnswer:
                    inputElement.clear()
                    inputElement.send_keys(matchingQuestion["currentAnswer"])
                    currentAnswer = matchingQuestion["currentAnswer"]
            
            questionCount += 1
            questions.append({
                'question': questionText,
                'type': inputType,
                'required': isRequired,
                'options': options if options else None,
                'currentAnswer': currentAnswer,
                'verified': False if not matchingQuestion else matchingQuestion.get('verified', False)
            })
    
    # print(f"\nFound {len(questions)} questions in the form:")
    # for q in questions:
    #     requiredText = "(Required)" if q['required'] else "(Optional)"
    #     print(f"{q['question']}")
    #     print(f"   Type: {q['type']} {requiredText}")
    #     if q['options']:
    #         print(f"   Options: {', '.join(q['options'])}")
    #     print()
    
    return questions 

def loadExistingQuestions():
    """Load existing questions from JSON file"""
    try:
        if os.path.exists(QUESTIONS_JSON_PATH):
            with open(QUESTIONS_JSON_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading questions from {QUESTIONS_JSON_PATH}: {str(e)}")
    return []

def saveQuestionsToJson(questions):
    """Save questions to JSON file"""
    try:
        with open(QUESTIONS_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(questions, f, indent=2, ensure_ascii=False)
        print(f"Saved {len(questions)} questions to {QUESTIONS_JSON_PATH}")
    except Exception as e:
        print(f"Error saving questions to JSON: {str(e)}")

def updateQuestionsFile(newQuestions, existingQuestions):
    """Update questions file with new questions"""
    try:
        # Merge existing and new questions
        allQuestions = existingQuestions or []
        for newQ in newQuestions:
            if newQ not in allQuestions:
                allQuestions.append(newQ)
        
        # Save updated questions
        saveQuestionsToJson(allQuestions)
    except Exception as e:
        print(f"Error updating questions file: {str(e)}") 