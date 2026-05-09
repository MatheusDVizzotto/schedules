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
// Each checkbox represents a specific size + dimension combination.
// Groups are: item_type → size → [dimensions...]

function buildFilters() {
    ITEM_TYPES.forEach(function (type) {
        var container = document.getElementById('filter-' + type.toLowerCase());
        if (!container) return;

        // Build size → dimensions map from stock items for this type
        var bySize = {};
        allStock.forEach(function (s) {
            if (s.item_type !== type || !s.size) return;
            if (!bySize[s.size]) bySize[s.size] = [];
            bySize[s.size].push(s.dimensions);
        });

        var sizes = Object.keys(bySize).sort();
        if (sizes.length === 0) {
            container.innerHTML = '<span class="text-muted fst-italic small">No sizes in stock.</span>';
            return;
        }

        container.innerHTML = sizes.map(function (size) {
            var dims = bySize[size];
            var dimsHtml = dims.map(function (dim) {
                var id = 'chk-' + type + '-' + size.replace(/[^a-zA-Z0-9]/g, '_') + '-' + dim.replace(/[^a-zA-Z0-9]/g, '_');
                return '<div class="form-check ms-3">' +
                    '<input class="form-check-input filter-check" type="checkbox" ' +
                    'id="' + escHtml(id) + '" ' +
                    'data-type="' + escHtml(type) + '" ' +
                    'data-size="' + escHtml(size) + '" ' +
                    'data-dim="' + escHtml(dim) + '">' +
                    '<label class="form-check-label small" for="' + escHtml(id) + '">' + escHtml(dim) + '</label>' +
                    '</div>';
            }).join('');

            return '<div class="mb-2">' +
                '<div class="fw-semibold small mb-1" style="color:#2d5a27;">' + escHtml(size) + '</div>' +
                dimsHtml +
                '</div>';
        }).join('');

        container.querySelectorAll('.filter-check').forEach(function (chk) {
            chk.addEventListener('change', renderDashboard);
        });
    });
}

function getSelected() {
    // Returns array of {item_type, size, dimensions}
    var selected = [];
    document.querySelectorAll('.filter-check:checked').forEach(function (chk) {
        selected.push({
            item_type:  chk.dataset.type,
            size:       chk.dataset.size,
            dimensions: chk.dataset.dim,
        });
    });
    return selected;
}

// ── Dashboard render ──────────────────────────────────────────────────────────

function renderDashboard() {
    var selected = getSelected();
    var area = document.getElementById('dashboardArea');

    if (selected.length === 0) {
        area.innerHTML =
            '<p class="text-muted fst-italic text-center py-5">' +
            '<i class="fas fa-hand-pointer me-2 opacity-50"></i>' +
            'Select sizes and dimensions from the filters above to view the dashboard.' +
            '</p>';
        return;
    }

    // Group selected by item_type for section headers
    var byType = {};
    selected.forEach(function (sel) {
        if (!byType[sel.item_type]) byType[sel.item_type] = [];
        byType[sel.item_type].push(sel);
    });

    var html = '';
    ITEM_TYPES.forEach(function (type) {
        if (!byType[type]) return;

        html += '<h5 class="mt-4 mb-3 fw-semibold section-title">' +
            '<i class="fas fa-cube me-2" style="color:#2d5a27;"></i>' + escHtml(type) + '</h5>';
        html += '<div class="row g-3">';

        byType[type].forEach(function (sel) {
            var item = allStock.find(function (s) {
                return s.item_type === sel.item_type && s.size === sel.size && s.dimensions === sel.dimensions;
            });
            if (item) {
                html += buildCard(item);
            }
        });

        html += '</div>';
    });

    area.innerHTML = html;
}

// ── Toggle filters ────────────────────────────────────────────────────────────

function toggleFilters() {
    var body = document.querySelector('#filterPanel .card-body');
    var btn  = document.getElementById('toggleFiltersBtn');
    var hidden = body.classList.toggle('d-none');
    btn.innerHTML = hidden
        ? '<i class="fas fa-chevron-down me-1"></i> Show Filters'
        : '<i class="fas fa-chevron-up me-1"></i> Hide Filters';
}

// ── Card ──────────────────────────────────────────────────────────────────────

function buildCard(item) {
    var qty      = parseFloat(item.qty_on_hand) || 0;
    var minQty   = item.min_on_hand !== '' && item.min_on_hand !== null ? parseFloat(item.min_on_hand) : null;
    var maxQty   = item.max_on_hand !== '' && item.max_on_hand !== null ? parseFloat(item.max_on_hand) : null;
    var isAllDim = item.dimensions === 'All Dimensions';

    var qtyClass = 'text-dark';
    var qtyBadge = '';

    if (maxQty !== null && qty > maxQty) {
        qtyClass = 'text-success fw-bold';
        qtyBadge = '<span class="badge bg-danger ms-2 small">OverFlow</span>';
    } else if (minQty !== null && qty < minQty) {
        qtyClass = 'text-danger fw-bold';
    } else if (minQty !== null && maxQty !== null) {
        var midpoint = (minQty + maxQty) / 2;
        qtyClass = qty >= midpoint ? 'text-success fw-bold' : 'text-warning fw-bold';
    } else if (minQty !== null) {
        qtyClass = 'text-success fw-bold';
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
