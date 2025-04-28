# Database Schema for Job Application System

This document provides the schema for tables used in the job application system. The database includes tables for LinkedIn jobs, Dice jobs, easy application data, keywords, and user information.

## Tables

### 1. `allLinkedInJobs`
Stores job postings from LinkedIn.

```sql
CREATE TABLE allLinkedInJobs (
    id VARCHAR(255) NOT NULL PRIMARY KEY,
    link TEXT NULL,
    title TEXT NULL,
    companyName TEXT NULL,
    location TEXT NULL,
    method TEXT NULL,
    timeStamp TEXT NULL,
    jobType TEXT NULL,
    jobDescription TEXT NULL,
    applied TEXT NULL
);
```

### 2. `allDiceJobs`
Stores job postings from Dice.

```sql
CREATE TABLE allDiceJobs (
    id VARCHAR(255) NOT NULL PRIMARY KEY,
    link TEXT NULL,
    title TEXT NULL,
    companyName TEXT NULL,
    location TEXT NULL,
    method TEXT NULL,
    timeStamp TEXT NULL,
    jobType TEXT NULL,
    jobDescription TEXT NULL,
    applied TEXT NULL
);
```

### 3. `easyApplyData`
Stores job application statuses.

```sql
CREATE TABLE easyApplyData (
    id INT NOT NULL AUTO_INCREMENT,
    jobID VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY (jobID) -- Creates an index on jobID as it's marked as MUL (multiple key)
);
```

### 4. `linkedInKeywords`
Stores keywords used for LinkedIn job searches.

```sql
CREATE TABLE linkedInKeywords (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL
);
```

### 5. `diceKeywords`
Stores keywords used for Dice job searches.

```sql
CREATE TABLE diceKeywords (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL
);
```

### 6. `users`
Stores user information for job applications.

```sql
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NULL,
    linkedin_url VARCHAR(255) NULL,
    github_url VARCHAR(255) NULL,
    portfolio_url VARCHAR(255) NULL,
    has_resume BOOLEAN DEFAULT FALSE,
    has_cover_letter BOOLEAN DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Notes
- `allLinkedInJobs` and `allDiceJobs` store job listings from respective platforms.
- `easyApplyData` tracks job application statuses.
- `linkedInKeywords` and `diceKeywords` store search keywords categorized by type:
  - `SearchList`: Keywords that should be used in search queries while scraping job data.
  - `NoCompany`: A blacklist of company names to avoid scraping irrelevant data.
- `users` stores personal information for job applications:
  - Only one user is expected in the system
  - Resume and cover letter files are stored in the data directory
  - `has_resume` and `has_cover_letter` flags indicate if files have been uploaded
- All primary keys are uniquely identifying each record.
- Indexes are used where necessary to improve query performance.

Ensure proper database management practices, including indexing and backups, for efficient querying and data integrity.

