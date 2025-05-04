# Saral Job Viewer: Comprehensive Documentation

## Overview
Saral Job Viewer is an automated job search and application system that scrapes job postings from LinkedIn and Dice, stores them in a structured database, and provides a user-friendly interface to review, filter, and apply to these jobs. It streamlines the job hunting process by automating repetitive tasks and giving users better control over their applications.

## Architecture
- **Backend**: FastAPI Python server
- **Frontend**: React/Next.js with TypeScript
- **Database**: SQLite (default) or MySQL
- **Scraping Engine**: Selenium-based with Chrome WebDriver

## Core Functionality

### Job Scraping
1. **LinkedIn Scraper**
   - Logs into user's LinkedIn account
   - Searches for jobs based on predefined keywords
   - Extracts job details including title, company, location, and description
   - Identifies application method (Easy Apply or external)
   - Filters unwanted companies using a blacklist

2. **Dice Scraper**
   - Searches Dice.com for jobs matching keywords
   - Focuses on roles that offer "Easy Apply"
   - Content filtering based on inclusion/exclusion terms
   - Extracts complete job details

### Database System
- Maintains separate tables for LinkedIn and Dice jobs
- Stores keywords for searches (both positive and negative)
- Tracks application status (not applied, applied, rejected)
- User profile storage (name, email, URLs, resume status)

### User Interface
- Dashboard showing job statistics
- Filterable job listings with detailed views
- Quick actions to apply or reject jobs
- Profile management section
- Manual resume and cover letter upload
- Generation of personalized outreach content

## Complete Application Flow

1. **Initial Setup**
   - User configures their profile (name, LinkedIn URL, etc.)
   - Uploads resume and optionally cover letter
   - System stores these in the data directory

2. **Job Search Configuration**
   - User adds search keywords (technologies, roles)
   - User adds excluded companies (blacklist)
   - Settings saved to database

3. **Data Collection Process**
   - User triggers scraping (either LinkedIn or Dice)
   - Chrome browser launches in visible mode
   - System navigates to job search sites
   - Jobs are filtered based on criteria
   - Relevant jobs saved to database

4. **Job Review Workflow**
   - User views scraped jobs through frontend
   - Can filter by recency (last few hours)
   - Reviews job details and requirements
   - Makes decision to apply or reject
   - System tracks decisions

5. **Application Methods**
   - **Manual Apply**: System marks job as applied, user handles externally
   - **Easy Apply**: Adds job to queue for automated application
   - **Reject**: Marks job so it won't appear in future searches

6. **Data Management**
   - Prevents duplicate job listings
   - Tracks application statistics
   - Manages user profile information

## Technical Implementation Details

### Backend Components
- FastAPI routes handle all operations
- Database connections managed through SQLAlchemy
- Environment variables control configuration
- Endpoints for job management, user profiles, and scraping triggers

### Scraping Engine
- Chrome browser automation through Selenium
- Anti-detection measures to prevent blocking
- Session management to maintain login state
- Paged processing of search results
- Content filtering based on keywords

### Frontend Features
- Modern UI with responsive design
- Job cards with detailed information
- Quick action buttons for application decisions
- Dashboard with application metrics
- User profile management

## Use Cases and Benefits

1. **Time Efficiency**
   - Automates repetitive job search tasks
   - Consolidates jobs from multiple platforms
   - Quick filtering saves hours of manual searching

2. **Application Organization**
   - Tracks where you've applied
   - Prevents duplicate applications
   - Maintains history of rejected positions

3. **Strategic Job Hunting**
   - Filter by recency to apply to fresh postings
   - Exclude unwanted companies or job types
   - Focus on positions matching specific skills

4. **Data-Driven Approach**
   - View statistics on application success rates
   - Track job market trends through saved listings
   - Refine search terms based on results

5. **Personalization**
   - Stores user information for applications
   - Manages resume and cover letter
   - Potential for customized application messages

## Unique Value Proposition
Saral Job Viewer transforms the traditionally fragmented job search process into a streamlined workflow. By automating the discovery phase and providing a single interface for managing applications, it gives job seekers more time to focus on preparation and interview skills rather than endless scrolling through job boards. 