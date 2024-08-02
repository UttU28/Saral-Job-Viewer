import json
import time
from flask import Flask, render_template

app = Flask(__name__)

def load_and_filter_data():
    current_time = time.time()
    filtered_data = {}

    with open('bhawishyaWani.json', 'r') as file:
        data = json.load(file)
        for key, value in data.items():
            if current_time - value['timeStamp'] <= 26 * 3600:  # 26 hours in seconds
                filtered_data[key] = value
        sorted_data = dict(sorted(filtered_data.items(), key=lambda x: x[1]['timeStamp'], reverse=True))

    with open('bhawishyaWani.json', 'w') as file:
        json.dump(sorted_data, file, indent=4)

    return sorted_data


@app.route('/', methods=['GET'])
def index():
    jobs_data = load_and_filter_data()
    return render_template('index.html', jobs=jobs_data)

if __name__ == '__main__':
    app.run(debug=True)
