"""
config.py — Central configuration for Machine Schedule Manager.

Sensitive values are read from environment variables so they never
appear in the GitHub repository.

Local dev: create a .env file (copy .env.example and fill in values).
Render:    set these as Environment Variables in the dashboard.
"""
import os

# ============================================================
# GOOGLE DRIVE CONFIGURATION
# ============================================================

GOOGLE_DRIVE_FILE_ID   = os.environ.get('TEST_FILE_ID') or os.environ.get('GOOGLE_DRIVE_FILE_ID', '13KZdibOnzP_iv7rERpvywVifadQ9faVa')
GOOGLE_DRIVE_FILENAME  = os.environ.get('GOOGLE_DRIVE_FILENAME', '1. General Schedule.xlsx')
USE_FILE_ID            = True

# ============================================================
# EXCEL STRUCTURE — adjust to match your spreadsheet
# ============================================================

MACHINE_RANGES = [
    (2, 8),
    (10, 22),
    (24, 35),
]

WORKER_COL_START = 40
WORKER_COL_END   = 51

# ============================================================
# SCHEDULE BEHAVIOUR
# ============================================================

SCHEDULE_MODE             = 'NEW_SHEET_PER_DAY'
CLEAR_PREVIOUS_SCHEDULE   = False
INCLUDE_DATE_IN_CELL      = False

# ============================================================
# SCHEDULE TIME GRID
# ============================================================

SCHEDULE_START_TIME       = "06:00"
SCHEDULE_END_TIME         = "22:00"
SCHEDULE_INTERVAL_MINUTES = 30

# ============================================================
# ACCESS CONTROL
# ============================================================

# Set ALLOWED_EMAILS as a comma-separated string in your environment:
# ALLOWED_EMAILS=matheus.vizzotto@gmail.com,adam@bornagainpallets.com.au
_raw = os.environ.get(
    'ALLOWED_EMAILS',
    'matheus.vizzotto@gmail.com,adam@bornagainpallets.com.au'
)
ALLOWED_EMAILS = [e.strip().lower() for e in _raw.split(',') if e.strip()]

# ============================================================
# FLASK APPLICATION
# ============================================================

SECRET_KEY = os.environ.get('SECRET_KEY', 'change-me-in-dev-only')
DEBUG      = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
HOST       = '0.0.0.0'
PORT       = int(os.environ.get('PORT', 5000))
