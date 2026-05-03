# app.py
from flask import Flask, render_template, request, jsonify
from datetime import datetime, date
from excel_handler_gdrive import ExcelHandlerGDrive
import json
import os
from config import GOOGLE_DRIVE_FILE_ID, GOOGLE_DRIVE_FILENAME, USE_FILE_ID, SECRET_KEY, DEBUG, HOST, PORT

app = Flask(__name__)
app.config['SECRET_KEY'] = SECRET_KEY

deleted_workers = set()


def load_deleted_workers():
    global deleted_workers
    if os.path.exists('deleted_workers.json'):
        with open('deleted_workers.json', 'r') as f:
            deleted_workers = set(json.load(f))


def save_deleted_workers():
    with open('deleted_workers.json', 'w') as f:
        json.dump(list(deleted_workers), f)


def get_excel_handler():
    """Get Excel handler instance"""
    if USE_FILE_ID:
        return ExcelHandlerGDrive(file_id=GOOGLE_DRIVE_FILE_ID)
    else:
        return ExcelHandlerGDrive(filename=GOOGLE_DRIVE_FILENAME)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/admin')
def admin():
    return render_template('admin.html')


@app.route('/workers')
def workers_page():
    return render_template('workers.html')


@app.route('/api/machines', methods=['GET'])
def get_machines():
    try:
        handler = get_excel_handler()
        handler.load()
        machines = handler.get_machines()
        handler.close()
        return jsonify({'success': True, 'machines': machines})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/workers', methods=['GET'])
def get_workers():
    try:
        handler = get_excel_handler()
        handler.load()
        workers = handler.get_workers()
        handler.close()

        active_workers = [w for w in workers if w['name'] not in deleted_workers]

        return jsonify({'success': True, 'workers': active_workers})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/workers/all', methods=['GET'])
def get_all_workers_with_proficiency():
    try:
        handler = get_excel_handler()
        handler.load()

        machines = handler.get_machines()
        workers = handler.get_workers()
        proficiencies = handler.get_all_proficiencies()

        handler.close()

        return jsonify({
            'success': True,
            'machines': machines,
            'workers': workers,
            'proficiencies': proficiencies
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/workers/update', methods=['POST'])
def update_worker():
    try:
        data = request.get_json()
        worker_col = data.get('worker_col')
        new_name = data.get('name')
        proficiencies = data.get('proficiencies', {})

        handler = get_excel_handler()
        handler.load()

        if new_name:
            handler.update_worker_name(worker_col, new_name)

        if proficiencies:
            prof_data = {}
            for machine_row, prof_value in proficiencies.items():
                if int(machine_row) not in prof_data:
                    prof_data[int(machine_row)] = {}
                prof_data[int(machine_row)][worker_col] = prof_value

            handler.update_proficiencies_bulk(prof_data)

        handler.close()

        return jsonify({'success': True, 'message': 'Worker updated successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/proficiency', methods=['GET'])
def get_proficiency():
    try:
        machine_row = int(request.args.get('machine_row'))
        worker_col = int(request.args.get('worker_col'))

        handler = get_excel_handler()
        handler.load()
        proficiency = handler.get_proficiency(machine_row, worker_col)
        handler.close()

        return jsonify({'success': True, 'proficiency': proficiency})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/schedule', methods=['GET'])
def get_schedule():
    try:
        date_str = request.args.get('date')
        schedule_date = datetime.strptime(date_str, '%Y-%m-%d').date()

        handler = get_excel_handler()
        handler.load()
        schedule = handler.get_schedule(schedule_date)
        handler.close()

        return jsonify({'success': True, 'schedule': schedule})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/schedule', methods=['POST'])
def save_schedule():
    try:
        data = request.get_json()
        date_str = data.get('date')
        schedule_data = data.get('schedule')

        schedule_date = datetime.strptime(date_str, '%Y-%m-%d').date()

        handler = get_excel_handler()
        handler.load()
        handler.save_schedule_visual(schedule_date, schedule_data)
        handler.close()

        return jsonify({'success': True, 'message': 'Schedule saved successfully with formatting'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/workers/delete', methods=['POST'])
def delete_worker():
    try:
        data = request.get_json()
        worker_name = data.get('worker_name')

        deleted_workers.add(worker_name)
        save_deleted_workers()

        return jsonify({'success': True, 'message': f'Worker {worker_name} removed from future schedules'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/workers/restore', methods=['POST'])
def restore_worker():
    try:
        data = request.get_json()
        worker_name = data.get('worker_name')

        if worker_name in deleted_workers:
            deleted_workers.remove(worker_name)
            save_deleted_workers()

        return jsonify({'success': True, 'message': f'Worker {worker_name} restored'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/workers/deleted', methods=['GET'])
def get_deleted_workers():
    return jsonify({'success': True, 'workers': list(deleted_workers)})


if __name__ == '__main__':
    load_deleted_workers()
    print("=" * 60)
    print("Starting Machine Schedule Manager")
    print("=" * 60)
    print(f"Using Google Drive file: {GOOGLE_DRIVE_FILENAME if not USE_FILE_ID else GOOGLE_DRIVE_FILE_ID}")
    print(f"Server: http://{HOST}:{PORT}")
    print("=" * 60)
    app.run(debug=DEBUG, host=HOST, port=PORT)