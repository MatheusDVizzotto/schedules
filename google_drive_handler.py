"""
google_drive_handler.py — Google Drive API authentication and file I/O.

Authentication strategy
───────────────────────
LOCAL (credentials.json present on disk):
  Standard InstalledAppFlow → token.pickle flow.

RENDER / PRODUCTION (no files on disk):
  Set these environment variables in the Render dashboard:
    GOOGLE_CREDENTIALS_JSON  base64-encoded contents of credentials.json
    GOOGLE_REFRESH_TOKEN     the refresh_token from token.pickle

  Run  python extract_token.py  locally after first auth to get the values.
"""
import base64
import io
import json
import os
import pickle

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

SCOPES           = ['https://www.googleapis.com/auth/drive']
TOKEN_PATH       = 'token.pickle'
CREDENTIALS_PATH = 'credentials.json'
AUTH_PORT        = 8080


class GoogleDriveHandler:

    def __init__(self):
        self.creds   = None
        self.service = None
        self._authenticate()

    # ── Authentication ────────────────────────────────────────────────

    def _authenticate(self):
        if os.environ.get('GOOGLE_REFRESH_TOKEN'):
            self.creds = self._creds_from_env()
        else:
            self.creds = self._load_token()
            if not self.creds or not self.creds.valid:
                if self.creds and self.creds.expired and self.creds.refresh_token:
                    self._do_refresh(self.creds)
                else:
                    self.creds = self._run_oauth_flow()
                    self._save_token(self.creds)

        self.service        = build('drive',  'v3', credentials=self.creds)
        self.sheets_service = build('sheets', 'v4', credentials=self.creds)

    def _creds_from_env(self) -> Credentials:
        """Reconstruct Credentials entirely from env vars (Render/production)."""
        raw_b64 = os.environ.get('GOOGLE_CREDENTIALS_JSON', '')
        if raw_b64:
            info_wrap = json.loads(base64.b64decode(raw_b64).decode())
            info      = info_wrap.get('installed') or info_wrap.get('web', {})
            client_id     = info.get('client_id', '')
            client_secret = info.get('client_secret', '')
            token_uri     = info.get('token_uri', 'https://oauth2.googleapis.com/token')
        else:
            client_id     = os.environ.get('GOOGLE_CLIENT_ID', '')
            client_secret = os.environ.get('GOOGLE_CLIENT_SECRET', '')
            token_uri     = 'https://oauth2.googleapis.com/token'

        creds = Credentials(
            token=None,
            refresh_token=os.environ['GOOGLE_REFRESH_TOKEN'],
            token_uri=token_uri,
            client_id=client_id,
            client_secret=client_secret,
            scopes=SCOPES,
        )
        self._do_refresh(creds)
        return creds

    def _do_refresh(self, creds: Credentials):
        try:
            creds.refresh(Request())
            print("✓ Access token refreshed")
        except Exception as e:
            raise RuntimeError(f"Failed to refresh Google token: {e}") from e

    def _load_token(self):
        if os.path.exists(TOKEN_PATH):
            try:
                with open(TOKEN_PATH, 'rb') as f:
                    return pickle.load(f)
            except Exception as e:
                print(f"Warning: could not load {TOKEN_PATH}: {e}")
        return None

    def _save_token(self, creds):
        try:
            with open(TOKEN_PATH, 'wb') as f:
                pickle.dump(creds, f)
            print("✓ Credentials saved to token.pickle")
        except IOError as e:
            print(f"Warning: could not save token: {e}")

    def _run_oauth_flow(self) -> Credentials:
        if not os.path.exists(CREDENTIALS_PATH):
            raise FileNotFoundError(
                "credentials.json not found and GOOGLE_REFRESH_TOKEN not set.\n"
                "Local: download credentials.json from Google Cloud Console.\n"
                "Render: set GOOGLE_CREDENTIALS_JSON + GOOGLE_REFRESH_TOKEN env vars."
            )
        print("\n" + "=" * 60)
        print("Opening browser for Google authentication…")
        print("=" * 60)
        flow  = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
        creds = flow.run_local_server(port=AUTH_PORT)
        return creds

    # ── Sheets API helpers ────────────────────────────────────────────

    def get_sheet_gid_api(self, file_id: str, sheet_title: str) -> int | None:
        """Return the Google Sheets gid for a named tab via the Sheets API.
        Google assigns its own gids (large random ints) when it opens an xlsx —
        these differ from the openpyxl sheetId values."""
        try:
            result = self.sheets_service.spreadsheets().get(
                spreadsheetId=file_id,
                fields='sheets.properties(sheetId,title)'
            ).execute()
            for s in result.get('sheets', []):
                if s['properties']['title'] == sheet_title:
                    return s['properties']['sheetId']
            return None
        except Exception as e:
            print(f"Warning: Sheets API gid lookup failed: {e}")
            return None

    # ── File operations ───────────────────────────────────────────────

    def get_file_mime_type(self, file_id: str) -> str:
        try:
            res = self.service.files().get(
                fileId=file_id, fields='mimeType', supportsAllDrives=True
            ).execute()
            return res.get('mimeType', '')
        except HttpError as e:
            print(f"Warning: could not get mime type for {file_id}: {e}")
            return ''

    def export_file(self, file_id: str) -> io.BytesIO:
        """Export a native Google Sheets file as xlsx bytes."""
        try:
            req = self.service.files().export_media(
                fileId=file_id,
                mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            buf = io.BytesIO()
            dl  = MediaIoBaseDownload(buf, req)
            done = False
            while not done:
                _, done = dl.next_chunk()
            buf.seek(0)
            return buf
        except HttpError as e:
            raise RuntimeError(f"Drive export error {file_id}: {e}") from e

    def delete_file(self, file_id: str):
        try:
            self.service.files().delete(fileId=file_id, supportsAllDrives=True).execute()
        except HttpError as e:
            raise RuntimeError(f"Drive delete error {file_id}: {e}") from e

    def create_sheets_file(self, filename: str, file_buffer: io.BytesIO,
                           folder_id: str | None = None) -> str:
        """Upload xlsx bytes and convert to a native Google Sheets file."""
        try:
            file_buffer.seek(0)
            metadata = {'name': filename, 'mimeType': 'application/vnd.google-apps.spreadsheet'}
            if folder_id:
                metadata['parents'] = [folder_id]
            media  = MediaIoBaseUpload(
                file_buffer,
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                resumable=True
            )
            result = self.service.files().create(
                body=metadata, media_body=media, fields='id', supportsAllDrives=True
            ).execute()
            return result['id']
        except HttpError as e:
            raise RuntimeError(f"Drive create Sheets error '{filename}': {e}") from e

    def download_file(self, file_id: str) -> io.BytesIO:
        try:
            req    = self.service.files().get_media(fileId=file_id, supportsAllDrives=True)
            buf    = io.BytesIO()
            dl     = MediaIoBaseDownload(buf, req)
            done   = False
            while not done:
                _, done = dl.next_chunk()
            buf.seek(0)
            return buf
        except HttpError as e:
            raise RuntimeError(f"Drive download error {file_id}: {e}") from e

    def upload_file(self, file_id: str, file_buffer: io.BytesIO,
                    mime_type: str = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') -> dict:
        try:
            file_buffer.seek(0)
            media  = MediaIoBaseUpload(file_buffer, mimetype=mime_type, resumable=True)
            result = self.service.files().update(
                fileId=file_id, media_body=media, supportsAllDrives=True
            ).execute()
            return result
        except HttpError as e:
            raise RuntimeError(f"Drive upload HTTP error {file_id}: {e}") from e
        except Exception as e:
            raise RuntimeError(f"Drive upload failed {file_id}: {type(e).__name__}: {e}") from e

    def get_file_id_by_name(self, filename: str, folder_id: str | None = None) -> str | None:
        try:
            q = f"name='{filename}' and trashed=false"
            if folder_id:
                q += f" and '{folder_id}' in parents"
            res   = self.service.files().list(
                q=q, spaces='drive', fields='files(id,name)', pageSize=10,
                includeItemsFromAllDrives=True, supportsAllDrives=True
            ).execute()
            files = res.get('files', [])
            return files[0]['id'] if files else None
        except HttpError as e:
            print(f"Error searching '{filename}': {e}")
            return None

    def create_file(self, filename: str, file_buffer: io.BytesIO,
                    mime_type: str = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    folder_id: str | None = None) -> str:
        """Upload a new file to Drive and return its file_id."""
        try:
            file_buffer.seek(0)
            metadata = {'name': filename}
            if folder_id:
                metadata['parents'] = [folder_id]
            media    = MediaIoBaseUpload(file_buffer, mimetype=mime_type, resumable=True)
            result   = self.service.files().create(
                body=metadata, media_body=media, fields='id', supportsAllDrives=True
            ).execute()
            return result['id']
        except HttpError as e:
            raise RuntimeError(f"Drive create error for '{filename}': {e}") from e

    def get_file_metadata(self, file_id: str) -> dict | None:
        try:
            return self.service.files().get(
                fileId=file_id,
                fields='id,name,mimeType,size,modifiedTime,webViewLink,parents',
                supportsAllDrives=True
            ).execute()
        except HttpError as e:
            print(f"Error getting metadata {file_id}: {e}")
            return None