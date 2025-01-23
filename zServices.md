
/etc/systemd/system/runFastAPI.service  
```ini
[Unit]
Description=FastAPI Application Service
After=network.target

[Service]
Type=simple
ExecStart=/home/robada/Desktop/LinkedIn-Saral-Apply/runFastAPI.sh
WorkingDirectory=/home/robada/Desktop/LinkedIn-Saral-Apply
Restart=always
RestartSec=5
User=robada

[Install]
WantedBy=multi-user.target

```

/etc/systemd/system/runFrontend.service  
```ini
[Unit]
Description=Frontend Development Hosting Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/robada/Desktop/LinkedIn-Saral-Apply/frontend
ExecStart=/home/robada/Desktop/LinkedIn-Saral-Apply/runFrontend.sh
Restart=always
User=robada
Environment=NODE_ENV=development

[Install]
WantedBy=multi-user.target
```


/etc/systemd/system/runDataScraping.service  
```ini
[Unit]
Description=Data Scraping Service
After=network.target

[Service]
Type=simple
ExecStart=/bin/bash /home/robada/Desktop/LinkedIn-Saral-Apply/runDataScraping.sh
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
OLD  
NEW  
```ini
[Unit]
Description=Data Scraping Service
After=network.target

[Service]
Type=simple
ExecStart=/bin/bash /home/robada/Desktop/LinkedIn-Saral-Apply/runDataScraping.sh
WorkingDirectory=/home/robada/Desktop/LinkedIn-Saral-Apply
EnvironmentFile=/home/robada/Desktop/LinkedIn-Saral-Apply/.env

# Allow the service to access the display
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/robada/.Xauthority

# Run the service as the robada user
User=robada
Group=robada
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