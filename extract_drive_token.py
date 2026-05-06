"""
extract_drive_token.py — Generates a fresh Drive refresh token and prints
the environment variable values to paste into Render.

Run this ONCE locally after any credential change:
    python extract_drive_token.py

It will open your browser to authenticate with Google Drive,
then print the values you need for Render.
"""
import base64
import os
import pickle

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES           = ['https://www.googleapis.com/auth/drive']
DRIVE_CREDS_PATH = 'drive_credentials.json'
TOKEN_PATH       = 'token.pickle'

print("\n" + "=" * 65)
print("  Drive Token Extractor for Render")
print("=" * 65)

if not os.path.exists(DRIVE_CREDS_PATH):
    print(f"\n✗ {DRIVE_CREDS_PATH} not found.")
    print("  Make sure your Desktop app credentials file is named drive_credentials.json")
    exit(1)

print("\nOpening browser for Google Drive authentication...")
print("Sign in with the account that OWNS the spreadsheet.\n")

flow  = InstalledAppFlow.from_client_secrets_file(DRIVE_CREDS_PATH, SCOPES)
creds = flow.run_local_server(port=8080)

# Save token.pickle for local use
with open(TOKEN_PATH, 'wb') as f:
    pickle.dump(creds, f)
print(f"\n✓ token.pickle saved for local use")

print("\n" + "=" * 65)
print("  Copy these values into Render → Environment Variables")
print("=" * 65)

# GOOGLE_REFRESH_TOKEN
print("\n✅  GOOGLE_REFRESH_TOKEN")
print(f"\n    {creds.refresh_token}")

# GOOGLE_CREDENTIALS_JSON — base64 encode drive_credentials.json
with open(DRIVE_CREDS_PATH, 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
print("\n✅  GOOGLE_CREDENTIALS_JSON  (from drive_credentials.json)")
print(f"\n    {b64}")

import secrets
print("\n✅  SECRET_KEY  (use this if you haven't set one yet)")
print(f"\n    {secrets.token_hex(32)}")

print("\n" + "=" * 65)
print("  After pasting into Render, trigger a manual redeploy.")
print("=" * 65 + "\n")
