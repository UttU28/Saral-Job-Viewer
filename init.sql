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
