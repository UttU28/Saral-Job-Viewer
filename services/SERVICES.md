# Saral Apply - Systemd Services Setup

This repository contains systemd service configurations for managing the Saral Apply application, including frontend, backend, and scheduler services.

## Services Overview

### 1. **Scheduler Service**
Handles job scheduling for automated LinkedIn applications.

**Configuration:** `sudo nano /etc/systemd/system/runScheduler.service`
```ini
[Unit]
Description=Saral Apply Scheduler Service
After=network.target

[Service]
Type=simple
User=yourSystemUser
ExecStart=/home/yourSystemUser/Desktop/Saral-Job-Apply/services/scheduler.sh
Restart=always
RestartSec=3


[Install]
WantedBy=multi-user.target
```

### 2. **Backend Service**
Runs the FastAPI-based backend application.

**Configuration:** `sudo nano /etc/systemd/system/runBackend.service`
```ini
[Unit]
Description=FastAPI Application Service
After=network.target

[Service]
Type=simple
ExecStart=/home/yourSyste/Desktop/Saral-Job-Apply/services/backend.sh
WorkingDirectory=/home/yourSyste/Desktop/Saral-Job-Apply
Restart=always
RestartSec=5
User=yourSyste

[Install]
WantedBy=multi-user.target
```

### 3. **Frontend Service**
Hosts the frontend development environment.

**Configuration:** `sudo nano /etc/systemd/system/runFrontend.service`
```ini
[Unit]
Description=Frontend Development Hosting Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/yourSyste/Desktop/Saral-Job-Apply/frontend
ExecStart=/home/yourSyste/Desktop/Saral-Job-Apply/services/frontend.sh
Restart=always
User=yourSyste
Environment=NODE_ENV=development

[Install]
WantedBy=multi-user.target
```

## Setup Instructions

### 1. **Create Systemd Service Files**
```sh
sudo nano /etc/systemd/system/runScheduler.service
sudo nano /etc/systemd/system/runBackend.service
sudo nano /etc/systemd/system/runFrontend.service
```

### 2. **Make Service Scripts Executable**
```sh
chmod +x /home/yourSyste/Desktop/Saral-Job-Apply/services/scheduler.sh
chmod +x /home/yourSyste/Desktop/Saral-Job-Apply/services/backend.sh
chmod +x /home/yourSyste/Desktop/Saral-Job-Apply/services/frontend.sh
chmod +x /home/yourSyste/Desktop/Saral-Job-Apply/services/linkedInScraping.sh
chmod +x /home/yourSyste/Desktop/Saral-Job-Apply/services/easyApply.sh
chmod +x /home/yourSyste/Desktop/Saral-Job-Apply/services/diceScraping.sh
```

### 3. **Reload Systemd Daemon**
```sh
sudo systemctl daemon-reload
```

### 4. **Start and Enable Services**
#### Frontend
```sh
sudo systemctl stop runFrontend.service
sudo systemctl enable runFrontend.service
sudo systemctl start runFrontend.service
journalctl -u runFrontend.service -f
```

#### Backend
```sh
sudo systemctl stop runBackend.service
sudo systemctl enable runBackend.service
sudo systemctl start runBackend.service
journalctl -u runBackend.service -f
```

#### Scheduler
```sh
sudo systemctl stop runScheduler.service
sudo systemctl enable runScheduler.service
sudo systemctl start runScheduler.service
journalctl -u runScheduler.service -f
```

### 5. **Check Service Status**
```sh
sudo systemctl status runScheduler.service
sudo systemctl status runBackend.service
sudo systemctl status runFrontend.service
```

### 6. **View Logs**
```sh
journalctl -u runScheduler.service -f
journalctl -u runBackend.service -f
journalctl -u runFrontend.service -f
```

## Notes
- Ensure that all service scripts (`scheduler.sh`, `backend.sh`, `frontend.sh`, etc.) have the correct permissions and paths.
- Use `journalctl -u <service-name> -f` to view logs in real-time.
- If any service fails to start, check logs for error messages and validate configurations.

---

This setup ensures that the Saral Apply services run automatically on system boot and restart in case of failure. 🚀

