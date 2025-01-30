```
sudo nano /etc/systemd/system/runScheduler.service
sudo nano /etc/systemd/system/runFastAPI.service
sudo nano /etc/systemd/system/runFrontend.service

chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/services/scheduler.sh
chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/services/backend.sh
chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/services/frontend.sh
chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/services/dataScraping.sh
chmod +x /home/robada/Desktop/LinkedIn-Saral-Apply/services/easyApply.sh


sudo systemctl daemon-reload
sudo systemctl stop runFrontend.service
sudo systemctl enable runFrontend.service
sudo systemctl start runFrontend.service
sudo systemctl stop runFastAPI.service
sudo systemctl enable runFastAPI.service
sudo systemctl start runFastAPI.service
sudo systemctl stop runScheduler.service
sudo systemctl enable runScheduler.service
sudo systemctl start runScheduler.service


sudo systemctl status runScheduler.service
sudo systemctl status runFastAPI.service
sudo systemctl status runFrontend.service
journalctl -u runScheduler.service -f
journalctl -u runFastAPI.service -f
journalctl -u runFrontend.service -f
```