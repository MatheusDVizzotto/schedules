# list_all_files_api.py - Direct API access to list files
from google_drive_handler import GoogleDriveHandler
import json


def list_all_files_detailed():
    """List all files with full API response"""
    print("=" * 100)
    print("Google Drive API - List All Files")
    print("=" * 100)
    print()

    try:
        print("Connecting to Google Drive API...")
        gdrive = GoogleDriveHandler()
        print("✓ Connected")
        print()

        print("Fetching files from API: https://www.googleapis.com/drive/v3/files")
        print()

        # Get all files
        response = gdrive.service.files().list(
            pageSize=100,
            fields="nextPageToken, files(id, name, mimeType, size, modifiedTime, createdTime, webViewLink, webContentLink, parents, owners, shared, starred, trashed)"
        ).execute()

        files = response.get('files', [])
        next_page_token = response.get('nextPageToken')

        print(f"✓ Retrieved {len(files)} files")

        if next_page_token:
            print(f"⚠ More files available (next page token: {next_page_token[:20]}...)")
            print("  Note: Only showing first 100 files")

        print("\n" + "=" * 100)
        print("FILES LIST")
        print("=" * 100)

        # Filter for Excel and Sheets files
        excel_files = []
        sheet_files = []

        for file in files:
            mime_type = file.get('mimeType', '')

            if 'spreadsheet' in mime_type and 'google' in mime_type:
                sheet_files.append(file)
            elif 'xlsx' in mime_type or file['name'].endswith('.xlsx'):
                excel_files.append(file)

        # Display Excel files first
        if excel_files:
            print(f"\n{'─' * 100}")
            print(f"EXCEL FILES (.xlsx) - {len(excel_files)} found")
            print('─' * 100)

            for i, file in enumerate(excel_files, 1):
                print(f"\n{i}. {file['name']}")
                print(f"   File ID: {file['id']}")
                print(f"   Size: {int(file.get('size', 0)) / 1024:.2f} KB")
                print(f"   Modified: {file.get('modifiedTime', 'Unknown')}")
                if 'webViewLink' in file:
                    print(f"   Link: {file['webViewLink']}")

        # Display Google Sheets
        if sheet_files:
            print(f"\n{'─' * 100}")
            print(f"GOOGLE SHEETS - {len(sheet_files)} found")
            print('─' * 100)

            for i, file in enumerate(sheet_files, 1):
                print(f"\n{i}. {file['name']}")
                print(f"   File ID: {file['id']}")
                print(f"   Modified: {file.get('modifiedTime', 'Unknown')}")
                if 'webViewLink' in file:
                    print(f"   Link: {file['webViewLink']}")

        # Save full response to JSON
        output_file = 'google_drive_files.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(response, f, indent=2)

        print(f"\n{'=' * 100}")
        print(f"✓ Full API response saved to: {output_file}")
        print('=' * 100)

        # Display API endpoint info
        print("\nAPI ENDPOINT USED:")
        print("  GET https://www.googleapis.com/drive/v3/files")
        print("\nDOCUMENTATION:")
        print("  https://developers.google.com/drive/api/v3/reference/files/list")

        return files

    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == '__main__':
    list_all_files_detailed()