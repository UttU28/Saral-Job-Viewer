import json

def checkAndAdd(id, jobLink, jobTitle, jobState, companyName, jobLocation, jobMethod, timeStamp, applyTime, status, revert):
    try:
        with open("bhawishyaWani.json", mode='r', encoding='utf-8') as bhawishyaWani:
            existing_data = json.load(bhawishyaWani)
    except (FileNotFoundError, json.decoder.JSONDecodeError):
        existing_data = {}

    if id not in existing_data:
        new_entry = {
            "link": jobLink,
            "title": jobTitle,
            "state": jobState,
            "companyName": companyName,
            "location": jobLocation,
            "method": jobMethod,
            "timeStamp": timeStamp,
            "applyTime": applyTime,
            "status": status,
            "revert": revert,
        }

        existing_data[id] = new_entry
        with open("bhawishyaWani.json", mode='w', encoding='utf-8') as bhawishyaWani:
            json.dump(existing_data, bhawishyaWani, ensure_ascii=False, indent=4)
    else:
        print(f"Entry with ID {id} already exists. Ignoring the new entry.")

# Example usage:
# checkAndAdd("#jobID", "#Link", "#Title", "#State", "#companyName", "#Location", "EasyApply", "#timeStamp", "NoTime/applyTime", "Applied/NotApplied", "No")
