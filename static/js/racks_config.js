// static/js/racks_config.js

var cfgData = { types: [], dimensions: [], units: [] };

function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Load ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    loadConfig();

    document.getElementById('addTypeBtn').addEventListener('click', submitAddType);
    document.getElementById('typeNameInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitAddType(); });

    document.getElementById('addDimBtn').addEventListener('click', submitAddDim);
    document.getElementById('addUnitBtn').addEventListener('click', submitAddUnit);
});

async function loadConfig() {
    try {
        var res  = await fetch('/api/racks/config');
        var data = await res.json();
        if (!data.success) { showAlert('danger', 'Error loading config: ' + data.error); return; }
        cfgData = { types: data.types || [], dimensions: data.dimensions || [], units: data.units || [] };
        renderAll();
    } catch (err) {
        showAlert('danger', 'Network error: ' + err.message);
    }
}

function renderAll() {
    renderTypes();
    renderDims();
    renderUnits();
    populateDimTypeSelect();
}

// ── Types ─────────────────────────────────────────────────────────────────────

function renderTypes() {
    var el = document.getElementById('typesList');
    if (!cfgData.types.length) { el.className = 'cfg-list-empty'; el.textContent = 'No types registered yet.'; return; }
    el.className = '';
    el.innerHTML = cfgData.types.map(function (t) {
        return '<div class="cfg-list-item">' +
            '<span class="item-label"><i class="fas fa-tag me-2 text-muted" style="font-size:0.75rem;"></i>' + escHtml(t) + '</span>' +
            '<button class="btn btn-sm btn-outline-danger py-0 px-1" data-delete-type="' + escHtml(t) + '" title="Delete"><i class="fas fa-times"></i></button>' +
        '</div>';
    }).join('');
    el.querySelectorAll('[data-delete-type]').forEach(function (btn) {
        btn.addEventListener('click', function () { deleteType(btn.getAttribute('data-delete-type')); });
    });
}

async function submitAddType() {
    var name = document.getElementById('typeNameInput').value.trim();
    if (!name) return;
    setError('typeError', null);
    try {
        var res  = await fetch('/api/racks/config/types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name }) });
        var data = await res.json();
        if (!data.success) { setError('typeError', data.error); return; }
        cfgData.types = data.types;
        document.getElementById('typeNameInput').value = '';
        renderTypes();
        populateDimTypeSelect();
        showAlert('success', '<i class="fas fa-check-circle me-1"></i> Type <strong>' + escHtml(name) + '</strong> added.');
    } catch (err) { setError('typeError', err.message); }
}

async function deleteType(name) {
    if (!confirm('Delete type "' + name + '"?')) return;
    try {
        var res  = await fetch('/api/racks/config/types/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name }) });
        var data = await res.json();
        if (!data.success) { showAlert('danger', 'Error: ' + data.error); return; }
        cfgData.types = data.types;
        renderTypes();
        populateDimTypeSelect();
    } catch (err) { showAlert('danger', err.message); }
}

// ── Dimensions ────────────────────────────────────────────────────────────────

function renderDims() {
    var el = document.getElementById('dimsList');
    if (!cfgData.dimensions.length) { el.className = 'cfg-list-empty'; el.textContent = 'No dimensions registered yet.'; return; }
    el.className = '';
    el.innerHTML = cfgData.dimensions.map(function (d) {
        var label = escHtml(d.type) + ' — <span class="text-muted">T:</span> ' + escHtml(d.thickness) + '  <span class="text-muted">W:</span> ' + escHtml(d.width);
        return '<div class="cfg-list-item">' +
            '<span class="item-label" style="font-size:0.85rem;">' + label + '</span>' +
            '<button class="btn btn-sm btn-outline-danger py-0 px-1" data-del-type="' + escHtml(d.type) + '" data-del-thick="' + escHtml(d.thickness) + '" data-del-width="' + escHtml(d.width) + '" title="Delete"><i class="fas fa-times"></i></button>' +
        '</div>';
    }).join('');
    el.querySelectorAll('[data-del-type]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            deleteDim(btn.getAttribute('data-del-type'), btn.getAttribute('data-del-thick'), btn.getAttribute('data-del-width'));
        });
    });
}

function populateDimTypeSelect() {
    var sel = document.getElementById('dimTypeSelect');
    var cur = sel.value;
    sel.innerHTML = '<option value="">— select —</option>' +
        cfgData.types.map(function (t) {
            return '<option value="' + escHtml(t) + '"' + (t === cur ? ' selected' : '') + '>' + escHtml(t) + '</option>';
        }).join('');
}

async function submitAddDim() {
    var type      = document.getElementById('dimTypeSelect').value;
    var thickness = document.getElementById('dimThicknessInput').value.trim();
    var width     = document.getElementById('dimWidthInput').value.trim();
    if (!type || !thickness || !width) { setError('dimError', 'Type, thickness and width are all required.'); return; }
    setError('dimError', null);
    try {
        var res  = await fetch('/api/racks/config/dimensions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: type, thickness: thickness, width: width }) });
        var data = await res.json();
        if (!data.success) { setError('dimError', data.error); return; }
        cfgData.dimensions = data.dimensions;
        document.getElementById('dimThicknessInput').value = '';
        document.getElementById('dimWidthInput').value = '';
        renderDims();
        showAlert('success', '<i class="fas fa-check-circle me-1"></i> Dimension added.');
    } catch (err) { setError('dimError', err.message); }
}

async function deleteDim(type, thickness, width) {
    if (!confirm('Delete dimension ' + type + ' T:' + thickness + ' W:' + width + '?')) return;
    try {
        var res  = await fetch('/api/racks/config/dimensions/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: type, thickness: thickness, width: width }) });
        var data = await res.json();
        if (!data.success) { showAlert('danger', 'Error: ' + data.error); return; }
        cfgData.dimensions = data.dimensions;
        renderDims();
    } catch (err) { showAlert('danger', err.message); }
}

// ── Units ─────────────────────────────────────────────────────────────────────

function renderUnits() {
    var el = document.getElementById('unitsList');
    if (!cfgData.units.length) { el.className = 'cfg-list-empty'; el.textContent = 'No units registered yet.'; return; }
    el.className = '';
    el.innerHTML = cfgData.units.map(function (u) {
        var dims = [u.length, u.width, u.height].filter(Boolean).join(' × ');
        var label = escHtml(u.name) + (dims ? ' <span class="text-muted small">(' + escHtml(dims) + ' mm)</span>' : '');
        return '<div class="cfg-list-item">' +
            '<span class="item-label">' + label + '</span>' +
            '<button class="btn btn-sm btn-outline-danger py-0 px-1" data-delete-unit="' + escHtml(u.name) + '" title="Delete"><i class="fas fa-times"></i></button>' +
        '</div>';
    }).join('');
    el.querySelectorAll('[data-delete-unit]').forEach(function (btn) {
        btn.addEventListener('click', function () { deleteUnit(btn.getAttribute('data-delete-unit')); });
    });
}

async function submitAddUnit() {
    var name   = document.getElementById('unitNameInput').value.trim();
    var length = document.getElementById('unitLengthInput').value.trim();
    var width  = document.getElementById('unitWidthInput').value.trim();
    var height = document.getElementById('unitHeightInput').value.trim();
    if (!name) { setError('unitError', 'Name is required.'); return; }
    setError('unitError', null);
    try {
        var res  = await fetch('/api/racks/config/units', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, length: length, width: width, height: height }) });
        var data = await res.json();
        if (!data.success) { setError('unitError', data.error); return; }
        cfgData.units = data.units;
        ['unitNameInput','unitLengthInput','unitWidthInput','unitHeightInput'].forEach(function (id) { document.getElementById(id).value = ''; });
        renderUnits();
        showAlert('success', '<i class="fas fa-check-circle me-1"></i> Unit <strong>' + escHtml(name) + '</strong> added.');
    } catch (err) { setError('unitError', err.message); }
}

async function deleteUnit(name) {
    if (!confirm('Delete unit "' + name + '"?')) return;
    try {
        var res  = await fetch('/api/racks/config/units/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name }) });
        var data = await res.json();
        if (!data.success) { showAlert('danger', 'Error: ' + data.error); return; }
        cfgData.units = data.units;
        renderUnits();
    } catch (err) { showAlert('danger', err.message); }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function setError(id, msg) {
    var el = document.getElementById(id);
    if (msg) { el.textContent = msg; el.classList.remove('d-none'); }
    else { el.classList.add('d-none'); }
}

function showAlert(type, msg) {
    var area = document.getElementById('alertArea');
    area.innerHTML = '<div class="alert alert-' + type + ' alert-dismissible fade show py-2" role="alert">' +
        msg + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>';
}