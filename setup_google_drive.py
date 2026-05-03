import os

# setup_google_drive.py
print("="*60)
print("Google Drive API Setup Instructions")
print("="*60)
print()
print("Follow these steps to set up Google Drive API access:")
print()
print("1. Go to: https://console.cloud.google.com/")
print()
print("2. Create a new project (or select existing):")
print("   - Click 'Select a project' at the top")
print("   - Click 'NEW PROJECT'")
print("   - Name it 'Schedule Manager' and click CREATE")
print()
print("3. Enable Google Drive API:")
print("   - In the search bar, type 'Google Drive API'")
print("   - Click on 'Google Drive API'")
print("   - Click 'ENABLE'")
print()
print("4. Create credentials:")
print("   - Click 'CREATE CREDENTIALS' button")
print("   - Select 'OAuth client ID'")
print("   - If prompted, configure consent screen:")
print("     * User Type: External")
print("     * App name: Schedule Manager")
print("     * User support email: your email")
print("     * Developer contact: your email")
print("     * Click SAVE AND CONTINUE")
print("     * Scopes: Skip, click SAVE AND CONTINUE")
print("     * Test users: Add your Gmail, click SAVE AND CONTINUE")
print("   - Application type: Desktop app")
print("   - Name: Schedule Manager Desktop")
print("   - Click CREATE")
print()
print("5. Download credentials:")
print("   - Click DOWNLOAD JSON")
print("   - Save as 'credentials.json' in this project folder:")
print(f"     {os.getcwd()}")
print()
print("6. Find your Excel file ID in Google Drive:")
print("   - Open the file in Google Drive web browser")
print("   - Look at the URL:")
print("     https://drive.google.com/file/d/FILE_ID_HERE/view")
print("   - Copy the FILE_ID_HERE part")
# setup_google_drive.py (continued)
print("   - Update config.py with your FILE_ID:")
print("     GOOGLE_DRIVE_FILE_ID = 'your-file-id-here'")
print("     USE_FILE_ID = True")
print()
print("=" * 60)
print("After completing these steps, run:")
print("  pip install -r requirements.txt")
print("  python app.py")
print()
print("On first run, a browser will open to authorize the app.")
print("=" * 60)


if __name__ == '__main__':
    # Check if credentials.json exists
    if os.path.exists('credentials.json'):
        print("\n✓ credentials.json found!")
    else:
        print("\n⚠ credentials.json NOT found - please download it from Google Cloud Console")

    # Check config
    try:
        from config import GOOGLE_DRIVE_FILE_ID, USE_FILE_ID

        if USE_FILE_ID and GOOGLE_DRIVE_FILE_ID != '1your-file-id-here':
            print("✓ File ID configured in config.py")
        else:
            print("⚠ Please update GOOGLE_DRIVE_FILE_ID in config.py")
    except:
        print("⚠ config.py not found or incomplete")