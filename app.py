from flask import Flask, render_template, request, jsonify
import json

app = Flask(__name__)


@app.route('/', methods=['GET', 'POST'])
def index():
    data = None
    with open('data.json', 'r') as file:
        data = json.load(file)
    pending_data = {key: value for key, value in data.items() if value.get('status', '') == 'pending'}
    total_questions = len(pending_data)
    return render_template('index.html', data=pending_data, total_questions=total_questions)

@app.route('/submit_form', methods=['POST'])
def submit_form():
    if request.method == 'POST':
        submitted_answers = request.json
        print("Submitted Answers:", submitted_answers)
        
        temp_data = None
        with open('data.json', 'r+') as file:
            temp_data = json.load(file)

        for key, answer_info in submitted_answers.items():
            status = answer_info.get('status', '')
            if status == 'approved':
                submitted_answer = answer_info.get('answer', '')
                temp_data[key]['answer'] = submitted_answer
                temp_data[key]['status'] = "approved"

        with open('data.json', 'w') as file:
            json.dump(temp_data, file, indent=2)

        return jsonify({"message": "Form submitted successfully"})

if __name__ == '__main__':
    app.run(debug=True)
