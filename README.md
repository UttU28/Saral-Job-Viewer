# LinkedIn-Saral-Apply

```
python -m venv env
.\env\Scripts\activate
pip install -r requirements.txt
```


sudo nano /etc/systemd/system/runFastAPI.service
sudo systemctl daemon-reload
sudo systemctl stop runFastAPI.service
sudo systemctl start runFastAPI.service
sudo systemctl enable runFastAPI.service
sudo systemctl status runFastAPI.service
journalctl -u runFastAPI.service -f



sudo nano /etc/systemd/system/dataScraping.service
