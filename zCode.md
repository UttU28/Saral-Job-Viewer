```
sudo nano /etc/systemd/system/runScheduler.service
sudo nano /etc/systemd/system/runBackend.service
sudo nano /etc/systemd/system/runFrontend.service

chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/services/scheduler.sh
chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/services/backend.sh
chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/services/frontend.sh
chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/services/dataScraping.sh
chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/services/easyApply.sh
chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/services/diceScraping.sh

sudo systemctl daemon-reload
sudo systemctl stop runFrontend.service
sudo systemctl enable runFrontend.service
sudo systemctl start runFrontend.service
journalctl -u runFrontend.service -f

sudo systemctl daemon-reload
sudo systemctl stop runBackend.service
sudo systemctl enable runBackend.service
sudo systemctl start runBackend.service
journalctl -u runBackend.service -f

sudo systemctl daemon-reload
sudo systemctl stop runScheduler.service
sudo systemctl enable runScheduler.service
sudo systemctl start runScheduler.service
journalctl -u runScheduler.service -f


sudo systemctl status runScheduler.service
sudo systemctl status runBackend.service
sudo systemctl status runFrontend.service
journalctl -u runScheduler.service -f
journalctl -u runBackend.service -f
journalctl -u runFrontend.service -f
```