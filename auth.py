"""
auth.py — Web-based Google OAuth2 login for the Flask app.

Flow:
  1. User visits any protected page → redirected to /login
  2. User clicks "Sign in with Google" → redirected to Google consent
  3. Google redirects back to /auth/callback with a code
  4. We exchange the code for an ID token, extract the email
  5. If email is in ALLOWED_EMAILS → store in session → redirect to original page
  6. Otherwise → show access denied page

This is separate from the Drive token (token.pickle) used for spreadsheet access.
"""
import json
import os
import secrets

import requests
from flask import (
    Blueprint, redirect, render_template, request,
    session, url_for
)
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
import google.oauth2.id_token
import google.auth.transport.requests as google_requests

from config import ALLOWED_EMAILS, SECRET_KEY

CREDENTIALS_PATH = 'web_credentials.json'  # Web application type — for browser login only

# Scopes for login only — we just need the user's email/profile
LOGIN_SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
]

auth_bp = Blueprint('auth', __name__)


def get_flow():
    """
    Build an OAuth Flow for the web login.

    Local dev : reads web_credentials.json from disk
    Render    : reads GOOGLE_WEB_CREDENTIALS_JSON env var (base64-encoded)
    """
    import json as _json
    import base64 as _base64
    import tempfile as _tempfile

    uri = _callback_uri()
    print(f">>> Building flow with redirect_uri: {uri}", flush=True)

    # ── Render / production: load from env var ────────────────────────
    web_creds_b64 = os.environ.get('GOOGLE_WEB_CREDENTIALS_JSON', '')
    if web_creds_b64:
        creds_data = _json.loads(_base64.b64decode(web_creds_b64).decode())
        # Write to a temp file because Flow.from_client_secrets_file needs a path
        tmp = _tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        _json.dump(creds_data, tmp)
        tmp.flush()
        tmp.close()
        flow = Flow.from_client_secrets_file(tmp.name, scopes=LOGIN_SCOPES, redirect_uri=uri)
        os.unlink(tmp.name)
        return flow

    # ── Local dev: load from disk ─────────────────────────────────────
    if not os.path.exists(CREDENTIALS_PATH):
        raise FileNotFoundError(
            f"'{CREDENTIALS_PATH}' not found and GOOGLE_WEB_CREDENTIALS_JSON env var not set.\n"
            "Local: make sure web_credentials.json exists.\n"
            "Render: set GOOGLE_WEB_CREDENTIALS_JSON in the dashboard."
        )

    with open(CREDENTIALS_PATH) as _f:
        _data = _json.load(_f)
    _type = 'web' if 'web' in _data else 'installed' if 'installed' in _data else 'unknown'
    print(f">>> credentials type: {_type}", flush=True)
    if _type != 'web':
        raise RuntimeError(
            f"'{CREDENTIALS_PATH}' is type '{_type}' — must be 'web' (Web application). "
            "Create a Web application credential in Google Cloud Console."
        )

    flow = Flow.from_client_secrets_file(CREDENTIALS_PATH, scopes=LOGIN_SCOPES, redirect_uri=uri)
    return flow


def _callback_uri():
    """Build the callback URI — http locally, https on Render."""
    # Render sets the RENDER env var automatically
    if os.environ.get('RENDER'):
        return url_for('auth.callback', _external=True, _scheme='https')
    return url_for('auth.callback', _external=True)


def login_required(f):
    """Decorator — redirects to /login if the user is not authenticated."""
    from functools import wraps

    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user_email'):
            session['next'] = request.url
            return redirect(url_for('auth.login'))
        return f(*args, **kwargs)

    return decorated


# ── Routes ────────────────────────────────────────────────────────────────────

@auth_bp.route('/login')
def login():
    if session.get('user_email'):
        return redirect(url_for('index'))
    return render_template('login.html')


@auth_bp.route('/debug/redirect-uri')
def debug_redirect_uri():
    """Temporary debug route — shows exactly what redirect URI the app will use.
    Visit http://localhost:5000/debug/redirect-uri to see it.
    Remove this route before going to production.
    """
    uri = _callback_uri()
    return f'<pre>Redirect URI being sent to Google:\n\n  {uri}\n\nMake sure this EXACT string is in your Google Cloud Console → Credentials → Authorised redirect URIs</pre>'


@auth_bp.route('/login/google')
def login_google():
    """Start the OAuth flow — redirect user to Google."""
    flow  = get_flow()
    state = secrets.token_urlsafe(16)
    session['oauth_state'] = state

    # Print to console so you can see the exact URI even if the browser redirects
    print(f"\n>>> REDIRECT URI SENT TO GOOGLE: {flow.redirect_uri}\n", flush=True)

    auth_url, _ = flow.authorization_url(
        access_type='offline',
        state=state,
        prompt='select_account',
    )
    return redirect(auth_url)


@auth_bp.route('/auth/callback')
def callback():
    """Google redirects here after the user grants/denies access."""
    # CSRF check
    if request.args.get('state') != session.pop('oauth_state', None):
        return render_template('login.html', error='Invalid state. Please try again.'), 400

    if 'error' in request.args:
        return render_template('login.html', error='Google sign-in was cancelled.'), 400

    flow = get_flow()

    # Allow http in development
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

    flow.fetch_token(authorization_response=request.url)
    credentials = flow.credentials

    # Get user info from the ID token
    # Allow up to 60 seconds of clock skew between this machine and Google's servers.
    id_info = google.oauth2.id_token.verify_oauth2_token(
        credentials.id_token,
        google_requests.Request(),
        clock_skew_in_seconds=60,
    )

    email   = id_info.get('email', '').lower().strip()
    name    = id_info.get('name', email)
    picture = id_info.get('picture', '')

    # Check allowlist
    allowed = [e.lower().strip() for e in ALLOWED_EMAILS]
    if email not in allowed:
        return render_template('login.html',
                               error=f'Access denied. "{email}" is not authorised to use this app.'), 403

    # Store in session
    session['user_email']   = email
    session['user_name']    = name
    session['user_picture'] = picture
    session.permanent       = True

    # Redirect to where the user was trying to go
    next_url = session.pop('next', None)
    if next_url and next_url.startswith(request.host_url):
        return redirect(next_url)
    return redirect(url_for('index'))


@auth_bp.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('auth.login'))