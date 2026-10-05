// static/js/racks_config.js

var cfgData = { types: [], dimensions: [], units: [], statuses: [], next_locations: [], notes: [], customers: [] };

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

    document.getElementById('addStatusBtn').addEventListener('click', function () { statusMgr.submitAdd(); });
    document.getElementById('statusNameInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') statusMgr.submitAdd(); });
    document.getElementById('addNextLocBtn').addEventListener('click', function () { nextLocMgr.submitAdd(); });
    document.getElementById('nextLocNameInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') nextLocMgr.submitAdd(); });
    document.getElementById('addNoteBtn').addEventListener('click', function () { noteMgr.submitAdd(); });
    document.getElementById('noteNameInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') noteMgr.submitAdd(); });
    document.getElementById('addCustomerBtn').addEventListener('click', function () { customerMgr.submitAdd(); });
    document.getElementById('customerNameInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') customerMgr.submitAdd(); });
});

async function loadConfig() {
    try {
        var res  = await fetch('/api/racks/config');
        var data = await res.json();
        if (!data.success) { showAlert('danger', 'Error loading config: ' + data.error); return; }
        cfgData = {
            types:          data.types          || [],
            dimensions:     data.dimensions     || [],
            units:          data.units          || [],
            statuses:       data.statuses       || [],
            next_locations: data.next_locations || [],
            notes:          data.notes          || [],
            customers:      data.customers      || [],
        };
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
    statusMgr.render();
    nextLocMgr.render();
    noteMgr.render();
    customerMgr.render();
}

// ── Types ─────────────────────────────────────────────────────────────────────

function renderTypes() {
    var el = document.getElementById('typesList');
    if (!cfgData.types.length) { el.className = 'cfg-list-empty'; el.textContent = 'No types registered yet.'; return; }
    el.className = '';
    el.innerHTML = cfgData.types.map(function (t) {
        return '<div class="cfg-list-item" data-type="' + escHtml(t) + '">' +
            '<span class="item-label"><i class="fas fa-tag me-2 text-muted" style="font-size:0.72rem;"></i>' + escHtml(t) + '</span>' +
            '<span class="item-actions">' +
              '<button class="btn btn-sm btn-outline-secondary py-0 px-1 btn-edit-type" title="Edit"><i class="fas fa-pencil-alt"></i></button>' +
              '<button class="btn btn-sm btn-outline-danger py-0 px-1 btn-delete-type" title="Delete"><i class="fas fa-trash-alt"></i></button>' +
            '</span>' +
        '</div>';
    }).join('');
    el.querySelectorAll('.btn-edit-type').forEach(function (btn) {
        btn.addEventListener('click', function () { startEditType(btn.closest('.cfg-list-item')); });
    });
    el.querySelectorAll('.btn-delete-type').forEach(function (btn) {
        btn.addEventListener('click', function () { deleteType(btn.closest('.cfg-list-item').getAttribute('data-type')); });
    });
}

function startEditType(itemEl) {
    var name = itemEl.getAttribute('data-type');
    itemEl.outerHTML =
        '<div class="cfg-edit-row" data-editing-type="' + escHtml(name) + '">' +
          '<div class="cfg-edit-fields">' +
            '<div class="form-group" style="flex:1;">' +
              '<label>Name</label>' +
              '<input type="text" class="form-control form-control-sm edit-type-name" value="' + escHtml(name) + '">' +
            '</div>' +
          '</div>' +
          '<div class="d-flex gap-2">' +
            '<button class="btn btn-sm btn-success btn-save-type-edit">Save</button>' +
            '<button class="btn btn-sm btn-outline-secondary btn-cancel-type-edit">Cancel</button>' +
          '</div>' +
          '<div class="text-danger small mt-1 edit-type-err d-none"></div>' +
        '</div>';
    var row = document.querySelector('[data-editing-type="' + name + '"]');
    row.querySelector('.btn-save-type-edit').addEventListener('click', function () { saveTypeEdit(row, name); });
    row.querySelector('.btn-cancel-type-edit').addEventListener('click', function () { renderTypes(); });
}

async function saveTypeEdit(row, oldName) {
    var newName = row.querySelector('.edit-type-name').value.trim();
    if (!newName) return;
    var errEl = row.querySelector('.edit-type-err');
    errEl.classList.add('d-none');
    try {
        var res  = await fetch('/api/racks/config/types/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ old_name: oldName, new_name: newName }) });
        var data = await res.json();
        if (!data.success) { errEl.textContent = data.error; errEl.classList.remove('d-none'); return; }
        cfgData.types = data.types;
        renderTypes();
        populateDimTypeSelect();
        showAlert('success', '<i class="fas fa-check-circle me-1"></i> Type updated.');
    } catch (err) { errEl.textContent = err.message; errEl.classList.remove('d-none'); }
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
        var key = escHtml(d.type) + '|' + escHtml(d.thickness) + '|' + escHtml(d.width);
        var label = '<strong>' + escHtml(d.type) + '</strong> — ' +
            '<span class="text-muted">T:</span> ' + escHtml(d.thickness) +
            (d.width ? '  <span class="text-muted">W:</span> ' + escHtml(d.width) : '');
        return '<div class="cfg-list-item" data-dim="' + key + '">' +
            '<span class="item-label" style="font-size:0.83rem;">' + label + '</span>' +
            '<span class="item-actions">' +
              '<button class="btn btn-sm btn-outline-secondary py-0 px-1 btn-edit-dim" title="Edit"><i class="fas fa-pencil-alt"></i></button>' +
              '<button class="btn btn-sm btn-outline-danger py-0 px-1 btn-delete-dim" title="Delete"><i class="fas fa-trash-alt"></i></button>' +
            '</span>' +
        '</div>';
    }).join('');
    el.querySelectorAll('.btn-edit-dim').forEach(function (btn) {
        btn.addEventListener('click', function () { startEditDim(btn.closest('.cfg-list-item')); });
    });
    el.querySelectorAll('.btn-delete-dim').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var parts = btn.closest('.cfg-list-item').getAttribute('data-dim').split('|');
            deleteDim(parts[0], parts[1], parts[2]);
        });
    });
}

function startEditDim(itemEl) {
    var parts = itemEl.getAttribute('data-dim').split('|');
    var oType = parts[0], oThick = parts[1], oWidth = parts[2];
    var typeOpts = cfgData.types.map(function (t) {
        return '<option value="' + escHtml(t) + '"' + (t === oType ? ' selected' : '') + '>' + escHtml(t) + '</option>';
    }).join('');
    itemEl.outerHTML =
        '<div class="cfg-edit-row" data-editing-dim="' + escHtml(oType) + '|' + escHtml(oThick) + '|' + escHtml(oWidth) + '">' +
          '<div class="cfg-edit-fields">' +
            '<div class="form-group" style="min-width:110px;">' +
              '<label>Type</label>' +
              '<select class="form-select form-select-sm edit-dim-type"><option value="">— select —</option>' + typeOpts + '</select>' +
            '</div>' +
            '<div class="form-group" style="width:90px;">' +
              '<label>Thickness</label>' +
              '<input type="text" class="form-control form-control-sm edit-dim-thickness" value="' + escHtml(oThick) + '">' +
            '</div>' +
            '<div class="form-group" style="width:90px;">' +
              '<label>Width</label>' +
              '<input type="text" class="form-control form-control-sm edit-dim-width" value="' + escHtml(oWidth) + '">' +
            '</div>' +
          '</div>' +
          '<div class="d-flex gap-2">' +
            '<button class="btn btn-sm btn-success btn-save-dim-edit">Save</button>' +
            '<button class="btn btn-sm btn-outline-secondary btn-cancel-dim-edit">Cancel</button>' +
          '</div>' +
          '<div class="text-danger small mt-1 edit-dim-err d-none"></div>' +
        '</div>';
    var key = oType + '|' + oThick + '|' + oWidth;
    var row = document.querySelector('[data-editing-dim="' + key + '"]');
    row.querySelector('.btn-save-dim-edit').addEventListener('click', function () { saveDimEdit(row, oType, oThick, oWidth); });
    row.querySelector('.btn-cancel-dim-edit').addEventListener('click', function () { renderDims(); });
}

async function saveDimEdit(row, oType, oThick, oWidth) {
    var newType  = row.querySelector('.edit-dim-type').value;
    var newThick = row.querySelector('.edit-dim-thickness').value.trim();
    var newWidth = row.querySelector('.edit-dim-width').value.trim();
    var errEl = row.querySelector('.edit-dim-err');
    if (!newType || !newThick) { errEl.textContent = 'Type and thickness are required.'; errEl.classList.remove('d-none'); return; }
    errEl.classList.add('d-none');
    try {
        var res  = await fetch('/api/racks/config/dimensions/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ old_type: oType, old_thickness: oThick, old_width: oWidth, new_type: newType, new_thickness: newThick, new_width: newWidth }) });
        var data = await res.json();
        if (!data.success) { errEl.textContent = data.error; errEl.classList.remove('d-none'); return; }
        cfgData.dimensions = data.dimensions;
        renderDims();
        showAlert('success', '<i class="fas fa-check-circle me-1"></i> Dimension updated.');
    } catch (err) { errEl.textContent = err.message; errEl.classList.remove('d-none'); }
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
    if (!type || !thickness) { setError('dimError', 'Type and thickness are required.'); return; }
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
    if (!confirm('Delete ' + type + ' T:' + thickness + (width ? ' W:' + width : '') + '?')) return;
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
        var label = '<strong>' + escHtml(u.name) + '</strong>' + (dims ? ' <span class="text-muted small">(' + escHtml(dims) + ' mm)</span>' : '');
        return '<div class="cfg-list-item" data-unit="' + escHtml(u.name) + '">' +
            '<span class="item-label">' + label + '</span>' +
            '<span class="item-actions">' +
              '<button class="btn btn-sm btn-outline-secondary py-0 px-1 btn-edit-unit" title="Edit"><i class="fas fa-pencil-alt"></i></button>' +
              '<button class="btn btn-sm btn-outline-danger py-0 px-1 btn-delete-unit" title="Delete"><i class="fas fa-trash-alt"></i></button>' +
            '</span>' +
        '</div>';
    }).join('');
    el.querySelectorAll('.btn-edit-unit').forEach(function (btn) {
        btn.addEventListener('click', function () { startEditUnit(btn.closest('.cfg-list-item')); });
    });
    el.querySelectorAll('.btn-delete-unit').forEach(function (btn) {
        btn.addEventListener('click', function () { deleteUnit(btn.closest('.cfg-list-item').getAttribute('data-unit')); });
    });
}

function startEditUnit(itemEl) {
    var oldName = itemEl.getAttribute('data-unit');
    var u = cfgData.units.find(function (x) { return x.name === oldName; }) || { name: oldName, length: '', width: '', height: '' };
    itemEl.outerHTML =
        '<div class="cfg-edit-row" data-editing-unit="' + escHtml(oldName) + '">' +
          '<div class="cfg-edit-fields">' +
            '<div class="form-group" style="flex:1;min-width:80px;">' +
              '<label>Name</label>' +
              '<input type="text" class="form-control form-control-sm edit-unit-name" value="' + escHtml(u.name) + '">' +
            '</div>' +
            '<div class="form-group" style="width:68px;">' +
              '<label>Length</label>' +
              '<input type="text" class="form-control form-control-sm edit-unit-length" value="' + escHtml(u.length) + '" placeholder="mm">' +
            '</div>' +
            '<div class="form-group" style="width:68px;">' +
              '<label>Width</label>' +
              '<input type="text" class="form-control form-control-sm edit-unit-width" value="' + escHtml(u.width) + '" placeholder="mm">' +
            '</div>' +
            '<div class="form-group" style="width:68px;">' +
              '<label>Height</label>' +
              '<input type="text" class="form-control form-control-sm edit-unit-height" value="' + escHtml(u.height) + '" placeholder="mm">' +
            '</div>' +
          '</div>' +
          '<div class="d-flex gap-2">' +
            '<button class="btn btn-sm btn-success btn-save-unit-edit">Save</button>' +
            '<button class="btn btn-sm btn-outline-secondary btn-cancel-unit-edit">Cancel</button>' +
          '</div>' +
          '<div class="text-danger small mt-1 edit-unit-err d-none"></div>' +
        '</div>';
    var row = document.querySelector('[data-editing-unit="' + oldName + '"]');
    row.querySelector('.btn-save-unit-edit').addEventListener('click', function () { saveUnitEdit(row, oldName); });
    row.querySelector('.btn-cancel-unit-edit').addEventListener('click', function () { renderUnits(); });
}

async function saveUnitEdit(row, oldName) {
    var newName = row.querySelector('.edit-unit-name').value.trim();
    var length  = row.querySelector('.edit-unit-length').value.trim();
    var width   = row.querySelector('.edit-unit-width').value.trim();
    var height  = row.querySelector('.edit-unit-height').value.trim();
    var errEl = row.querySelector('.edit-unit-err');
    if (!newName) { errEl.textContent = 'Name is required.'; errEl.classList.remove('d-none'); return; }
    errEl.classList.add('d-none');
    try {
        var res  = await fetch('/api/racks/config/units/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ old_name: oldName, new_name: newName, length: length, width: width, height: height }) });
        var data = await res.json();
        if (!data.success) { errEl.textContent = data.error; errEl.classList.remove('d-none'); return; }
        cfgData.units = data.units;
        renderUnits();
        showAlert('success', '<i class="fas fa-check-circle me-1"></i> Unit updated.');
    } catch (err) { errEl.textContent = err.message; errEl.classList.remove('d-none'); }
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

// ── Generic simple-name list manager ─────────────────────────────────────────
// cfg: { key, apiBase, responseKey, listId, inputId, errorId, icon, label, editAttr }

function makeSimpleConfigManager(cfg) {

    function render() {
        var el = document.getElementById(cfg.listId);
        var items = cfgData[cfg.key];
        if (!items || !items.length) {
            el.className = 'cfg-list-empty';
            el.textContent = 'No ' + cfg.label.toLowerCase() + ' registered yet.';
            return;
        }
        el.className = '';
        el.innerHTML = items.map(function (name) {
            return '<div class="cfg-list-item" data-' + cfg.editAttr + '="' + escHtml(name) + '">' +
                '<span class="item-label"><i class="' + cfg.icon + ' me-2 text-muted" style="font-size:0.72rem;"></i>' + escHtml(name) + '</span>' +
                '<span class="item-actions">' +
                  '<button class="btn btn-sm btn-outline-secondary py-0 px-1 btn-edit-simple" title="Edit"><i class="fas fa-pencil-alt"></i></button>' +
                  '<button class="btn btn-sm btn-outline-danger py-0 px-1 btn-delete-simple" title="Delete"><i class="fas fa-trash-alt"></i></button>' +
                '</span>' +
            '</div>';
        }).join('');
        el.querySelectorAll('.btn-edit-simple').forEach(function (btn) {
            btn.addEventListener('click', function () { startEdit(btn.closest('[data-' + cfg.editAttr + ']')); });
        });
        el.querySelectorAll('.btn-delete-simple').forEach(function (btn) {
            btn.addEventListener('click', function () { deleteItem(btn.closest('[data-' + cfg.editAttr + ']').getAttribute('data-' + cfg.editAttr)); });
        });
    }

    function startEdit(itemEl) {
        var name = itemEl.getAttribute('data-' + cfg.editAttr);
        itemEl.outerHTML =
            '<div class="cfg-edit-row" data-editing-' + cfg.editAttr + '="' + escHtml(name) + '">' +
              '<div class="cfg-edit-fields">' +
                '<div class="form-group" style="flex:1;">' +
                  '<label>Name</label>' +
                  '<input type="text" class="form-control form-control-sm edit-simple-name" value="' + escHtml(name) + '">' +
                '</div>' +
              '</div>' +
              '<div class="d-flex gap-2">' +
                '<button class="btn btn-sm btn-success btn-save-simple-edit">Save</button>' +
                '<button class="btn btn-sm btn-outline-secondary btn-cancel-simple-edit">Cancel</button>' +
              '</div>' +
              '<div class="text-danger small mt-1 edit-simple-err d-none"></div>' +
            '</div>';
        var row = document.querySelector('[data-editing-' + cfg.editAttr + '="' + name + '"]');
        row.querySelector('.btn-save-simple-edit').addEventListener('click', function () { saveEdit(row, name); });
        row.querySelector('.btn-cancel-simple-edit').addEventListener('click', function () { render(); });
    }

    async function saveEdit(row, oldName) {
        var newName = row.querySelector('.edit-simple-name').value.trim();
        if (!newName) return;
        var errEl = row.querySelector('.edit-simple-err');
        errEl.classList.add('d-none');
        try {
            var res  = await fetch(cfg.apiBase + '/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ old_name: oldName, new_name: newName }) });
            var data = await res.json();
            if (!data.success) { errEl.textContent = data.error; errEl.classList.remove('d-none'); return; }
            cfgData[cfg.key] = data[cfg.responseKey];
            render();
            showAlert('success', '<i class="fas fa-check-circle me-1"></i> ' + cfg.label + ' updated.');
        } catch (err) { errEl.textContent = err.message; errEl.classList.remove('d-none'); }
    }

    async function submitAdd() {
        var name = document.getElementById(cfg.inputId).value.trim();
        if (!name) return;
        setError(cfg.errorId, null);
        try {
            var res  = await fetch(cfg.apiBase, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name }) });
            var data = await res.json();
            if (!data.success) { setError(cfg.errorId, data.error); return; }
            cfgData[cfg.key] = data[cfg.responseKey];
            document.getElementById(cfg.inputId).value = '';
            render();
            showAlert('success', '<i class="fas fa-check-circle me-1"></i> ' + cfg.label + ' <strong>' + escHtml(name) + '</strong> added.');
        } catch (err) { setError(cfg.errorId, err.message); }
    }

    async function deleteItem(name) {
        if (!confirm('Delete "' + name + '"?')) return;
        try {
            var res  = await fetch(cfg.apiBase + '/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name }) });
            var data = await res.json();
            if (!data.success) { showAlert('danger', 'Error: ' + data.error); return; }
            cfgData[cfg.key] = data[cfg.responseKey];
            render();
        } catch (err) { showAlert('danger', err.message); }
    }

    return { render: render, submitAdd: submitAdd };
}

var statusMgr = makeSimpleConfigManager({
    key: 'statuses', apiBase: '/api/racks/config/statuses', responseKey: 'statuses',
    listId: 'statusesList', inputId: 'statusNameInput', errorId: 'statusError',
    icon: 'fas fa-circle', label: 'Status', editAttr: 'status',
});

var nextLocMgr = makeSimpleConfigManager({
    key: 'next_locations', apiBase: '/api/racks/config/next-locations', responseKey: 'next_locations',
    listId: 'nextLocsList', inputId: 'nextLocNameInput', errorId: 'nextLocError',
    icon: 'fas fa-map-marker-alt', label: 'Next Location', editAttr: 'next-loc',
});

var noteMgr = makeSimpleConfigManager({
    key: 'notes', apiBase: '/api/racks/config/notes', responseKey: 'notes',
    listId: 'notesList', inputId: 'noteNameInput', errorId: 'noteError',
    icon: 'fas fa-sticky-note', label: 'Note', editAttr: 'note',
});

var customerMgr = makeSimpleConfigManager({
    key: 'customers', apiBase: '/api/racks/config/customers', responseKey: 'customers',
    listId: 'customersList', inputId: 'customerNameInput', errorId: 'customerError',
    icon: 'fas fa-user', label: 'Customer', editAttr: 'customer',
});