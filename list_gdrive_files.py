# list_gdrive_files.py - Helper to find your Excel file in Google Drive
from google_drive_handler import GoogleDriveHandler
import sys


def list_excel_files():
    """List all Excel files in Google Drive"""
    try:
        print("Connecting to Google Drive...")
        gdrive = GoogleDriveHandler()

        print("\nSearching for Excel files (.xlsx)...\n")
        print("=" * 80)

        # Search for xlsx files
        results = gdrive.service.files().list(
            q="mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and trashed=false",
            pageSize=50,
            fields="files(id, name, modifiedTime, webViewLink, parents)"
        ).execute()

        files = results.get('files', [])

        if not files:
            print("No Excel files found in your Google Drive")
            return

        print(f"Found {len(files)} Excel file(s):\n")

        for i, file in enumerate(files, 1):
            print(f"{i}. Name: {file['name']}")
            print(f"   File ID: {file['id']}")
            print(f"   Modified: {file.get('modifiedTime', 'Unknown')}")
            print(f"   Link: {file.get('webViewLink', 'N/A')}")
            print("-" * 80)

        # Ask user to select file
        print("\nTo use one of these files:")
        print("1. Copy the File ID of your desired file")
        print("2. Open config.py")
        print("3. Set: GOOGLE_DRIVE_FILE_ID = 'paste-file-id-here'")
        print("4. Set: USE_FILE_ID = True")

        choice = input("\nEnter file number to auto-configure (or press Enter to skip): ")

        if choice.strip().isdigit():
            idx = int(choice.strip()) - 1
            if 0 <= idx < len(files):
                selected_file = files[idx]
                update_config(selected_file['id'], selected_file['name'])
            else:
                print("Invalid selection")

    except FileNotFoundError as e:
        print("\n❌ Error: credentials.json not found")
        print("Please run: python setup_google_drive.py")
        print("And follow the instructions to set up Google Drive API")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\nMake sure you have:")
        print("1. Set up Google Drive API (run setup_google_drive.py)")
        print("2. Downloaded credentials.json")
        print("3. Authorized the app (will happen on first run)")


def update_config(file_id, filename):
    """Update config.py with selected file"""
    try:
        with open('config.py', 'r') as f:
            content = f.read()

        # Update FILE_ID
        import re
        content = re.sub(
            r"GOOGLE_DRIVE_FILE_ID = ['\"].*?['\"]",
            f"GOOGLE_DRIVE_FILE_ID = '{file_id}'",
            content
        )

        # Update USE_FILE_ID
        content = re.sub(
            r"USE_FILE_ID = (True|False)",
            "USE_FILE_ID = True",
            content
        )

        # Update FILENAME for reference
        content = re.sub(
            r"GOOGLE_DRIVE_FILENAME = ['\"].*?['\"]",
            f"GOOGLE_DRIVE_FILENAME = '{filename}'",
            content
        )

        with open('config.py', 'w') as f:
            f.write(content)

        print(f"\n✓ Updated config.py with file: {filename}")
        print(f"✓ File ID: {file_id}")
        print("\nYou can now run: python app.py")

    except Exception as e:
        print(f"\n❌ Error updating config: {e}")
        print("Please manually update config.py")


if __name__ == '__main__':
    print("=" * 80)
    print("Google Drive Excel File Finder")
    print("=" * 80)
    print()
    list_excel_files()
    print()
    print("=" * 80)