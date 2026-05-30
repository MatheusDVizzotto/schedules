// static/js/dashboard.js

var currentDate = '';   // ISO YYYY-MM-DD

// ── Startup ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    setDate(adelaideToday());

    document.getElementById('dashboardDate').addEventListener('change', function () {
        setDate(this.value);
    });
    document.getElementById('prevDay').addEventListener('click', function () {
        setDate(offsetDate(currentDate, -1));
    });
    document.getElementById('nextDay').addEventListener('click', function () {
        setDate(offsetDate(currentDate, 1));
    });
    document.getElementById('todayBtn').addEventListener('click', function () {
        setDate(adelaideToday());
    });
    document.getElementById('refreshBtn').addEventListener('click', function () {
        loadDashboard(currentDate);
    });
});

// ── Date helpers ──────────────────────────────────────────────────────────────

function setDate(iso) {
    currentDate = iso;
    document.getElementById('dashboardDate').value = iso;
    document.getElementById('dateDisplay').textContent = formatDateFull(iso);
    loadDashboard(iso);
}

function offsetDate(iso, days) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function formatDateFull(iso) {
    var d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-AU', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDateShort(iso) {
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0].slice(2);
}

// ── Load schedule ─────────────────────────────────────────────────────────────

async function loadDashboard(iso) {
    var content = document.getElementById('dashboardContent');
    content.innerHTML =
        '<div class="text-center py-5 text-muted">' +
          '<div class="spinner-border text-primary mb-3" role="status"></div>' +
          '<p>Loading schedule for ' + formatDateShort(iso) + '…</p>' +
        '</div>';

    try {
        var res  = await fetch('/api/schedule/' + iso);
        var data = await res.json();

        if (!data.success) {
            showError('Error loading schedule: ' + data.error);
            return;
        }

        renderDashboard(data.schedule, iso);
    } catch (err) {
        showError('Network error: ' + err.message);
    }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderDashboard(schedule, iso) {
    var content = document.getElementById('dashboardContent');

    if (!schedule || schedule.length === 0) {
        content.innerHTML =
            '<div class="no-schedule">' +
              '<i class="fas fa-calendar-times d-block"></i>' +
              '<h5>No schedule saved for ' + formatDateShort(iso) + '</h5>' +
              '<p class="text-muted small">Create a schedule on the <a href="/">Schedule page</a> first.</p>' +
            '</div>';
        return;
    }

    // Group entries by worker → list of machine assignments
    var workerMap = {};
    schedule.forEach(function (entry) {
        if (!entry.worker) return;
        if (!workerMap[entry.worker]) workerMap[entry.worker] = [];
        workerMap[entry.worker].push({
            machine:     entry.machine    || '',
            time_start:  entry.time_start  || '',
            time_finish: entry.time_finish || '',
            notes:       entry.notes       || '',
            isArvo:      (entry.machine || '').endsWith(' - Arvo')
        });
    });

    var allWorkers = Object.keys(workerMap).sort();

    // Assign a consistent colour index per worker
    var workerColours = {};
    allWorkers.forEach(function (w, i) { workerColours[w] = i % 8; });

    // Workers that have at least one day / arvo assignment
    var dayWorkers  = allWorkers.filter(function (w) {
        return workerMap[w].some(function (a) { return !a.isArvo; });
    });
    var arvoWorkers = allWorkers.filter(function (w) {
        return workerMap[w].some(function (a) { return a.isArvo; });
    });

    // Unique machine count
    var machineSet = {};
    schedule.forEach(function (e) { if (e.machine) machineSet[e.machine] = true; });

    var html = '';

    if (dayWorkers.length > 0) {
        html += '<div class="shift-section-title"><i class="fas fa-sun me-1"></i> Day Shift</div>';
        html += '<div class="row g-3 mb-4">';
        dayWorkers.forEach(function (w) {
            var dayAssignments = workerMap[w].filter(function (a) { return !a.isArvo; });
            html += renderWorkerCard(w, dayAssignments, workerColours[w]);
        });
        html += '</div>';
    }

    if (arvoWorkers.length > 0) {
        html += '<div class="shift-section-title"><i class="fas fa-moon me-1"></i> Arvo Shift</div>';
        html += '<div class="row g-3 mb-4">';
        arvoWorkers.forEach(function (w) {
            var arvoAssignments = workerMap[w].filter(function (a) { return a.isArvo; });
            html += renderWorkerCard(w, arvoAssignments, workerColours[w]);
        });
        html += '</div>';
    }

    // Summary row
    html +=
        '<div class="card mt-2 mb-5">' +
          '<div class="card-body py-2 d-flex flex-wrap gap-4 small text-muted">' +
            '<span><i class="fas fa-users me-1"></i><strong>' + allWorkers.length + '</strong> workers</span>' +
            '<span><i class="fas fa-industry me-1"></i><strong>' + Object.keys(machineSet).length + '</strong> machines</span>' +
            '<span><i class="fas fa-sun me-1"></i><strong>' + dayWorkers.length + '</strong> day shift</span>' +
            '<span><i class="fas fa-moon me-1"></i><strong>' + arvoWorkers.length + '</strong> arvo shift</span>' +
          '</div>' +
        '</div>';

    content.innerHTML = html;
}

function shortMachineName(machine) {
    return machine
        .replace(/^Mill Floor - /,      '')
        .replace(/^Build Floor - /,     '')
        .replace(/^Recycled Floor - /,  '')
        .replace(/^Recycle Floor - /,   '')
        .replace(/ - Day$/,  '')
        .replace(/ - Arvo$/, '');
}

function floorLabel(machine) {
    if (machine.startsWith('Mill Floor'))       return 'Mill';
    if (machine.startsWith('Build Floor'))      return 'Build';
    if (machine.includes('Recycle'))            return 'Recycled';
    return '';
}

function renderWorkerCard(worker, assignments, colIdx) {
    var initials = worker.split(' ').map(function (p) { return p[0]; }).join('').toUpperCase().slice(0, 2);
    var colClass  = 'av-' + colIdx;

    var assignmentsHtml = '';
    assignments.forEach(function (a) {
        var name  = shortMachineName(a.machine);
        var floor = floorLabel(a.machine);
        var time  = (a.time_start && a.time_finish)
            ? formatTime(a.time_start) + ' – ' + formatTime(a.time_finish)
            : '';
        assignmentsHtml +=
            '<div class="d-flex justify-content-between align-items-start mb-1">' +
              '<div>' +
                '<div class="fw-semibold small">' + escapeHtml(name) + '</div>' +
                (floor ? '<div class="machine-label">' + escapeHtml(floor) + ' Floor</div>' : '') +
                (a.notes ? '<div class="notes-text"><i class="fas fa-sticky-note me-1"></i>' + escapeHtml(a.notes) + '</div>' : '') +
              '</div>' +
              (time ? '<span class="badge bg-primary time-badge ms-2 flex-shrink-0">' + escapeHtml(time) + '</span>' : '') +
            '</div>';
    });

    return (
        '<div class="col-12 col-sm-6 col-lg-4 col-xl-3">' +
          '<div class="card worker-card h-100">' +
            '<div class="card-body">' +
              '<div class="d-flex align-items-center gap-2 mb-2">' +
                '<div class="worker-avatar ' + colClass + '">' + escapeHtml(initials) + '</div>' +
                '<div class="fw-bold">' + escapeHtml(worker) + '</div>' +
              '</div>' +
              '<hr class="my-2">' +
              assignmentsHtml +
            '</div>' +
          '</div>' +
        '</div>'
    );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatTime(t) {
    // Convert HH:MM (24h) to H:MM AM/PM
    if (!t) return '';
    var parts = t.split(':');
    var h = parseInt(parts[0]);
    var m = parts[1];
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + m + ' ' + ampm;
}

function showError(msg) {
    document.getElementById('dashboardContent').innerHTML =
        '<div class="alert alert-danger m-3">' +
          '<i class="fas fa-exclamation-circle me-2"></i>' + escapeHtml(msg) +
        '</div>';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
