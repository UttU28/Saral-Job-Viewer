# FastAPI Service Setup Guide

This guide explains how to set up and manage a FastAPI application as a systemd service on Ubuntu.

---

## Steps to Configure and Run the Service

### Step 1: Create or Edit the Service File

1. Open the systemd service file for editing:

    ```bash
    sudo nano /etc/systemd/system/runDataScraping.service
    ```

2. Add or update the following content in the file:

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

3. Save and exit:
    - Press `CTRL+O` to save.
    - Press `CTRL+X` to exit the editor.

---

### Step 2: Reload Systemd Daemon

Ensure the `runDataScraping.sh` script is executable:

```bash
chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/runDataScraping.sh
```

---

### Step 2: Reload Systemd Daemon

Reload the systemd manager configuration to apply changes:

```bash
sudo systemctl daemon-reload
```

---

### Step 3: Stop the Service (If Running)

If the service is already running, stop it:

```bash
sudo systemctl stop runDataScraping.service
```

---

### Step 4: Start the Service

Start the service immediately:

```bash
sudo systemctl start runDataScraping.service
```

---

### Step 5: Enable the Service on Boot

Configure the service to start automatically on boot:

```bash
sudo systemctl enable runDataScraping.service
```

---

### Step 6: Check Service Status

Verify the service status to ensure it is running:

```bash
sudo systemctl status runDataScraping.service
```

---

### Optional: View Live Logs

To view live logs of the service for debugging or monitoring:

```bash
journalctl -u runDataScraping.service -f
```

---
