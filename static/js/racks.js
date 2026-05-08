// static/js/racks.js

var QUANTITY_OPTIONS = [
    { value: '',     label: 'None' },
    { value: '0.25', label: '0.25' },
    { value: '0.50', label: '0.50' },
    { value: '0.75', label: '0.75' },
    { value: '1',    label: '1'    },
];

var locations = [];   // current location list

// ── Startup ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    loadRacks();

    document.getElementById('addBayBtn').addEventListener('click', function () {
        appendRow({ location: '', bay_code: '', size_preferable: '', actual_size: '', quantity: '' });
    });

    document.getElementById('saveBtn').addEventListener('click', saveRacks);

    // Location form toggle
    document.getElementById('addLocationBtn').addEventListener('click', function () {
        document.getElementById('addLocationForm').classList.remove('d-none');
        document.getElementById('newLocationName').focus();
    });
    document.getElementById('cancelAddLocation').addEventListener('click', function () {
        hideLocationForm();
    });
    document.getElementById('confirmAddLocation').addEventListener('click', submitAddLocation);
    document.getElementById('newLocationName').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submitAddLocation();
        if (e.key === 'Escape') hideLocationForm();
    });
});

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadRacks() {
    try {
        var res  = await fetch('/api/racks');
        var data = await res.json();
        if (!data.success) { showAlert('danger', 'Error loading racks: ' + data.error); return; }

        locations = data.locations || [];
        renderLocationsPanel();

        var tbody = document.getElementById('racksBody');
        tbody.innerHTML = '';
        if (data.racks.length === 0) {
            setEmpty();
        } else {
            data.racks.forEach(function (rack) { appendRow(rack); });
        }
    } catch (err) {
        showAlert('danger', 'Network error: ' + err.message);
    }
}

// ── Locations panel ───────────────────────────────────────────────────────────

function renderLocationsPanel() {
    var panel = document.getElementById('locationsPanel');
    if (locations.length === 0) {
        panel.innerHTML = '<span class="text-muted small fst-italic">No locations yet — add one above.</span>';
        return;
    }
    panel.innerHTML = locations.map(function (loc) {
        return '<span class="location-chip"><i class="fas fa-map-marker-alt me-1" style="color:#2d5a27;font-size:0.75rem;"></i>' + escHtml(loc) + '</span>';
    }).join('');
}

async function submitAddLocation() {
    var name = document.getElementById('newLocationName').value.trim();
    if (!name) return;

    var errEl = document.getElementById('locationError');
    errEl.classList.add('d-none');

    try {
        var res  = await fetch('/api/racks/locations/add', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ name: name }),
        });
        var data = await res.json();
        if (!data.success) {
            errEl.textContent = data.error;
            errEl.classList.remove('d-none');
            return;
        }
        locations = data.locations;
        renderLocationsPanel();
        updateAllLocationSelects();
        hideLocationForm();
        showAlert('success', '<i class="fas fa-check-circle me-1"></i> Location <strong>' + escHtml(name) + '</strong> created.');
    } catch (err) {
        errEl.textContent = 'Network error: ' + err.message;
        errEl.classList.remove('d-none');
    }
}

function hideLocationForm() {
    document.getElementById('addLocationForm').classList.add('d-none');
    document.getElementById('newLocationName').value = '';
    document.getElementById('locationError').classList.add('d-none');
}

function updateAllLocationSelects() {
    document.querySelectorAll('#racksBody select[data-field="location"]').forEach(function (sel) {
        var current = sel.value;
        sel.innerHTML = buildLocationOptions(current);
    });
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveRacks() {
    var racks = collectRows();
    var missing = racks.filter(function (r) { return !r.location; });
    if (missing.length > 0) {
        showAlert('warning', '<i class="fas fa-exclamation-triangle me-1"></i> ' + missing.length + ' bay(s) have no location selected and will not be saved.');
    }

    var btn = document.getElementById('saveBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Saving…';

    try {
        var res  = await fetch('/api/racks/save', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ racks: racks }),
        });
        var data = await res.json();
        if (data.success) {
            showAlert('success', '<i class="fas fa-check-circle me-1"></i> Saved successfully to Google Sheets.');
        } else {
            showAlert('danger', 'Save failed: ' + data.error);
        }
    } catch (err) {
        showAlert('danger', 'Network error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save me-1"></i> Save';
    }
}

// ── Row helpers ───────────────────────────────────────────────────────────────

function appendRow(rack) {
    var tbody = document.getElementById('racksBody');
    var empty = tbody.querySelector('.empty-state');
    if (empty) empty.parentElement.remove();

    var tr = document.createElement('tr');
    tr.innerHTML =
        '<td><select class="form-select form-select-sm" data-field="location">' + buildLocationOptions(rack.location) + '</select></td>' +
        '<td><input type="text" class="form-control form-control-sm" placeholder="e.g. A-01" value="' + escHtml(rack.bay_code) + '"></td>' +
        '<td><input type="text" class="form-control form-control-sm" placeholder="e.g. Large" value="' + escHtml(rack.size_preferable) + '"></td>' +
        '<td><input type="text" class="form-control form-control-sm" placeholder="e.g. Medium" value="' + escHtml(rack.actual_size) + '"></td>' +
        '<td>' +
          '<div class="d-flex align-items-center gap-1">' +
            '<select class="form-select form-select-sm" data-field="quantity" style="width:90px;">' + buildQtyOptions(rack.quantity) + '</select>' +
            '<span class="qty-unit">box</span>' +
          '</div>' +
        '</td>' +
        '<td class="text-center">' +
          '<button class="btn btn-sm btn-outline-danger btn-delete-row" title="Remove row"><i class="fas fa-trash-alt"></i></button>' +
        '</td>';

    tr.querySelector('.btn-delete-row').addEventListener('click', function () {
        tr.remove();
        if (document.getElementById('racksBody').children.length === 0) setEmpty();
    });

    tbody.appendChild(tr);
}

function buildLocationOptions(selected) {
    var html = '<option value="">— select —</option>';
    locations.forEach(function (loc) {
        html += '<option value="' + escHtml(loc) + '"' + (loc === selected ? ' selected' : '') + '>' + escHtml(loc) + '</option>';
    });
    return html;
}

function buildQtyOptions(selected) {
    var html = '';
    QUANTITY_OPTIONS.forEach(function (opt) {
        html += '<option value="' + opt.value + '"' + (opt.value === selected ? ' selected' : '') + '>' + opt.label + '</option>';
    });
    return html;
}

function collectRows() {
    var racks = [];
    document.querySelectorAll('#racksBody tr').forEach(function (tr) {
        var inputs = tr.querySelectorAll('input');
        if (!inputs.length) return;
        racks.push({
            location:        tr.querySelector('select[data-field="location"]').value,
            bay_code:        inputs[0].value.trim(),
            size_preferable: inputs[1].value.trim(),
            actual_size:     inputs[2].value.trim(),
            quantity:        tr.querySelector('select[data-field="quantity"]').value,
        });
    });
    return racks;
}

function setEmpty() {
    document.getElementById('racksBody').innerHTML =
        '<tr><td colspan="6" class="text-center py-4 text-muted empty-state">' +
          '<i class="fas fa-pallet me-2 opacity-50"></i>No bays yet. Click <strong>Add Bay</strong> to get started.' +
        '</td></tr>';
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function showAlert(type, msg) {
    var area = document.getElementById('alertArea');
    area.innerHTML =
        '<div class="alert alert-' + type + ' alert-dismissible fade show py-2" role="alert">' +
          msg + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>' +
        '</div>';
}

function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}