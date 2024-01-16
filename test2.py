import json

with open('bhawishyaWani.json') as file:
    data = json.load(file)
manual_data = {}
for key, value in data.items():
    if value.get("method", "").lower() == "manual":
        manual_data[key] = value
with open('manual_data.json', 'w') as manual_file:
    json.dump(manual_data, manual_file, indent=2)
data = {key: value for key, value in data.items() if value.get("method", "").lower() != "manual"}
with open('bhawishyaWani.json', 'w') as updated_file:
    json.dump(data, updated_file, indent=2)
