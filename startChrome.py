import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from dotenv import load_dotenv
import random

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
    
    # Add anti-detection options
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--no-sandbox')
    options.add_experimental_option('excludeSwitches', ['enable-automation'])
    options.add_experimental_option('useAutomationExtension', False)
    
    # Add a realistic user agent
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    ]
    options.add_argument(f'--user-agent={random.choice(user_agents)}')
    
    # Initialize Chrome driver
    service = Service(executable_path=chrome_driver_path)
    driver = webdriver.Chrome(service=service, options=options)
    
    # Execute CDP commands to avoid detection
    driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
        'source': '''
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            window.navigator.chrome = {
                runtime: {}
            };
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
        '''
    })
    
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
