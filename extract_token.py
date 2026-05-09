"""
extract_token.py — Run this ONCE locally after authenticating with Google.

It prints the environment variable values you need to paste into Render.

Usage:
    python extract_token.py
"""
import base64
import json
import os
import pickle
import secrets

TOKEN_PATH            = 'token.pickle'
DRIVE_CREDENTIALS_PATH = 'drive_credentials.json'
WEB_CREDENTIALS_PATH  = 'web_credentials.json'

print("\n" + "=" * 65)
print("  Render Environment Variable Extractor")
print("=" * 65)

# ── 1. GOOGLE_REFRESH_TOKEN ───────────────────────────────────────────
if not os.path.exists(TOKEN_PATH):
    print(f"\n✗ {TOKEN_PATH} not found.")
    print("  Run app.py first to complete the Google Drive auth flow, then re-run this script.")
else:
    with open(TOKEN_PATH, 'rb') as f:
        creds = pickle.load(f)

    if not creds.refresh_token:
        print("\n✗ No refresh_token in token.pickle.")
        print("  Delete token.pickle, restart the app, and re-authenticate.")
    else:
        print("\n✅  GOOGLE_REFRESH_TOKEN")
        print("    (paste this into Render → Environment → GOOGLE_REFRESH_TOKEN)")
        print()
        print(f"    {creds.refresh_token}")

# ── 2. GOOGLE_CREDENTIALS_JSON (Drive / desktop app) ─────────────────
if not os.path.exists(DRIVE_CREDENTIALS_PATH):
    print(f"\n✗ {DRIVE_CREDENTIALS_PATH} not found.")
else:
    with open(DRIVE_CREDENTIALS_PATH, 'rb') as f:
        raw = f.read()
    b64 = base64.b64encode(raw).decode()

    print("\n✅  GOOGLE_CREDENTIALS_JSON")
    print("    (paste this into Render → Environment → GOOGLE_CREDENTIALS_JSON)")
    print()
    print(f"    {b64}")

# ── 3. GOOGLE_WEB_CREDENTIALS_JSON (web login / web app) ─────────────
if not os.path.exists(WEB_CREDENTIALS_PATH):
    print(f"\n✗ {WEB_CREDENTIALS_PATH} not found.")
else:
    with open(WEB_CREDENTIALS_PATH, 'rb') as f:
        raw = f.read()
    b64 = base64.b64encode(raw).decode()

    print("\n✅  GOOGLE_WEB_CREDENTIALS_JSON")
    print("    (paste this into Render → Environment → GOOGLE_WEB_CREDENTIALS_JSON)")
    print()
    print(f"    {b64}")

# ── 4. SECRET_KEY ─────────────────────────────────────────────────────
print("\n✅  SECRET_KEY  (generate a new one for production)")
print(f"    {secrets.token_hex(32)}")

# ── 5. GOOGLE_DRIVE_FILE_ID reminder ─────────────────────────────────
print("\n✅  GOOGLE_DRIVE_FILE_ID")
print("    Get it from your Google Drive URL:")
print("    https://drive.google.com/file/d/  →→  THIS_PART  ←←  /view")

print("\n" + "=" * 65)
print("  Paste all five values into Render → your service → Environment")
print("=" * 65 + "\n")