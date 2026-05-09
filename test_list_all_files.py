"""
test_list_all_files.py — List Drive files using the web credentials account.

Uses web_credentials.json (the account set up for web login / shared drive access).
Tokens are cached in token_web.pickle so you only auth once.
"""
import os
import pickle

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials  # noqa: F401
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

WEB_CREDENTIALS_PATH = 'web_credentials.json'
TOKEN_PATH           = 'token_web.pickle'
SCOPES               = ['https://www.googleapis.com/auth/drive']
REDIRECT_URI         = 'http://localhost:8080'

print("=" * 80)
print("Testing Google Drive Access - Web Credentials Account")
print("=" * 80)
print()


def get_credentials() -> Credentials:
    creds = None
    if os.path.exists(TOKEN_PATH):
        with open(TOKEN_PATH, 'rb') as f:
            creds = pickle.load(f)

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(TOKEN_PATH, 'wb') as f:
            pickle.dump(creds, f)
        return creds

    # First-time auth: local server captures the callback automatically
    flow = Flow.from_client_secrets_file(
        WEB_CREDENTIALS_PATH, scopes=SCOPES, redirect_uri=REDIRECT_URI
    )

    import socket
    import threading
    import webbrowser
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from urllib.parse import urlparse, parse_qs

    auth_url, state = flow.authorization_url(prompt='consent', access_type='offline')

    captured = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            captured['url'] = f'http://localhost:8080{self.path}'
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'<h2>Auth complete. You can close this tab.</h2>')

        def log_message(self, *args):
            pass  # suppress server log output

    server = HTTPServer(('localhost', 8080), Handler)
    thread = threading.Thread(target=server.handle_request)
    thread.start()

    print("Opening browser — log in with the shared drive account...")
    webbrowser.open(auth_url)
    thread.join(timeout=120)
    server.server_close()

    if 'url' not in captured:
        raise RuntimeError("Auth timed out — no response received within 120 seconds")

    flow.fetch_token(authorization_response=captured['url'])
    creds = flow.credentials

    with open(TOKEN_PATH, 'wb') as f:
        pickle.dump(creds, f)
    print()
    print(f"✓ Token saved to {TOKEN_PATH}")
    return creds


try:
    print("1. Authenticating with web credentials account...")
    creds   = get_credentials()
    service = build('drive', 'v3', credentials=creds)
    print("   ✓ Connected")
    print()

    print("2. Listing shared drives...")
    shared_drives = service.drives().list(pageSize=20, fields='drives(id,name)').execute()
    drives = shared_drives.get('drives', [])
    if drives:
        print(f"   Found {len(drives)} shared drive(s):")
        for d in drives:
            print(f"     • {d['name']}  (id: {d['id']})")
    else:
        print("   No shared drives found for this account")
    print()

    print("3. Listing files (including shared drives)...")
    queries = [
        ("All files",   "trashed=false"),
        ("Excel files", "trashed=false and (mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or name contains '.xlsx')"),
    ]

    for query_name, query in queries:
        print(f"\n{'─' * 80}")
        print(f"{query_name}:")
        print('─' * 80)

        results = service.files().list(
            q=query,
            pageSize=30,
            fields="files(id, name, mimeType, modifiedTime, driveId)",
            orderBy="modifiedTime desc",
            includeItemsFromAllDrives=True,
            supportsAllDrives=True,
            corpora='allDrives',
        ).execute()

        files = results.get('files', [])
        if files:
            print(f"Found {len(files)} file(s):")
            for i, file in enumerate(files, 1):
                print(f"  {i}. {file['name']}")
                print(f"     ID:    {file['id']}")
                print(f"     Type:  {file.get('mimeType', 'Unknown')}")
                if file.get('driveId'):
                    print(f"     Drive: {file['driveId']}")
                print()
        else:
            print("  No files found")

    print("=" * 80)

except FileNotFoundError:
    print(f"✗ {WEB_CREDENTIALS_PATH} not found")
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
