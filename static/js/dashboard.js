// static/js/dashboard.js

var currentDate = '';   // ISO YYYY-MM-DD

// ── Startup ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    var today = new Date().toISOString().split('T')[0];
    setDate(today);

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
        setDate(new Date().toISOString().split('T')[0]);
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

    // Group entries by machine, collect all workers per machine
    var machineMap = {};
    schedule.forEach(function (entry) {
        var key = entry.machine;
        if (!machineMap[key]) {
            machineMap[key] = {
                machine:    entry.machine,
                time_start: entry.time_start  || '',
                time_finish: entry.time_finish || '',
                notes:      entry.notes        || '',
                workers:    []
            };
        }
        if (entry.worker && machineMap[key].workers.indexOf(entry.worker) === -1) {
            machineMap[key].workers.push(entry.worker);
        }
    });

    var machines = Object.values(machineMap);

    // Split into Day and Arvo shifts
    var dayShift  = machines.filter(function (m) { return !m.machine.endsWith(' - Arvo'); });
    var arvoShift = machines.filter(function (m) { return m.machine.endsWith(' - Arvo'); });

    // Build worker colour map (consistent colour per worker name)
    var workerColours = {};
    var allWorkers = [];
    machines.forEach(function (m) {
        m.workers.forEach(function (w) {
            if (allWorkers.indexOf(w) === -1) allWorkers.push(w);
        });
    });
    allWorkers.sort().forEach(function (w, i) {
        workerColours[w] = i % 8;
    });

    var html = '';

    if (dayShift.length > 0) {
        html += '<div class="shift-section-title"><i class="fas fa-sun me-1"></i> Day Shift</div>';
        html += '<div class="row g-3 mb-4">';
        dayShift.forEach(function (m) {
            html += renderMachineCard(m, workerColours);
        });
        html += '</div>';
    }

    if (arvoShift.length > 0) {
        html += '<div class="shift-section-title"><i class="fas fa-moon me-1"></i> Arvo Shift</div>';
        html += '<div class="row g-3 mb-4">';
        arvoShift.forEach(function (m) {
            html += renderMachineCard(m, workerColours);
        });
        html += '</div>';
    }

    // Summary row
    html +=
        '<div class="card mt-2 mb-5">' +
          '<div class="card-body py-2 d-flex flex-wrap gap-4 small text-muted">' +
            '<span><i class="fas fa-industry me-1"></i><strong>' + machines.length + '</strong> machines</span>' +
            '<span><i class="fas fa-users me-1"></i><strong>' + allWorkers.length + '</strong> workers</span>' +
            '<span><i class="fas fa-sun me-1"></i><strong>' + dayShift.length + '</strong> day shift</span>' +
            '<span><i class="fas fa-moon me-1"></i><strong>' + arvoShift.length + '</strong> arvo shift</span>' +
          '</div>' +
        '</div>';

    content.innerHTML = html;
}

function renderMachineCard(m, workerColours) {
    // Strip floor prefix and shift suffix for compact machine name
    var shortMachine = m.machine
        .replace(/^Mill Floor - /,      '')
        .replace(/^Build Floor - /,     '')
        .replace(/^Recycled Floor - /,  '')
        .replace(/^Recycle Floor - /,   '')
        .replace(/ - Day$/,  '')
        .replace(/ - Arvo$/, '');

    var floorLabel = '';
    if (m.machine.startsWith('Mill Floor'))      floorLabel = 'Mill';
    else if (m.machine.startsWith('Build Floor')) floorLabel = 'Build';
    else if (m.machine.includes('Recycle'))       floorLabel = 'Recycled';

    var timeStr = '';
    if (m.time_start && m.time_finish) {
        timeStr = formatTime(m.time_start) + ' – ' + formatTime(m.time_finish);
    }

    var workersHtml = '';
    m.workers.forEach(function (worker) {
        var initials = worker.split(' ').map(function (p) { return p[0]; }).join('').toUpperCase().slice(0, 2);
        var colClass  = 'av-' + (workerColours[worker] || 0);
        workersHtml +=
            '<div class="d-flex align-items-center gap-2 mb-2">' +
              '<div class="worker-avatar ' + colClass + '">' + escapeHtml(initials) + '</div>' +
              '<div class="fw-semibold">' + escapeHtml(worker) + '</div>' +
            '</div>';
    });

    return (
        '<div class="col-12 col-sm-6 col-lg-4 col-xl-3">' +
          '<div class="card worker-card h-100">' +
            '<div class="card-body">' +
              '<div class="d-flex justify-content-between align-items-start mb-2">' +
                '<div>' +
                  '<div class="fw-bold">' + escapeHtml(shortMachine) + '</div>' +
                  (floorLabel ? '<div class="machine-label">' + escapeHtml(floorLabel) + ' Floor</div>' : '') +
                '</div>' +
                (timeStr
                  ? '<span class="badge bg-primary time-badge">' + escapeHtml(timeStr) + '</span>'
                  : '') +
              '</div>' +
              '<hr class="my-2">' +
              workersHtml +
              (m.notes ? '<div class="notes-text mt-2"><i class="fas fa-sticky-note me-1"></i>' + escapeHtml(m.notes) + '</div>' : '') +
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
