
## sudo nano /etc/systemd/system/runScheduler.service  
```ini
[Unit]
Description=LinkedIn Saral Apply Scheduler Service
After=network.target

[Service]
Type=simple
User=robada
ExecStart=/home/robada/Desktop/LinkedIn-Saral-Apply/services/scheduler.sh
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target

```


## sudo nano /etc/systemd/system/runBackend.service  
```ini
[Unit]
Description=FastAPI Application Service
After=network.target

[Service]
Type=simple
ExecStart=/home/robada/Desktop/LinkedIn-Saral-Apply/services/backend.sh
WorkingDirectory=/home/robada/Desktop/LinkedIn-Saral-Apply
Restart=always
RestartSec=5
User=robada

[Install]
WantedBy=multi-user.target

```

## sudo nano /etc/systemd/system/runFrontend.service  
```ini
[Unit]
Description=Frontend Development Hosting Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/robada/Desktop/LinkedIn-Saral-Apply/frontend
ExecStart=/home/robada/Desktop/LinkedIn-Saral-Apply/services/frontend.sh
Restart=always
User=robada
Environment=NODE_ENV=development

[Install]
WantedBy=multi-user.target
```


## sudo nano /etc/systemd/system/runDataScraping.service  
```ini
[Unit]
Description=Data Scraping Service
After=network.target

[Service]
Type=simple
ExecStart=/bin/bash /home/robada/Desktop/LinkedIn-Saral-Apply/services/dataScraping.sh
WorkingDirectory=/home/robada/Desktop/LinkedIn-Saral-Apply
EnvironmentFile=/home/robada/Desktop/LinkedIn-Saral-Apply/.env
Restart=always
RestartSec=5

# Allow the service to access the display

Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/robada/.Xauthority

# Run the service as the robada user

User=robada
Group=robada

[Install]
WantedBy=multi-user.target
```
## OLD  
## NEW  
```ini
[Unit]
Description=Data Scraping Service
After=network.target graphical.target

[Service]
Type=simple
User=robada
Group=robada
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/robada/.Xauthority
Environment=HOME=/home/robada
ExecStart=/bin/bash /home/robada/Desktop/LinkedIn-Saral-Apply/services/dataScraping.sh
WorkingDirectory=/home/robada/Desktop/LinkedIn-Saral-Apply
EnvironmentFile=/home/robada/Desktop/LinkedIn-Saral-Apply/.env
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

/etc/systemd/system/runDataScraping.timer  
```ini
[Unit]
Description=Timer to run Data Scraping Service every 6 hours

[Timer]
OnBootSec=1min
OnUnitActiveSec=6h
Persistent=true

[Install]
WantedBy=timers.target
```




## SQL CODE
```sql
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

-- Create the table
CREATE TABLE diceSearchKeywords (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    created_at DATETIME NOT NULL
);

```
