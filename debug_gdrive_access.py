# debug_gdrive_access.py - Debug Google Drive access issues
from google_drive_handler import GoogleDriveHandler
import os

print("=" * 80)
print("Google Drive Access Debugger")
print("=" * 80)
print()

# Check files
print("1. Checking authentication files...")
print()

if os.path.exists('credentials.json'):
    print("   ✓ credentials.json found")
else:
    print("   ✗ credentials.json NOT found")
    print("     Download from: https://console.cloud.google.com/")

if os.path.exists('token.pickle'):
    print("   ✓ token.pickle found")
    print("     (Delete this to re-authenticate with new permissions)")
else:
    print("   ℹ token.pickle not found (will be created on first auth)")

print()
print("2. Testing API connection...")
print()

try:
    gdrive = GoogleDriveHandler()
    print("   ✓ Authentication successful")
    print()

    print("3. Getting account info...")
    try:
        about = gdrive.service.about().get(fields="user,storageQuota").execute()
        user = about.get('user', {})
        storage = about.get('storageQuota', {})

        print(f"   ✓ Account: {user.get('emailAddress', 'Unknown')}")
        print(f"   ✓ Display Name: {user.get('displayName', 'Unknown')}")

        if storage:
            used = int(storage.get('usage', 0)) / (1024 ** 3)
            limit = int(storage.get('limit', 0)) / (1024 ** 3)
            print(f"   ✓ Storage: {used:.2f} GB / {limit:.2f} GB used")
    except Exception as e:
        print(f"   ⚠ Could not get account info: {e}")

    print()
    print("4. Testing file listing with different methods...")
    print()

    # Method 1: Basic list
    print("   Method 1: Basic list (recent 5 files)")
    try:
        result = gdrive.service.files().list(
            pageSize=5,
            fields="files(id, name)"
        ).execute()
        files = result.get('files', [])
        print(f"   ✓ Found {len(files)} files")
        for f in files:
            print(f"      - {f['name']}")
    except Exception as e:
        print(f"   ✗ Error: {e}")

    print()

    # Method 2: With query
    print("   Method 2: Query for non-trashed files")
    try:
        result = gdrive.service.files().list(
            q="trashed=false",
            pageSize=5,
            fields="files(id, name, mimeType)"
        ).execute()
        files = result.get('files', [])
        print(f"   ✓ Found {len(files)} files")
        for f in files:
            print(f"      - {f['name']} ({f.get('mimeType', 'unknown type')})")
    except Exception as e:
        print(f"   ✗ Error: {e}")

    print()

    # Method 3: Specific types
    print("   Method 3: Looking for spreadsheets")
    try:
        result = gdrive.service.files().list(
            q="trashed=false and (mimeType contains 'spreadsheet' or name contains '.xlsx')",
            pageSize=10,
            fields="files(id, name, mimeType)"
        ).execute()
        files = result.get('files', [])
        print(f"   ✓ Found {len(files)} spreadsheet(s)")
        for f in files:
            print(f"      - {f['name']}")
            print(f"        ID: {f['id']}")
    except Exception as e:
        print(f"   ✗ Error: {e}")

    print()
    print("=" * 80)

    if files:
        print("✓ SUCCESS! Your Google Drive is accessible.")
        print()
        print("Now you can run:")
        print("  python search_file_id.py")
    else:
        print("⚠ WARNING: No files found!")
        print()
        print("Possible reasons:")
        print("1. Your Google Drive is actually empty")
        print("2. Permission scope is still restricted")
        print("3. You're authenticated with a different account")
        print()
        print("Try:")
        print("1. Delete token.pickle and re-authenticate")
        print("2. Make sure you grant ALL permissions")
        print("3. Check you're using the correct Google account")

    print("=" * 80)

except Exception as e:
    print(f"✗ Error: {e}")
    import traceback

    traceback.print_exc()
    print()
    print("Common fixes:")
    print("1. Delete token.pickle and try again")
    print("2. Check credentials.json is valid")
    print("3. Make sure you're added as a test user")