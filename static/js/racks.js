// static/js/racks.js

var QUANTITY_OPTIONS = ['0.25', '0.5', '0.75', '1'];

document.addEventListener('DOMContentLoaded', function () {
    loadRacks();

    document.getElementById('addBayBtn').addEventListener('click', function () {
        appendRow({ bay_code: '', size_preferable: '', actual_size: '', quantity: '0.25' });
    });

    document.getElementById('saveBtn').addEventListener('click', saveRacks);
});

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadRacks() {
    try {
        var res  = await fetch('/api/racks');
        var data = await res.json();
        if (!data.success) { showAlert('danger', 'Error loading racks: ' + data.error); return; }

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

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveRacks() {
    var racks = collectRows();
    var btn   = document.getElementById('saveBtn');
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

    // Remove the empty-state placeholder if present
    var empty = tbody.querySelector('.empty-state');
    if (empty) empty.parentElement.remove();

    var tr = document.createElement('tr');

    tr.innerHTML =
        '<td><input type="text" class="form-control form-control-sm" placeholder="e.g. A-01" value="' + escHtml(rack.bay_code) + '"></td>' +
        '<td><input type="text" class="form-control form-control-sm" placeholder="e.g. Large" value="' + escHtml(rack.size_preferable) + '"></td>' +
        '<td><input type="text" class="form-control form-control-sm" placeholder="e.g. Medium" value="' + escHtml(rack.actual_size) + '"></td>' +
        '<td>' +
          '<div class="d-flex align-items-center gap-1">' +
            buildQtySelect(rack.quantity) +
            '<span class="qty-unit">box</span>' +
          '</div>' +
        '</td>' +
        '<td class="text-center">' +
          '<button class="btn btn-sm btn-outline-danger btn-delete-row" title="Remove row">' +
            '<i class="fas fa-trash-alt"></i>' +
          '</button>' +
        '</td>';

    tr.querySelector('.btn-delete-row').addEventListener('click', function () {
        tr.remove();
        if (document.getElementById('racksBody').children.length === 0) setEmpty();
    });

    tbody.appendChild(tr);
}

function buildQtySelect(selected) {
    var html = '<select class="form-select form-select-sm" style="width:90px;">';
    QUANTITY_OPTIONS.forEach(function (opt) {
        html += '<option value="' + opt + '"' + (opt === selected ? ' selected' : '') + '>' + opt + '</option>';
    });
    html += '</select>';
    return html;
}

function collectRows() {
    var rows  = document.querySelectorAll('#racksBody tr');
    var racks = [];
    rows.forEach(function (tr) {
        var inputs  = tr.querySelectorAll('input');
        var selects = tr.querySelectorAll('select');
        if (!inputs.length) return;          // skip empty-state row
        racks.push({
            bay_code:        inputs[0] ? inputs[0].value.trim() : '',
            size_preferable: inputs[1] ? inputs[1].value.trim() : '',
            actual_size:     inputs[2] ? inputs[2].value.trim() : '',
            quantity:        selects[0] ? selects[0].value : '0.25',
        });
    });
    return racks;
}

function setEmpty() {
    document.getElementById('racksBody').innerHTML =
        '<tr>' +
          '<td colspan="5" class="text-center py-4 text-muted empty-state">' +
            '<i class="fas fa-pallet me-2 opacity-50"></i>No bays yet. Click <strong>Add Bay</strong> to get started.' +
          '</td>' +
        '</tr>';
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function showAlert(type, msg) {
    var area = document.getElementById('alertArea');
    area.innerHTML =
        '<div class="alert alert-' + type + ' alert-dismissible fade show py-2" role="alert">' +
          msg +
          '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>' +
        '</div>';
}

function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
