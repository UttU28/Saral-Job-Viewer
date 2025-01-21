```
    sudo nano /etc/systemd/system/runDataScraping.service
    sudo nano /etc/systemd/system/runFastAPI.service
    sudo nano /etc/systemd/system/runFrontend.service

    chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/runDataScraping.sh
    chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/runFastAPI.sh
    chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/runFrontend.sh
    sudo systemctl daemon-reload
    sudo systemctl stop runDataScraping.service
    sudo systemctl stop runFastAPI.service
    sudo systemctl stop runFrontend.service
    sudo systemctl start runDataScraping.service
    sudo systemctl start runFastAPI.service
    sudo systemctl start runFrontend.service
    sudo systemctl enable runDataScraping.service
    sudo systemctl enable runFastAPI.service
    sudo systemctl enable runFrontend.service

    sudo systemctl status runDataScraping.service
    sudo systemctl status runFastAPI.service
    sudo systemctl status runFrontend.service
    journalctl -u runDataScraping.service -f
    journalctl -u runFastAPI.service -f
    journalctl -u runFrontend.service -f
```