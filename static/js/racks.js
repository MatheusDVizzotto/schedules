// static/js/racks.js

var QUANTITY_OPTIONS = (function () {
    var opts = [{ value: '', label: 'None' }];
    for (var i = 0.25; i <= 6; i = Math.round((i + 0.25) * 100) / 100) {
        var label = Number.isInteger(i) ? String(i) : i.toFixed(2);
        opts.push({ value: label, label: label });
    }
    return opts;
}());

// item_options.js loaded before this file — provides ITEM_TYPE_OPTIONS,
// buildItemTypeOptions(), buildDimensionOptions(), escHtml()

var locations = [];              // current location list
var activeLocationFilter = null; // null = show all

// ── Startup ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    loadRacks();

    document.getElementById('addBayBtn').addEventListener('click', function () {
        appendRow({ location: activeLocationFilter || '', bay_code: '', size_preferable: '', actual_size: '', quantity: '', qty_unit: '', item_type: '', item_subtype: '' });
    });

    document.getElementById('saveBtn').addEventListener('click', saveRacks);

    document.getElementById('applyUnitBtn').addEventListener('click', function () {
        var loc  = document.getElementById('bulkUnitLoc').value;
        var unit = document.getElementById('bulkUnit').value;
        if (!loc) { showAlert('warning', '<i class="fas fa-exclamation-triangle me-1"></i> Please select a location first.'); return; }
        var rows = document.querySelectorAll('#racksBody tr');
        var count = 0;
        rows.forEach(function (tr) {
            var locSel = tr.querySelector('select[data-field="location"]');
            if (!locSel || locSel.value !== loc) return;
            tr.querySelector('select[data-field="qty_unit"]').value = unit;
            count++;
        });
        showAlert('success', '<i class="fas fa-check-circle me-1"></i> Set unit to <strong>' + escHtml(unit) + '</strong> for ' + count + ' bay(s) in <strong>' + escHtml(loc) + '</strong>.');
    });

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
    var html = locations.map(function (loc) {
        var isActive = loc === activeLocationFilter;
        return '<span class="location-chip' + (isActive ? ' location-chip-active' : '') + '" data-loc="' + escHtml(loc) + '" title="Click to filter bays by this location">' +
            '<i class="fas fa-map-marker-alt me-1" style="font-size:0.75rem;"></i>' + escHtml(loc) + '</span>';
    }).join('');
    if (activeLocationFilter) {
        html += '<a href="#" class="small ms-2 text-muted" id="clearLocFilter" style="text-decoration:none;">× Show all</a>';
    }
    panel.innerHTML = html;

    panel.querySelectorAll('.location-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
            var loc = chip.getAttribute('data-loc');
            activeLocationFilter = (activeLocationFilter === loc) ? null : loc;
            renderLocationsPanel();
            filterBaysTable();
        });
    });

    var clearBtn = panel.querySelector('#clearLocFilter');
    if (clearBtn) {
        clearBtn.addEventListener('click', function (e) {
            e.preventDefault();
            activeLocationFilter = null;
            renderLocationsPanel();
            filterBaysTable();
        });
    }

    var bulkLocSel = document.getElementById('bulkUnitLoc');
    var current = bulkLocSel.value;
    bulkLocSel.innerHTML = '<option value="">— location —</option>' +
        locations.map(function (loc) {
            return '<option value="' + escHtml(loc) + '"' + (loc === current ? ' selected' : '') + '>' + escHtml(loc) + '</option>';
        }).join('');
}

function filterBaysTable() {
    document.querySelectorAll('#racksBody tr').forEach(function (tr) {
        if (tr.querySelector('.empty-state')) return;
        if (!activeLocationFilter) { tr.style.display = ''; return; }
        var locSel = tr.querySelector('select[data-field="location"]');
        if (!locSel) return;
        tr.style.display = (locSel.value === activeLocationFilter) ? '' : 'none';
    });
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

    var hasType     = !!rack.item_type;
    var subtypeHtml = hasType
        ? buildDimensionOptions(rack.item_type, rack.item_subtype)
        : '<option value="">— select type first —</option>';

    var tr = document.createElement('tr');
    tr.innerHTML =
        '<td><select class="form-select form-select-sm" data-field="location">' + buildLocationOptions(rack.location) + '</select></td>' +
        '<td><input type="text" class="form-control form-control-sm" placeholder="e.g. A-01" value="' + escHtml(rack.bay_code) + '"></td>' +
        '<td><input type="text" class="form-control form-control-sm" placeholder="e.g. Large" value="' + escHtml(rack.size_preferable) + '"></td>' +
        '<td><input type="text" class="form-control form-control-sm" placeholder="e.g. Medium" value="' + escHtml(rack.actual_size) + '"></td>' +
        '<td>' +
          '<div class="d-flex align-items-center gap-1">' +
            '<select class="form-select form-select-sm" data-field="quantity" style="width:90px;">' + buildQtyOptions(rack.quantity) + '</select>' +
            '<select class="form-select form-select-sm" data-field="qty_unit" style="width:100px;">' + buildQtyUnitOptions(rack.qty_unit || '') + '</select>' +
          '</div>' +
        '</td>' +
        '<td><select class="form-select form-select-sm" data-field="item_type">' + buildItemTypeOptions(rack.item_type) + '</select></td>' +
        '<td><select class="form-select form-select-sm" data-field="item_subtype"' + (hasType ? '' : ' disabled') + '>' + subtypeHtml + '</select></td>' +
        '<td class="text-center">' +
          '<div class="d-flex gap-1 justify-content-center">' +
            '<button class="btn btn-sm btn-outline-secondary btn-clear-bay" title="Clear bay"><i class="fas fa-broom"></i></button>' +
            '<button class="btn btn-sm btn-outline-danger btn-delete-row" title="Remove row"><i class="fas fa-trash-alt"></i></button>' +
          '</div>' +
        '</td>';

    var locSelect      = tr.querySelector('select[data-field="location"]');
    var itemTypeSel    = tr.querySelector('select[data-field="item_type"]');
    var itemSubtypeSel = tr.querySelector('select[data-field="item_subtype"]');

    locSelect.addEventListener('change', function () { filterBaysTable(); });

    itemTypeSel.addEventListener('change', function () {
        var type = itemTypeSel.value;
        itemSubtypeSel.innerHTML = type
            ? buildDimensionOptions(type, '')
            : '<option value="">— select type first —</option>';
        itemSubtypeSel.disabled = !type;
    });

    tr.querySelector('.btn-clear-bay').addEventListener('click', function () {
        tr.querySelectorAll('input')[2].value = '';  // actual_size (3rd input)
        tr.querySelector('select[data-field="quantity"]').value = '';
        tr.querySelector('select[data-field="qty_unit"]').value = '';
        itemTypeSel.value = '';
        itemSubtypeSel.innerHTML = '<option value="">— select type first —</option>';
        itemSubtypeSel.disabled = true;
    });

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
            qty_unit:        tr.querySelector('select[data-field="qty_unit"]').value,
            item_type:       tr.querySelector('select[data-field="item_type"]').value,
            item_subtype:    tr.querySelector('select[data-field="item_subtype"]').value,
        });
    });
    return racks;
}

function setEmpty() {
    document.getElementById('racksBody').innerHTML =
        '<tr><td colspan="8" class="text-center py-4 text-muted empty-state">' +
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