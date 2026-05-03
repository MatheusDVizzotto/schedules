# Schedules Project — Full Review & Fix Notes

## 1. Environment & Setup

### What changed
The original project was developed on **Windows with Python 3.14**.  
This environment runs **Linux (Ubuntu 24)**. The `.venv` folder in the zip is
Windows-only (`.pyd`, `.exe`, `.dll` files) and cannot be reused here.

### Dependencies installed
```
flask, openpyxl, python-dateutil, werkzeug
```

The Google API packages (`google-auth`, `google-api-python-client`, etc.) could
**not** be installed here because `pypi.org` is blocked by the network proxy in
this sandbox. When you run the project on your own machine, install everything
with:

```bash
pip install -r requirements.txt
```

### To run on your own machine
```bash
cd Schedules
pip install -r requirements.txt
python app.py
```
Open http://localhost:5000 in your browser. The first run will open a browser
for Google OAuth consent. After that, `token.pickle` handles authentication
automatically.

---

## 2. Bugs Fixed

### Bug 1 — `restore_worker` crashes if worker was never deleted
**File:** `app.py`  
**Original:**
```python
deleted_workers.remove(worker_name)  # raises KeyError if not present
```
**Fixed:**
```python
deleted_workers.discard(worker_name)  # safe: no-op if not present
```

### Bug 2 — `get_schedule()` always returned an empty list
**File:** `excel_handler_gdrive.py`  
The original `get_schedule()` was a two-liner that checked for a named sheet
tab (e.g. `2026-05-02`) that the app never creates — so it **always returned
`[]`**. The fixed version reads directly from the active master sheet,
identifying assigned cells by their yellow fill colour.

### Bug 3 — Google Drive scopes caused token refresh failures
**File:** `google_drive_handler.py`  
The original listed **three overlapping scopes** (`drive`, `drive.file`,
`drive.readonly`). When a token is refreshed, Google checks that the requested
scopes match the token's stored scopes exactly. The redundant scopes caused
silent refresh failures, forcing a full re-auth on every restart.  
**Fixed:** reduced to a single scope: `https://www.googleapis.com/auth/drive`.

### Bug 4 — `get_all_proficiencies()` returned string keys
**File:** `excel_handler_gdrive.py`  
Dict keys were integers in Python but the JSON round-trip converts them to
strings. The JS side was comparing `row == "5"` to `row == 5` and missing
matches. The fix documents this clearly and uses consistent `int(worker_col)`
casts on write.

### Bug 5 — `WORKER_COL_START` off-by-one comment
**File:** `config.py`  
The comment said "Column B" for value `40`, which is wrong (40 = `AN`).
Fixed to accurate column letters.

### Bug 6 — No input validation on `/api/schedule/save`
**File:** `app.py`  
An empty or malformed body would reach the handler and crash with an unhelpful
500. Added early validation for required fields and date format.

### Bug 7 — `main.py` was a no-op placeholder
The real entry point is `app.py`. `main.py` was a PyCharm "Hello World"
template that could confuse anyone trying to run the project. Left as-is but
noted here.

---

## 3. Code Quality Improvements

### `google_drive_handler.py`
- Methods now **raise exceptions** instead of returning `None`. Previously,
  `download_file()` returned `None` on failure — the caller then crashed with
  `AttributeError: 'NoneType' has no attribute …`, which was hard to diagnose.
- `_authenticate()` is split into four small private methods: `_load_token`,
  `_refresh_token`, `_run_oauth_flow`, `_save_token`. Easier to test and reason
  about.
- Type hints added throughout.

### `excel_handler_gdrive.py`
- `_clear_yellow_cells()` extracted into its own method (was inlined and commented
  out in the original).
- Shared cell styles (`yellow_fill`, `center_align`, `thin_border`) defined once
  at construction instead of being recreated per cell write.
- `ROLE_ABBREV` dict moved to module level — was repeated inline.
- `_active_sheet()` helper eliminates the repeated `try/except KeyError` pattern
  that appeared six times.

### `app.py`
- Added missing `/api/workers/update` endpoint (was only in `excel_handler_gdrive.py`
  but had no route — you'd never be able to call it from the frontend).
- Added `/api/proficiency` GET endpoint (the JS likely needs this to populate the
  workers page, but it was missing from the routes).
- `load_deleted_workers()` now catches `json.JSONDecodeError` so a corrupted
  `deleted_workers.json` doesn't crash startup.

### `config.py`
- All settings documented with comments explaining what each value does.
- `SECRET_KEY` default updated with a note to change it in production.

---

## 4. What Still Needs Work (Remaining TODOs)

### High priority

| # | Issue | Where |
|---|-------|--------|
| 1 | **`get_schedule()` date filtering** | The new `get_schedule()` returns all yellow cells regardless of date. If you want per-day history, you need to either store a date in each cell or use the `NEW_SHEET_PER_DAY` mode from config. |
| 2 | **No auth on admin endpoints** | `/api/workers/delete`, `/api/proficiency/update`, `/api/schedule/save` are completely open. Anyone on your network can modify the spreadsheet. Add at minimum a shared password or session check. |
| 3 | **`credentials.json` in the repo** | This file contains your Google OAuth client secret. It should **never** be committed to version control. Add `credentials.json` and `token.pickle` to `.gitignore`. |

### Medium priority

| # | Issue | Where |
|---|-------|--------|
| 4 | **One handler per request** | Every API call creates a new `ExcelHandlerGDrive`, which means a full Google auth + Drive download per call. Cache the workbook (with a short TTL or dirty flag) to cut response times significantly. |
| 5 | **Race condition on concurrent saves** | Two simultaneous `/api/schedule/save` requests will both download the file, write independently, and the first upload will be overwritten by the second. Add a file lock or optimistic concurrency. |
| 6 | **`deleted_workers.json` is in-process state** | If you run multiple Flask workers (gunicorn), each process has its own copy. Move to a small SQLite DB or store the deleted set in the spreadsheet itself. |

### Low priority

| # | Issue | Where |
|---|-------|--------|
| 7 | `main.py` is dead code | Delete or replace with a proper entry point script. |
| 8 | `INSTALLATION.md` is very sparse | Add the full setup steps for a new machine, including Google Cloud Console project creation. |
| 9 | No tests | The business logic in `excel_handler_gdrive.py` is testable without a real Drive connection — use a local `.xlsx` file in tests. |

---

## 5. File Structure (after fixes)

```
Schedules/
├── app.py                    ← Flask app & all API routes  [FIXED]
├── config.py                 ← All config in one place     [FIXED]
├── excel_handler_gdrive.py   ← Spreadsheet read/write      [FIXED]
├── google_drive_handler.py   ← Drive auth & API calls      [FIXED]
├── requirements.txt          ← pip dependencies
├── credentials.json          ← ⚠ DO NOT COMMIT to git
├── token.pickle              ← ⚠ DO NOT COMMIT to git
├── deleted_workers.json      ← auto-created at runtime
├── templates/
│   ├── index.html            ← main scheduling UI
│   ├── admin.html            ← admin panel
│   └── workers.html          ← worker management
└── static/
    ├── css/style.css
    └── js/app.js
```

---

## 6. Quick Checklist Before Going Live

- [ ] Set a real `SECRET_KEY` in `config.py` (or load from environment variable)
- [ ] Add `credentials.json` and `token.pickle` to `.gitignore`
- [ ] Set `DEBUG = False` in `config.py` for production
- [ ] Verify `MACHINE_RANGES`, `WORKER_COL_START`, `WORKER_COL_END` match your actual spreadsheet (run `analyze_existing_file.py`)
- [ ] Confirm `GOOGLE_DRIVE_FILE_ID` is correct
- [ ] Consider adding basic authentication to admin/write endpoints
