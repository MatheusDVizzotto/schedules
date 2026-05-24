// static/js/admin.js

var _permanentDeleteName = null;
var _absenceWorkerName   = null;
var _absences            = {};   // {workerName: [{date_from, date_to, reason}, ...]}

// Returns {absence, idx} if the worker has an active absence today, otherwise null.
function getActiveAbsenceWithIndex(workerName) {
    var today    = new Date().toISOString().split('T')[0];
    var absences = _absences[workerName] || [];
    for (var i = 0; i < absences.length; i++) {
        if (absences[i].date_from <= today && today <= absences[i].date_to) {
            return { absence: absences[i], idx: i };
        }
    }
    return null;
}

document.addEventListener('DOMContentLoaded', function () {
    loadWorkers();

    document.getElementById('addWorkerBtn').addEventListener('click', addWorker);
    document.getElementById('newWorkerName').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') addWorker();
    });

    document.getElementById('confirmPermanentDeleteBtn').addEventListener('click', function() {
        if (_permanentDeleteName) permanentDeleteWorker(_permanentDeleteName);
    });

    document.getElementById('confirmAbsenceBtn').addEventListener('click', saveAbsence);
});

// ── Load workers ──────────────────────────────────────────────────────────────

async function loadWorkers() {
    try {
        const [activeRes, deletedRes, absencesRes] = await Promise.all([
            fetch('/api/workers'),
            fetch('/api/workers/deleted'),
            fetch('/api/workers/absences'),
        ]);
        const activeData   = await activeRes.json();
        const deletedData  = await deletedRes.json();
        const absencesData = await absencesRes.json();

        if (absencesData.success) _absences = absencesData.absences;

        if (activeData.success) {
            var trulyActive    = activeData.workers.filter(function(w) { return !getActiveAbsenceWithIndex(w.name); });
            var currentlyAbsent = activeData.workers.filter(function(w) { return !!getActiveAbsenceWithIndex(w.name); });
            renderActiveWorkers(trulyActive);
            renderDeletedWorkers(deletedData.success ? deletedData.workers : [], currentlyAbsent);
        } else if (deletedData.success) {
            renderDeletedWorkers(deletedData.workers, []);
        }
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
        const safe     = escapeHtml(w.name);
        const allAbsences = _absences[w.name] || [];
        const today       = new Date().toISOString().split('T')[0];

        // Only show upcoming absences (past and current are not shown here;
        // current ones move the worker to the Removed section entirely).
        var absenceHtml = '';
        var hasUpcoming = false;
        allAbsences.forEach(function(a, idx) {
            if (a.date_from <= today) return; // skip past and current
            if (!hasUpcoming) { absenceHtml = '<div class="mt-1 ms-4">'; hasUpcoming = true; }
            absenceHtml +=
                '<span class="badge bg-warning text-dark me-1">' +
                  '<i class="fas fa-calendar-minus me-1"></i>' +
                  escapeHtml(a.date_from) + ' → ' + escapeHtml(a.date_to) +
                  (a.reason ? ' — ' + escapeHtml(a.reason) : '') +
                '</span>' +
                '<button class="btn btn-xs btn-link text-danger p-0 me-2" style="font-size:0.75rem;" ' +
                        'onclick="removeAbsence(\'' + safe + '\',' + idx + ')" title="Remove absence">' +
                  '<i class="fas fa-times"></i>' +
                '</button>';
        });
        if (hasUpcoming) absenceHtml += '</div>';

        return (
            '<li class="list-group-item">' +
              '<div class="d-flex justify-content-between align-items-center gap-2">' +
                '<span><i class="fas fa-user text-primary me-2"></i>' + safe + '</span>' +
                '<div class="d-flex gap-1">' +
                  '<button class="btn btn-sm btn-outline-warning" onclick="openAbsenceModal(\'' + safe + '\')">' +
                    '<i class="fas fa-calendar-minus"></i> Remove' +
                  '</button>' +
                  '<button class="btn btn-sm btn-danger" onclick="confirmPermanentDelete(\'' + safe + '\')">' +
                    '<i class="fas fa-trash"></i> Delete' +
                  '</button>' +
                '</div>' +
              '</div>' +
              absenceHtml +
            '</li>'
        );
    }).join('');
}

// ── Render deleted workers ────────────────────────────────────────────────────

function renderDeletedWorkers(workerNames, absentWorkers) {
    absentWorkers = absentWorkers || [];
    const list  = document.getElementById('deletedWorkersList');
    const total = workerNames.length + absentWorkers.length;
    document.getElementById('deletedCount').textContent = total;

    if (!total) {
        list.innerHTML = '<li class="list-group-item text-muted text-center py-3">No removed workers</li>';
        return;
    }

    var html = '';

    // Currently-absent workers (temporary — auto-return when period ends)
    absentWorkers.forEach(function(w) {
        var safe   = escapeHtml(w.name);
        var info   = getActiveAbsenceWithIndex(w.name);
        var a      = info ? info.absence : null;
        var idx    = info ? info.idx     : 0;
        var detail = a
            ? escapeHtml(a.date_from) + ' → ' + escapeHtml(a.date_to) +
              (a.reason ? ' — ' + escapeHtml(a.reason) : '')
            : '';

        html +=
            '<li class="list-group-item list-group-item-warning">' +
              '<div class="d-flex justify-content-between align-items-start gap-2">' +
                '<div>' +
                  '<span><i class="fas fa-calendar-minus text-warning me-2"></i><strong>' + safe + '</strong></span>' +
                  (detail ? '<div class="small text-muted mt-1">' + detail + '</div>' : '') +
                '</div>' +
                '<button class="btn btn-sm btn-outline-warning flex-shrink-0" ' +
                        'onclick="removeAbsence(\'' + safe + '\',' + idx + ')" ' +
                        'title="Cancel this absence">' +
                  '<i class="fas fa-times"></i> Cancel' +
                '</button>' +
              '</div>' +
            '</li>';
    });

    // Permanently soft-deleted workers
    workerNames.forEach(function(name) {
        html +=
            '<li class="list-group-item d-flex justify-content-between align-items-center">' +
              '<span class="text-muted"><i class="fas fa-user-slash me-2"></i>' + escapeHtml(name) + '</span>' +
              '<button class="btn btn-sm btn-outline-success" onclick="restoreWorker(\'' + escapeHtml(name) + '\')">' +
                '<i class="fas fa-user-check"></i> Restore' +
              '</button>' +
            '</li>';
    });

    list.innerHTML = html;
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

// ── Absence modal ─────────────────────────────────────────────────────────────

function openAbsenceModal(name) {
    _absenceWorkerName = name;
    document.getElementById('absenceWorkerName').textContent = name;
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('absenceDateFrom').value = today;
    document.getElementById('absenceDateTo').value   = today;
    document.getElementById('absenceReason').value   = '';
    document.getElementById('absenceModalFeedback').innerHTML = '';
    new bootstrap.Modal(document.getElementById('absenceModal')).show();
}

async function saveAbsence() {
    const dateFrom = document.getElementById('absenceDateFrom').value;
    const dateTo   = document.getElementById('absenceDateTo').value;
    const reason   = document.getElementById('absenceReason').value.trim();
    const fb       = document.getElementById('absenceModalFeedback');

    if (!dateFrom || !dateTo) {
        fb.innerHTML = '<div class="alert alert-danger py-2 mb-0">Please fill in both dates.</div>';
        return;
    }
    if (dateFrom > dateTo) {
        fb.innerHTML = '<div class="alert alert-danger py-2 mb-0">"From" date must be on or before "To" date.</div>';
        return;
    }

    const btn  = document.getElementById('confirmAbsenceBtn');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
        const res  = await fetch('/api/workers/absence/add', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ worker_name: _absenceWorkerName, date_from: dateFrom, date_to: dateTo, reason: reason }),
        });
        const data = await res.json();
        if (data.success) {
            bootstrap.Modal.getInstance(document.getElementById('absenceModal')).hide();
            loadWorkers();
        } else {
            fb.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + escapeHtml(data.error) + '</div>';
        }
    } catch (err) {
        fb.innerHTML = '<div class="alert alert-danger py-2 mb-0">Network error: ' + escapeHtml(err.message) + '</div>';
    } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
    }
}

async function removeAbsence(workerName, idx) {
    if (!confirm('Remove this absence record?')) return;
    try {
        const res  = await fetch('/api/workers/absence/remove', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ worker_name: workerName, index: idx }),
        });
        const data = await res.json();
        if (data.success) loadWorkers();
        else alert('Error: ' + data.error);
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

// ── Permanent delete ─────────────────────────────────────────────────────────

function confirmPermanentDelete(name) {
    _permanentDeleteName = name;
    document.getElementById('deleteWorkerNameDisplay').textContent = name;
    const modal = new bootstrap.Modal(document.getElementById('permanentDeleteModal'));
    modal.show();
}

async function permanentDeleteWorker(name) {
    const modal = bootstrap.Modal.getInstance(document.getElementById('permanentDeleteModal'));
    if (modal) modal.hide();

    const btn = document.getElementById('confirmPermanentDeleteBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

    try {
        const res  = await fetch('/api/workers/permanent-delete', {
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
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-trash"></i> Yes, Delete Permanently';
        _permanentDeleteName = null;
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
