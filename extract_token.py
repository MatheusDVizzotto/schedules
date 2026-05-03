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

TOKEN_PATH       = 'token.pickle'
CREDENTIALS_PATH = 'credentials.json'

print("\n" + "=" * 65)
print("  Render Environment Variable Extractor")
print("=" * 65)

# ── 1. GOOGLE_REFRESH_TOKEN ───────────────────────────────────────────
if not os.path.exists(TOKEN_PATH):
    print(f"\n✗ {TOKEN_PATH} not found.")
    print("  Run app.py first to complete the Google auth flow, then re-run this script.")
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

# ── 2. GOOGLE_CREDENTIALS_JSON ────────────────────────────────────────
if not os.path.exists(CREDENTIALS_PATH):
    print(f"\n✗ {CREDENTIALS_PATH} not found.")
else:
    with open(CREDENTIALS_PATH, 'rb') as f:
        raw = f.read()
    b64 = base64.b64encode(raw).decode()

    print("\n✅  GOOGLE_CREDENTIALS_JSON")
    print("    (paste this into Render → Environment → GOOGLE_CREDENTIALS_JSON)")
    print()
    print(f"    {b64}")

# ── 3. GOOGLE_DRIVE_FILE_ID reminder ─────────────────────────────────
print("\n✅  GOOGLE_DRIVE_FILE_ID")
print("    Get it from your Google Drive URL:")
print("    https://drive.google.com/file/d/  →→  THIS_PART  ←←  /view")

# ── 4. SECRET_KEY reminder ────────────────────────────────────────────
import secrets
print("\n✅  SECRET_KEY  (generate a new one for production)")
print(f"    {secrets.token_hex(32)}")

print("\n" + "=" * 65)
print("  Paste all four values into Render → your service → Environment")
print("=" * 65 + "\n")
