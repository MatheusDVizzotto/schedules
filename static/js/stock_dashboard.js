// static/js/stock_dashboard.js
// item_options.js loaded before this — provides escHtml()

var allStock = [];
var allBays  = [];

var ITEM_TYPES = ['Boards', 'Bearers', 'Blocks'];

document.addEventListener('DOMContentLoaded', loadDashboard);

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadDashboard() {
    try {
        var res  = await fetch('/api/racks/stock/dashboard');
        var data = await res.json();
        if (!data.success) { showFetchError(data.error); return; }
        allStock = data.stock;
        allBays  = data.bays;
        buildFilters();
        document.getElementById('loadingSpinner').classList.add('d-none');
        document.getElementById('filterPanel').classList.remove('d-none');
        document.getElementById('dashboardArea').classList.remove('d-none');
        renderDashboard();
    } catch (err) {
        showFetchError(err.message);
    }
}

// ── Filters ───────────────────────────────────────────────────────────────────

function buildFilters() {
    ITEM_TYPES.forEach(function (type) {
        var sizes = uniqueSizesForType(type);
        var container = document.getElementById('filter-' + type.toLowerCase());
        if (!container) return;
        if (sizes.length === 0) {
            container.innerHTML = '<span class="text-muted fst-italic small">No sizes in stock.</span>';
            return;
        }
        container.innerHTML = sizes.map(function (size) {
            var id = 'chk-' + type + '-' + size.replace(/[^a-zA-Z0-9]/g, '_');
            return '<div class="form-check">' +
                '<input class="form-check-input filter-check" type="checkbox" ' +
                'id="' + escHtml(id) + '" ' +
                'data-type="' + escHtml(type) + '" data-size="' + escHtml(size) + '">' +
                '<label class="form-check-label" for="' + escHtml(id) + '">' + escHtml(size) + '</label>' +
                '</div>';
        }).join('');

        container.querySelectorAll('.filter-check').forEach(function (chk) {
            chk.addEventListener('change', renderDashboard);
        });
    });
}

function uniqueSizesForType(type) {
    var seen = {};
    allStock.forEach(function (s) {
        if (s.item_type === type && s.size) seen[s.size] = true;
    });
    return Object.keys(seen).sort();
}

function getSelected() {
    var selected = {};
    ITEM_TYPES.forEach(function (t) { selected[t] = []; });
    document.querySelectorAll('.filter-check:checked').forEach(function (chk) {
        selected[chk.dataset.type].push(chk.dataset.size);
    });
    return selected;
}

// ── Dashboard render ──────────────────────────────────────────────────────────

function renderDashboard() {
    var selected = getSelected();
    var area = document.getElementById('dashboardArea');

    var hasAny = ITEM_TYPES.some(function (t) { return selected[t].length > 0; });
    if (!hasAny) {
        area.innerHTML =
            '<p class="text-muted fst-italic text-center py-5">' +
            '<i class="fas fa-hand-pointer me-2 opacity-50"></i>' +
            'Select sizes from the filters above to view the dashboard.' +
            '</p>';
        return;
    }

    var html = '';
    ITEM_TYPES.forEach(function (type) {
        if (selected[type].length === 0) return;

        html += '<h5 class="mt-4 mb-3 fw-semibold section-title">' +
            '<i class="fas fa-cube me-2" style="color:#2d5a27;"></i>' + escHtml(type) + '</h5>';
        html += '<div class="row g-3">';

        selected[type].forEach(function (size) {
            var items = allStock.filter(function (s) {
                return s.item_type === type && s.size === size;
            });
            if (items.length === 0) {
                html += '<div class="col-12"><div class="alert alert-light py-2 small">No stock entries for <strong>' +
                    escHtml(size) + '</strong>.</div></div>';
            } else {
                items.forEach(function (item) { html += buildCard(item); });
            }
        });

        html += '</div>';
    });

    area.innerHTML = html;
}

function buildCard(item) {
    var qty      = parseFloat(item.qty_on_hand) || 0;
    var minQty   = item.min_on_hand !== '' ? parseFloat(item.min_on_hand) : null;
    var maxQty   = item.max_on_hand !== '' ? parseFloat(item.max_on_hand) : null;
    var isAllDim = item.dimensions === 'All Dimensions';

    var qtyClass = 'text-dark';
    var qtyBadge = '';
    if (minQty !== null && qty < minQty) {
        qtyClass = 'text-danger fw-bold';
        qtyBadge = '<span class="badge bg-danger ms-2 small">Below Min</span>';
    } else if (maxQty !== null && qty > maxQty) {
        qtyClass = 'text-warning fw-bold';
        qtyBadge = '<span class="badge bg-warning text-dark ms-2 small">Above Max</span>';
    }

    var html =
        '<div class="col-md-6 col-xl-4">' +
          '<div class="card h-100 shadow-sm">' +
            '<div class="card-header py-2 d-flex justify-content-between align-items-start">' +
              '<div>' +
                '<span class="fw-semibold">' + escHtml(item.size) + '</span>' +
                '<span class="badge ms-2" style="background:#2d5a27;">' + escHtml(item.item_type) + '</span>' +
              '</div>' +
              '<span class="text-muted small ms-2 text-end">' + escHtml(item.dimensions) + '</span>' +
            '</div>' +
            '<div class="card-body py-3">' +
              '<div class="d-flex gap-4 flex-wrap align-items-end mb-2">' +
                '<div>' +
                  '<div class="small text-muted mb-1">Qty On Hand</div>' +
                  '<div class="fs-4 ' + qtyClass + '">' + qty.toFixed(2) +
                    ' <span class="small fw-normal text-muted">box</span>' + qtyBadge + '</div>' +
                '</div>' +
                '<div>' +
                  '<div class="small text-muted mb-1">Min</div>' +
                  '<div>' + (item.min_on_hand !== '' ? escHtml(item.min_on_hand) : '<span class="text-muted">—</span>') + '</div>' +
                '</div>' +
                '<div>' +
                  '<div class="small text-muted mb-1">Max</div>' +
                  '<div>' + (item.max_on_hand !== '' ? escHtml(item.max_on_hand) : '<span class="text-muted">—</span>') + '</div>' +
                '</div>' +
              '</div>';

    if (isAllDim) {
        html += buildDimensionBreakdown(item.size, item.item_type);
    }

    html += '</div></div></div>';
    return html;
}

function buildDimensionBreakdown(size, itemType) {
    var byDim = {};
    allBays.forEach(function (bay) {
        if (bay.actual_size !== size || bay.item_type !== itemType) return;
        var dim = bay.item_subtype || '';
        if (!dim) return;
        if (!byDim[dim]) byDim[dim] = [];
        byDim[dim].push(bay);
    });

    var dims = Object.keys(byDim).sort();
    if (dims.length === 0) {
        return '<hr class="my-2"><div class="small text-muted fst-italic">No bays found for this size and type.</div>';
    }

    var html = '<hr class="my-2"><div class="small fw-semibold text-muted mb-2">Breakdown by Dimension</div>';
    dims.forEach(function (dim) {
        var bays  = byDim[dim];
        var total = bays.reduce(function (sum, b) { return sum + (parseFloat(b.quantity) || 0); }, 0);
        html += '<div class="mb-2">' +
            '<div class="small fw-semibold mb-1">' + escHtml(dim) +
            ' <span class="text-muted fw-normal">(' + total.toFixed(2) + ' box)</span></div>' +
            '<div class="d-flex flex-wrap gap-1">';
        bays.forEach(function (b) {
            var tip = escHtml((b.location || '') + (b.bay_code ? ' · ' + b.bay_code : '') + ' — ' + (b.quantity || '0') + ' box');
            html += '<span class="badge text-bg-secondary" title="' + tip + '">' +
                escHtml(b.bay_code || '—') + '</span>';
        });
        html += '</div></div>';
    });
    return html;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function showFetchError(msg) {
    document.getElementById('loadingSpinner').classList.add('d-none');
    document.getElementById('dashboardArea').classList.remove('d-none');
    document.getElementById('dashboardArea').innerHTML =
        '<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>' + escHtml(msg) + '</div>';
}
