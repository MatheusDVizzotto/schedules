# test_list_all_files.py - Simple test to list all files
from google_drive_handler import GoogleDriveHandler

print("=" * 80)
print("Testing Google Drive Access - List All Files")
print("=" * 80)
print()

try:
    print("1. Connecting to Google Drive...")
    gdrive = GoogleDriveHandler()
    print("   ✓ Connected")
    print()

    print("2. Listing files...")
    print()

    # Try different queries
    queries = [
        ("All files", "trashed=false"),
        ("Excel files",
         "trashed=false and (mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or name contains '.xlsx')"),
        ("Google Sheets", "trashed=false and mimeType='application/vnd.google-apps.spreadsheet'"),
    ]

    for query_name, query in queries:
        print(f"\n{'─' * 80}")
        print(f"{query_name}:")
        print('─' * 80)

        try:
            results = gdrive.service.files().list(
                q=query,
                pageSize=20,
                fields="files(id, name, mimeType, modifiedTime)",
                orderBy="modifiedTime desc"
            ).execute()

            files = results.get('files', [])

            if files:
                print(f"Found {len(files)} file(s):")
                for i, file in enumerate(files, 1):
                    print(f"  {i}. {file['name']}")
                    print(f"     ID: {file['id']}")
                    print(f"     Type: {file.get('mimeType', 'Unknown')}")
                    print()
            else:
                print("  No files found with this query")

        except Exception as e:
            print(f"  ✗ Error: {e}")

    print("=" * 80)
    print("If you see files above, the connection is working!")
    print("If not, check:")
    print("1. You granted all permissions during authentication")
    print("2. Your Google account actually has files in Drive")
    print("3. You're signed in with the correct account")
    print("=" * 80)

except FileNotFoundError:
    print("✗ credentials.json not found")
    print("Please download from Google Cloud Console")
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback

    traceback.print_exc()
