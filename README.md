# Saral-Job-Viewer

Saral-Job-Viewer is a project that scrapes job listings from platforms like LinkedIn and Dice (with more platforms being added in the future) and applies to them using Selenium (primarily for Direct Apply on the platform).

The project consists of:
- A **backend** built with FastAPI for managing job listings and applications.
- A **frontend** built with React and Next.js for interacting with job listings.
- **Scraping scripts** for LinkedIn and Dice to extract job postings and automate applications.

---
## Backend

The backend is built using Python and FastAPI. It serves API endpoints for the frontend and manages job listings in a MySQL database.

### Setup Instructions

1. Create a virtual environment and install dependencies:
    ```bash
    python -m venv venv
    source venv/bin/activate  # For macOS/Linux
    venv\Scripts\activate    # For Windows
    pip install -r requirements.txt
    ```

2. Configure environment variables in the `.env` file (located in the root directory):
    - `DATABASE_URL`
    - `QUESTIONS_JSON`
    - `DATA_DIR`

3. Run the backend server:
    ```bash
    python app.py
    ```

---
## Frontend

The frontend is built with React and Next.js. It provides an interface to manage job listings and applications.

### Features:
- Sorting, searching, and filtering job listings.
- Fetching job data from the backend API.

### Setup Instructions

1. Navigate to the frontend directory:
    ```bash
    cd frontend
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

3. Update the `.env` file in the frontend directory with the backend `VITE_API_URL` .

4. Start the development server:
    ```bash
    npm run dev
    ```

---
## Scraping Scripts

We have two scraping scripts: one for LinkedIn and one for Dice. These scripts use Selenium to extract job postings and apply automatically.

### Configuration

In the `.env` file, set the following values as per your system configuration:
- `CHROME_DRIVER_PATH`
- `CHROME_APP_PATH`
- `SCRAPING_CHROME_DIR`
- `SCRAPING_PORT`
- `APPLYING_CHROME_DIR`
- `APPLYING_PORT`

### Running the Scrapers

Run the respective script for scraping:

```bash
python diceScraping.py     # For Dice
python linkedinScraping.py # For LinkedIn
```

---
## Notes
- Ensure that your `.env` file is correctly set up before running any scripts.
- Selenium requires an appropriate version of the Chrome WebDriver.
- Future updates will include additional job platforms and enhancements.

🚀 Happy Job Hunting with Saral-Job-Viewer!