from flask import Flask, render_template, request, redirect, url_for
import json

app = Flask(__name__)

# Load data from the JSON file
with open('data.json', 'r') as file:
    data = json.load(file)

questions = list(data.keys())
total_questions = len(questions)

@app.route('/', methods=['GET', 'POST'])
def index():
    current_index = int(request.args.get('index', 0))
    current_question = questions[current_index]

    if request.method == 'POST':
        for key, value in request.form.items():
            # Update the data dictionary with the new values
            if key in data['pendingAnswers']:
                if 'options' in data['pendingAnswers'][key]:
                    data['pendingAnswers'][key]['answer'] = value
                else:
                    data['pendingAnswers'][key]['answer'] = request.form[key]

        # Save the updated data back to the JSON file
        with open('data.json', 'w') as file:
            json.dump(data, file, indent=4)

        if 'back_button' in request.form:
            # If the back button is pressed, go to the previous question
            if current_index > 0:
                return redirect(url_for('index', index=current_index-1))

        elif current_index < total_questions - 1:
            # If it's not the last question, go to the next question
            return redirect(url_for('index', index=current_index+1))
        else:
            return "Survey Completed!"

    progress_percent = (current_index + 1) / total_questions * 100

    return render_template('index.html', data=data, current_question=current_question, current_index=current_index,
                           progress_percent=progress_percent, total_questions=total_questions)

if __name__ == '__main__':
    app.run(debug=True)