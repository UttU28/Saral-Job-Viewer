-- Create the table
CREATE TABLE allJobData (
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

-- Create the table
CREATE TABLE easyApplyData (
    id INT NOT NULL AUTO_INCREMENT,
    jobID VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY (jobID) -- Creates an index on jobID as it's marked as MUL (multiple key)
);


-- Create the table
CREATE TABLE searchKeywords (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL
);

-- Insert data into the table
INSERT INTO searchKeywords (name, type, created_at) VALUES
('Dice', 'NoCompany', '2025-01-18 15:01:08'),
('Jobs via Dice', 'NoCompany', '2025-01-18 16:13:43'),
('EMTAK LLC', 'NoCompany', '2025-01-18 17:43:34'),
('python developer', 'SearchList', '2025-01-18 18:13:35'),
('Jobot', 'NoCompany', '2025-01-19 03:27:54'),
('Varsity Tutors, a Nerdy Company', 'NoCompany', '2025-01-19 03:28:20'),
('PwC', 'NoCompany', '2025-01-21 09:32:40'),
('Revature', 'NoCompany', '2025-01-21 11:06:49'),
('Get It - Professional Services', 'NoCompany', '2025-01-21 11:47:43'),
('Get It - Finance', 'NoCompany', '2025-01-21 11:47:45'),
('Call For Referral', 'NoCompany', '2025-01-21 11:55:09'),
('SynergisticIT', 'NoCompany', '2025-01-21 12:55:09'),
('RemoteWorker CA', 'NoCompany', '2025-01-21 13:11:51'),
('Cogent Communications', 'NoCompany', '2025-01-21 13:12:12'),
('TEKsystems', 'NoCompany', '2025-01-21 13:12:22'),
('FullStack Labs', 'NoCompany', '2025-01-21 13:49:21'),
('KPMG US', 'NoCompany', '2025-01-21 13:50:33'),
('Cooper Installation Services', 'NoCompany', '2025-01-21 14:23:13'),
('hackajob', 'NoCompany', '2025-01-21 14:24:06'),
('Harmony Public Schools', 'NoCompany', '2025-01-21 17:18:44'),
('AlliedTravelCareers', 'NoCompany', '2025-01-21 17:18:57'),
('CyberCoders', 'NoCompany', '2025-01-21 17:20:13'),
('Greater Jasper Consolidated Schools', 'NoCompany', '2025-01-21 18:54:15'),
('Jobs via eFinancialCareers', 'NoCompany', '2025-01-21 19:50:48'),
('IDEA Public Schools', 'NoCompany', '2025-01-21 19:51:21'),
('International Leadership of Texas', 'NoCompany', '2025-01-21 19:52:22'),
('California Department of Education', 'NoCompany', '2025-01-21 19:52:29'),
('Clovis Municipal School District', 'NoCompany', '2025-01-21 19:52:55'),
('Welocalize', 'NoCompany', '2025-01-21 19:53:20'),
('Genesys', 'NoCompany', '2025-01-21 19:53:25'),
('Leading Path Consulting', 'NoCompany', '2025-01-21 19:53:43'),
('Quinnox', 'NoCompany', '2025-01-21 19:53:49'),
('State of Tennessee', 'NoCompany', '2025-01-21 19:53:54'),
('Osceola County School District', 'NoCompany', '2025-01-21 19:54:02'),
('Montgomery County Public Schools', 'NoCompany', '2025-01-21 20:40:42'),
('DePaul University', 'NoCompany', '2025-01-22 09:40:55'),
('ProjectFitter.ai', 'NoCompany', '2025-01-22 09:45:48'),
('Reyes Coca-Cola Bottling', 'NoCompany', '2025-01-22 13:42:55'),
('software engineer', 'SearchList', '2025-01-22 17:49:41'),
('Django Flask', 'SearchList', '2025-01-22 17:49:49'),
('python llm', 'SearchList', '2025-01-22 17:49:52'),
('Apex Systems', 'NoCompany', '2025-01-24 17:37:29'),
('CACI International Inc', 'NoCompany', '2025-01-24 18:08:15'),
('Canonical', 'NoCompany', '2025-01-24 18:08:42'),
('Epic', 'NoCompany', '2025-01-24 18:27:40'),
('U.S. Navy', 'NoCompany', '2025-01-24 19:18:59'),
('Outlier', 'NoCompany', '2025-01-24 19:19:08'),
('Actalent', 'NoCompany', '2025-01-24 19:38:16'),
('Tata Consultancy Services', 'NoCompany', '2025-01-26 16:41:03'),
('Charles Schwab', 'NoCompany', '2025-01-26 20:50:16'),
('Morgan White Group', 'NoCompany', '2025-01-27 11:47:07'),
('Team Remotely', 'NoCompany', '2025-01-27 11:50:30'),
('Braintrust', 'NoCompany', '2025-01-27 12:31:01'),
('First Horizon Bank', 'NoCompany', '2025-01-27 12:31:53'),
('Nevada National Security Sites', 'NoCompany', '2025-01-27 18:36:01');
