# Database Schema for LinkedIn Job Management System

This document provides the schema for tables used in the LinkedIn job management system. The database includes tables for LinkedIn jobs, application data, and keywords for search and blacklist management.

## Tables

### 1. `allLinkedInJobs`
Stores job postings from LinkedIn with AI processing status and tags.

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
    applied TEXT NULL,
    aiProcessed BOOLEAN DEFAULT FALSE NOT NULL,
    aiTags TEXT DEFAULT '[]' NOT NULL
);
```

### 2. `linkedInKeywords`
Stores keywords used for LinkedIn job searches.

```sql
CREATE TABLE linkedInKeywords (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL
);
```

## Notes

### Table Descriptions
- **`allLinkedInJobs`**: Stores job listings scraped from LinkedIn with enhanced AI processing capabilities:
  - `aiProcessed`: Boolean flag indicating if the job has been processed by AI systems
  - `aiTags`: JSON string containing AI-generated tags for the job (stored as TEXT, parsed as array)
- **`linkedInKeywords`**: Stores search keywords categorized by type:
  - `SearchList`: Job title keywords used in search queries while scraping (e.g., "Software Engineer", "Python Developer")  
  - `NoCompany`: Company blacklist to filter out unwanted companies from job results

### Key Features
- **AI Integration**: Jobs can be flagged as processed with custom AI-generated tags for future enhancements
- **Keyword Management**: Dual-purpose keyword system for both search enhancement and company filtering
- **Job Application Tracking**: Basic application status tracking (YES/NO/NEVER) within job records
- **LinkedIn Focus**: System optimized specifically for LinkedIn job management and scraping
- **Real-time Filtering**: Frontend supports time-based filtering (1h, 3h, 6h, 24h, all jobs)
- **Company Blacklisting**: One-click company blacklisting directly from job cards with confirmation
- **Search Functionality**: Full-text search across job titles, companies, locations, and descriptions

### Performance Considerations
- All primary keys uniquely identify records
- Basic application status tracking integrated within main job records
- JSON storage in `aiTags` allows flexible tag management without schema changes

### System Integration
The database integrates with:
- **FastAPI Backend**: RESTful API endpoints for job management and keyword operations
- **React Frontend**: Modern, responsive UI with dark theme and real-time job filtering
- **LinkedIn Scraper**: Automated job data collection with keyword-based filtering
- **Professional UI**: Uses Lucide React icons and follows modern design principles

Ensure proper database management practices, including regular backups and index optimization for efficient querying and data integrity.

