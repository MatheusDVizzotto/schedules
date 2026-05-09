// static/js/stock.js
// item_options.js loaded before this — provides buildItemTypeOptions(),
// buildDimensionOptions(), escHtml()

document.addEventListener('DOMContentLoaded', function () {
    loadStock();

    document.getElementById('addItemBtn').addEventListener('click', function () {
        appendRow({ size: '', item_type: '', dimensions: '', qty_on_hand: null, min_on_hand: '', max_on_hand: '' });
    });

    document.getElementById('saveBtn').addEventListener('click', saveStock);
});

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadStock() {
    try {
        var res  = await fetch('/api/racks/stock');
        var data = await res.json();
        if (!data.success) { showAlert('danger', 'Error loading stock: ' + data.error); return; }

        var tbody = document.getElementById('stockBody');
        tbody.innerHTML = '';
        if (data.items.length === 0) {
            setEmpty();
        } else {
            data.items.forEach(function (item) { appendRow(item); });
        }
    } catch (err) {
        showAlert('danger', 'Network error: ' + err.message);
    }
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveStock() {
    var items = collectRows();

    var btn = document.getElementById('saveBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Saving…';

    try {
        var res  = await fetch('/api/racks/stock/save', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ items: items }),
        });
        var data = await res.json();
        if (data.success) {
            showAlert('success', '<i class="fas fa-check-circle me-1"></i> Saved successfully to Google Sheets.');
            loadStock();
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

function appendRow(item) {
    var tbody = document.getElementById('stockBody');
    var empty = tbody.querySelector('.empty-state');
    if (empty) empty.parentElement.remove();

    var hasType     = !!item.item_type;
    var dimHtml     = hasType
        ? buildDimensionOptions(item.item_type, item.dimensions)
        : '<option value="">— select type first —</option>';
    var qtyDisplay  = item.qty_on_hand !== null && item.qty_on_hand !== undefined
        ? Number(item.qty_on_hand).toFixed(2) + ' <span class="qty-unit">box</span>'
        : '<span class="text-muted fst-italic">—</span>';

    var tr = document.createElement('tr');
    tr.innerHTML =
        '<td><input type="text" class="form-control form-control-sm" data-field="size" placeholder="e.g. Large" value="' + escHtml(item.size) + '"></td>' +
        '<td><select class="form-select form-select-sm" data-field="item_type">' + buildItemTypeOptions(item.item_type) + '</select></td>' +
        '<td><select class="form-select form-select-sm" data-field="dimensions"' + (hasType ? '' : ' disabled') + '>' + dimHtml + '</select></td>' +
        '<td class="text-center qty-on-hand">' + qtyDisplay + '</td>' +
        '<td><input type="number" class="form-control form-control-sm" data-field="min_on_hand" min="0" step="0.25" placeholder="0" value="' + escHtml(item.min_on_hand) + '"></td>' +
        '<td><input type="number" class="form-control form-control-sm" data-field="max_on_hand" min="0" step="0.25" placeholder="0" value="' + escHtml(item.max_on_hand) + '"></td>' +
        '<td class="text-center">' +
          '<button class="btn btn-sm btn-outline-danger btn-delete-row" title="Remove row"><i class="fas fa-trash-alt"></i></button>' +
        '</td>';

    var itemTypeSel  = tr.querySelector('select[data-field="item_type"]');
    var dimensionSel = tr.querySelector('select[data-field="dimensions"]');
    itemTypeSel.addEventListener('change', function () {
        var type = itemTypeSel.value;
        dimensionSel.innerHTML = type
            ? buildDimensionOptions(type, '')
            : '<option value="">— select type first —</option>';
        dimensionSel.disabled = !type;
    });

    tr.querySelector('.btn-delete-row').addEventListener('click', function () {
        tr.remove();
        if (document.getElementById('stockBody').children.length === 0) setEmpty();
    });

    tbody.appendChild(tr);
}

function collectRows() {
    var items = [];
    document.querySelectorAll('#stockBody tr').forEach(function (tr) {
        var sizeInput = tr.querySelector('input[data-field="size"]');
        if (!sizeInput) return;
        items.push({
            size:         sizeInput.value.trim(),
            item_type:    tr.querySelector('select[data-field="item_type"]').value,
            dimensions:   tr.querySelector('select[data-field="dimensions"]').value,
            min_on_hand:  tr.querySelector('input[data-field="min_on_hand"]').value.trim(),
            max_on_hand:  tr.querySelector('input[data-field="max_on_hand"]').value.trim(),
        });
    });
    return items;
}

function setEmpty() {
    document.getElementById('stockBody').innerHTML =
        '<tr><td colspan="7" class="text-center py-4 text-muted empty-state">' +
          '<i class="fas fa-boxes me-2 opacity-50"></i>No items yet. Click <strong>Add Item</strong> to get started.' +
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
