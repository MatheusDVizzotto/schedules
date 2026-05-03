// static/js/admin.js

document.addEventListener('DOMContentLoaded', function () {
    loadWorkers();

    document.getElementById('addWorkerBtn').addEventListener('click', addWorker);
    document.getElementById('newWorkerName').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') addWorker();
    });
});

// ── Load workers ──────────────────────────────────────────────────────────────

async function loadWorkers() {
    try {
        const [activeRes, deletedRes] = await Promise.all([
            fetch('/api/workers'),
            fetch('/api/workers/deleted'),
        ]);
        const activeData  = await activeRes.json();
        const deletedData = await deletedRes.json();

        if (activeData.success)  renderActiveWorkers(activeData.workers);
        if (deletedData.success) renderDeletedWorkers(deletedData.workers);
    } catch (err) {
        showListError('activeWorkersList',  'Failed to load: ' + err.message);
        showListError('deletedWorkersList', 'Failed to load: ' + err.message);
    }
}

// ── Render active workers ─────────────────────────────────────────────────────

function renderActiveWorkers(workers) {
    const list = document.getElementById('activeWorkersList');
    document.getElementById('activeCount').textContent = workers.length;

    if (!workers.length) {
        list.innerHTML = '<li class="list-group-item text-muted text-center py-3">No active workers</li>';
        return;
    }

    list.innerHTML = workers.map(function(w) {
        return (
            '<li class="list-group-item d-flex justify-content-between align-items-center">' +
              '<span><i class="fas fa-user text-primary me-2"></i>' + escapeHtml(w.name) + '</span>' +
              '<button class="btn btn-sm btn-outline-danger" onclick="removeWorker(\'' + escapeHtml(w.name) + '\')">' +
                '<i class="fas fa-user-slash"></i> Remove' +
              '</button>' +
            '</li>'
        );
    }).join('');
}

// ── Render deleted workers ────────────────────────────────────────────────────

function renderDeletedWorkers(workerNames) {
    const list = document.getElementById('deletedWorkersList');
    document.getElementById('deletedCount').textContent = workerNames.length;

    if (!workerNames.length) {
        list.innerHTML = '<li class="list-group-item text-muted text-center py-3">No removed workers</li>';
        return;
    }

    list.innerHTML = workerNames.map(function(name) {
        return (
            '<li class="list-group-item d-flex justify-content-between align-items-center">' +
              '<span class="text-muted"><i class="fas fa-user-slash me-2"></i>' + escapeHtml(name) + '</span>' +
              '<button class="btn btn-sm btn-outline-success" onclick="restoreWorker(\'' + escapeHtml(name) + '\')">' +
                '<i class="fas fa-user-check"></i> Restore' +
              '</button>' +
            '</li>'
        );
    }).join('');
}

// ── Add worker ────────────────────────────────────────────────────────────────

async function addWorker() {
    const input = document.getElementById('newWorkerName');
    const name  = input.value.trim();
    const fb    = document.getElementById('addWorkerFeedback');

    if (!name) {
        fb.innerHTML = '<div class="alert alert-warning py-2 mb-0">Please enter a worker name.</div>';
        input.focus();
        return;
    }

    const btn  = document.getElementById('addWorkerBtn');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
    fb.innerHTML  = '';

    try {
        const res  = await fetch('/api/workers/add', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ name: name }),
        });
        const data = await res.json();

        if (data.success) {
            fb.innerHTML =
                '<div class="alert alert-success py-2 mb-0">' +
                  '<i class="fas fa-check-circle"></i> ' +
                  '<strong>' + escapeHtml(name) + '</strong> added successfully. ' +
                  'Go to <a href="/workers">Edit Workers &amp; Proficiency</a> to set their proficiency levels.' +
                '</div>';
            input.value = '';
            loadWorkers();   // refresh lists
        } else {
            fb.innerHTML =
                '<div class="alert alert-danger py-2 mb-0">' +
                  '<i class="fas fa-exclamation-circle"></i> Error: ' + escapeHtml(data.error) +
                '</div>';
        }
    } catch (err) {
        fb.innerHTML =
            '<div class="alert alert-danger py-2 mb-0">Network error: ' + escapeHtml(err.message) + '</div>';
    } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
    }
}

// ── Remove worker (soft-delete) ───────────────────────────────────────────────

async function removeWorker(name) {
    if (!confirm('Remove "' + name + '" from future schedules?\n\nThey can be restored later.')) return;

    try {
        const res  = await fetch('/api/workers/delete', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ worker_name: name }),
        });
        const data = await res.json();
        if (data.success) {
            loadWorkers();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    }
}

// ── Restore worker ────────────────────────────────────────────────────────────

async function restoreWorker(name) {
    try {
        const res  = await fetch('/api/workers/restore', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ worker_name: name }),
        });
        const data = await res.json();
        if (data.success) {
            loadWorkers();
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function showListError(listId, msg) {
    document.getElementById(listId).innerHTML =
        '<li class="list-group-item text-danger">' + escapeHtml(msg) + '</li>';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
