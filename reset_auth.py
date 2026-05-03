# reset_auth.py - Reset authentication with new scopes
import os

print("=" * 60)
print("Reset Google Drive Authentication")
print("=" * 60)
print()

if os.path.exists('token.pickle'):
    print("Found existing token.pickle")
    delete = input("Delete it to re-authenticate with new permissions? (yes/no): ")

    if delete.lower() == 'yes':
        os.remove('token.pickle')
        print("✓ token.pickle deleted")
        print()
        print("Now run any script (like search_file_id.py) and you will")
        print("be prompted to re-authenticate with full Google Drive access.")
    else:
        print("Cancelled")
else:
    print("No token.pickle found - you'll authenticate on next run")

print()
print("=" * 60)
print("Next Steps:")
print("=" * 60)
print("1. Run: python search_file_id.py")
print("2. A browser will open")
print("3. Sign in and grant ALL permissions")
print("4. You should now see all your files!")
print("=" * 60)