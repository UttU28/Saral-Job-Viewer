
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


```ini
[Unit]
Description=Frontend Hosting Service
After=network.target

[Service]
ExecStart=/home/robada/Desktop/LinkedIn-Saral-Apply/frontendSetup.sh
WorkingDirectory=/home/robada/Desktop/LinkedIn-Saral-Apply/frontend
Restart=always
User=robada
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target

```