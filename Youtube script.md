# Ultimate Job Search Automation: Saral Job Viewer & Brown Mailer

## INTRO

Hey everyone! Today I'm excited to share with you two powerful tools that are changing how we approach the job search process. If you're tired of spending hours scrolling through job boards and sending applications into the void, these solutions are for you.

I've created a complete end-to-end job hunting automation system combining two tools: Saral Job Viewer and Brown Mailer. Together, they handle everything from finding jobs to sending personalized outreach emails.

## PART 1: THE PROBLEM

Job hunting today is broken:
- Endless scrolling through job listings
- Repetitive application forms
- Generic rejection emails (if you get any response at all)
- Recruiters who filter applications automatically
- The black hole where applications disappear

When recruiters can automate rejections, we need to automate hope. It's fight or flight—and I chose to fight!

## PART 2: SARAL JOB VIEWER OVERVIEW

First, let me introduce Saral Job Viewer, an automated job search and application system that:

- Scrapes job postings from LinkedIn and Dice
- Stores everything in a structured database
- Provides a clean interface to review, filter, and apply to jobs
- Tracks your applications automatically

The system consists of:
- A FastAPI Python backend
- React/Next.js frontend with TypeScript
- SQLite or MySQL database
- Selenium-based scraping engine

## PART 3: SARAL JOB VIEWER WORKFLOW

Here's how Saral Job Viewer works:

1. **Initial Setup**
   - Configure your profile (name, LinkedIn URL)
   - Upload your resume and cover letter
   - The system stores everything securely

2. **Job Search Configuration**
   - Add search keywords for technologies and roles you want
   - Create a blacklist of companies to exclude
   - All settings are saved to the database

3. **Automated Data Collection**
   - Click to start scraping LinkedIn or Dice
   - Watch as Chrome launches and navigates job sites
   - The system filters jobs based on your criteria
   - Relevant positions are saved to your database

4. **Job Review Process**
   - Browse scraped jobs in the clean interface
   - Filter by posting date (last few hours/days)
   - Review job details and requirements
   - Make quick decisions to apply or reject
   - All your choices are tracked

5. **Application Options**
   - Manual Apply: System records that you applied externally
   - Easy Apply: Queues job for automated application
   - Reject: Marks jobs you don't want to see again

## PART 4: BROWN MAILER INTRODUCTION

But finding jobs is only half the battle. That's where Brown Mailer comes in!

🚀 Brown Mailer is the AI job-hunting assistant that:
- Finds recruiters and HR contacts at your target companies
- Crafts personalized emails using the job description and your credentials
- Sends outreach messages while you focus on other things

This powerful tool extracts your skills, experience, and projects from your resume and cover letter to create truly personalized emails that stand out.

## PART 5: BROWN MAILER CAPABILITIES

Here's what Brown Mailer does:

✅ Scans job listings on LinkedIn like a detective
✅ Identifies recruiters & HR contacts at your target companies
✅ Crafts personalized cold emails using:
   - The job description
   - Your resume details
   - Cover letter highlights
✅ Sends emails on your behalf through a custom engine
✅ Tracks all communications automatically

## PART 6: TECHNOLOGY STACK

For the technically curious, here's what powers these systems:

**Saral Job Viewer:**
- Backend: FastAPI with SQLAlchemy
- Frontend: React/Next.js with modern UI
- Scraping: Selenium with anti-detection measures
- Database: SQLite (default) or MySQL

**Brown Mailer:**
- Chrome Extension (HTML, CSS, JS)
- Node.js Backend for speed
- Ollama / ChatGPT API for AI-crafted emails
- Custom Email Sending Engine
- Google Search API + Puppeteer for recruiter tracking

## PART 7: THE COMPLETE WORKFLOW

Here's how these tools work together:

1. **Job Discovery Phase**
   - Saral Job Viewer scrapes LinkedIn and Dice
   - Jobs are filtered based on your preferences
   - You review and select promising opportunities

2. **Application Research**
   - For each selected job, review details carefully
   - Brown Mailer identifies key recruiters and contacts
   - System prepares personalized outreach strategy

3. **Personalized Outreach**
   - Brown Mailer generates customized emails
   - Messages reference specific job requirements
   - Your experience is highlighted automatically
   - Emails sent through optimized delivery system

4. **Application Tracking**
   - All activities logged in central database
   - Track response rates and engagement
   - Refine approach based on results

## PART 8: BENEFITS

This integrated approach offers massive benefits:

1. **Time Efficiency**
   - Automates repetitive job search tasks
   - Consolidates jobs from multiple platforms
   - Handles outreach emails automatically

2. **Application Organization**
   - Tracks where you've applied
   - Prevents duplicate applications
   - Maintains history of all communications

3. **Strategic Job Hunting**
   - Focus on fresh postings
   - Exclude unwanted companies or job types
   - Target positions matching your specific skills

4. **Higher Response Rates**
   - Personalized outreach > generic applications
   - Direct contact with decision-makers
   - Custom messaging that addresses job requirements

## PART 9: FUTURE DEVELOPMENT

I'm considering two paths forward:

🔸 **User Login System** – Building a full application with logins so you can manage job leads, resumes, and recruiter communications all in one place.

🔸 **Open Source Release** – Making the code available for you to run yourself, though setup will require some technical knowledge.

## CONCLUSION

The job market is more competitive than ever, but with these automation tools, you can:
- Find more relevant opportunities
- Apply more efficiently
- Make direct contact with decision-makers
- Stand out with personalized communications

Ironic confession: I spend so much time building job-hunting tools that I barely apply myself. My DMs are open if you want to hire the creator instead of using the tools! 😅

If you'd like to try these systems or contribute to their development, check the description for links and information.

What do you think? Would you use these tools? Let me know in the comments!

Thanks for watching, and good luck with your job search!

#Automation #JobHunting #AI #Tech #CareerHacks 