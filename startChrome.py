import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from dotenv import load_dotenv

def start_chrome_session(user_type):
    # Load environment variables
    load_dotenv()
    
    # Set up configuration based on user type
    if user_type == "scraping":
        chrome_dir = os.getenv('SCRAPING_CHROME_DIR')
        port = os.getenv('SCRAPING_PORT')
    else:  # applying
        chrome_dir = os.getenv('APPLYING_CHROME_DIR')
        port = os.getenv('APPLYING_PORT')
    
    chrome_driver_path = os.getenv('CHROME_DRIVER_PATH')
    chrome_app_path = os.getenv('CHROME_APP_PATH')
    
    # Set up Chrome options
    options = Options()
    options.add_argument(f'--user-data-dir={chrome_dir}')
    options.add_argument(f'--remote-debugging-port={port}')
    options.binary_location = chrome_app_path
    
    # Initialize Chrome driver
    service = Service(executable_path=chrome_driver_path)
    driver = webdriver.Chrome(service=service, options=options)
    
    print(f"Chrome session started for {user_type}")
    print(f"Using directory: {chrome_dir}")
    print(f"Debug port: {port}")
    
    return driver

if __name__ == "__main__":
    # Get user input for session type
    while True:
        choice = input("Enter choice (1 for scraping, 2 for applying): ").strip()
        if choice == "1":
            user_type = "scraping"
            break
        elif choice == "2":
            user_type = "applying"
            break
        print("Invalid input. Please enter 1 for scraping or 2 for applying")
    
    # Start the Chrome session
    driver = start_chrome_session(user_type)
    
    # Keep the session running until interrupted
    try:
        input("Press Enter to close the browser...")
    finally:
        driver.quit()
