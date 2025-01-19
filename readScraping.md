```
    sudo nano /etc/systemd/system/runDataScraping.service
    sudo nano /etc/systemd/system/runFastAPI.service

    chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/runDataScraping.sh
    chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/runFastAPI.sh
    sudo systemctl daemon-reload
    sudo systemctl stop runDataScraping.service
    sudo systemctl stop runFastAPI.service
    sudo systemctl start runDataScraping.service
    sudo systemctl start runFastAPI.service
    sudo systemctl enable runDataScraping.service
    sudo systemctl enable runFastAPI.service

    sudo systemctl status runDataScraping.service
    sudo systemctl status runFastAPI.service
    journalctl -u runDataScraping.service -f
    journalctl -u runFastAPI.service -f
```