# test_gdrive_connection.py
from google_drive_handler import GoogleDriveHandler

print("=" * 60)
print("Testing Google Drive Connection")
print("=" * 60)

try:
    print("\n1. Authenticating...")
    gdrive = GoogleDriveHandler()
    print("   ✓ Authentication successful!")

    print("\n2. Listing Excel files in your Google Drive...")
    results = gdrive.service.files().list(
        q="mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and trashed=false",
        pageSize=10,
        fields="files(id, name, size, modifiedTime)"
    ).execute()

    files = results.get('files', [])

    if files:
        print(f"   ✓ Found {len(files)} Excel file(s):")
        for i, file in enumerate(files, 1):
            size_kb = int(file.get('size', 0)) / 1024 if 'size' in file else 0
            print(f"   {i}. {file['name']}")
            print(f"      ID: {file['id']}")
            print(f"      Size: {size_kb:.2f} KB")
            print(f"      Modified: {file.get('modifiedTime', 'Unknown')}")
            print()
    else:
        print("   No Excel files found")

    print("=" * 60)
    print("✓ Google Drive connection working!")
    print("=" * 60)

except Exception as e:
    print(f"\n✗ Error: {e}")
    print("\nPlease check:")
    print("1. credentials.json exists")
    print("2. You are added as a test user")
    print("3. token.pickle is valid (delete it to re-authenticate)")