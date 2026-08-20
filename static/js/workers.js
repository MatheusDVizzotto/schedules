// static/js/workers.js

let machines      = [];   // [{row, name}]
let workers       = [];   // [{col, col_letter, name}]
let proficiencies = {};   // {row: {col: value}}  — int keys from API
let changes       = {};   // {row: {col: newValue}} — pending edits

const LEVELS = [
    { value: 'E', label: 'Expert'     },
    { value: 'P', label: 'Proficient' },
    { value: 'C', label: 'Competent'  },
    { value: 'T', label: 'Trainee'    },
    { value: '',  label: 'None'       },
];

const PROF_COLORS = {
    'E': '#BDD7EE',  // pastel blue
    'P': '#C6EFCE',  // pastel green  — matches Excel
    'C': '#FFFF00',  // yellow        — matches Excel
    'T': '#FCE4D6',  // pastel orange — matches Excel
    '':  '',         // white / no fill
};

// Map any raw spreadsheet value → our canonical value
// Add entries here if your sheet uses different codes
function normaliseProf(raw) {
    if (!raw) return '';
    const v = String(raw).trim().toLowerCase();
    if (v === 'p' || v === 'proficient' || v === '1')                                                    return 'P';
    if (v === 'c' || v === 'competent' || v === '2')                                                     return 'C';
    if (v === 't' || v === 'trainee'   || v === '3')                                                     return 'T';
    if (v === 'e' || v === 'expert' || v === '4')                                                        return 'E';
    // Unknown value — return as-is so we can see it in the dropdown
    return String(raw).trim();
}

// ── Startup ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    loadMatrix();
    document.getElementById('saveChanges').addEventListener('click', saveChanges);
});

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadMatrix() {
    setStatus('loading');
    try {
        // Use the combined endpoint (same as index.html) for one request
        const res  = await fetch('/api/workers/all');
        const data = await res.json();

        if (!data.success) throw new Error(data.error);

        machines = data.machines;
        workers  = data.workers;

        // proficiencies from /api/workers/all has string keys; convert to int for consistency
        proficiencies = {};
        Object.keys(data.proficiencies).forEach(function(r) {
            proficiencies[parseInt(r)] = {};
            Object.keys(data.proficiencies[r]).forEach(function(c) {
                proficiencies[parseInt(r)][parseInt(c)] = data.proficiencies[r][c];
            });
        });

        changes = {};
        renderMatrix();
        setStatus('idle');
    } catch (err) {
        setStatus('error', 'Failed to load: ' + err.message);
    }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderMatrix() {
    renderHeaders();
    renderBody();
}

function renderHeaders() {
    const headerRow = document.getElementById('workerHeaders');
    headerRow.innerHTML = '<th class="machine-name align-middle">Machine / Worker</th>';

    workers.forEach(function(worker) {
        const th = document.createElement('th');
        th.className = 'worker-header text-center';
        th.innerHTML =
            '<div class="d-flex flex-column align-items-center gap-1 py-2">' +
              '<span class="editable-name" ' +
                    'data-worker-col="' + worker.col + '" ' +
                    'title="Click to rename">' +
                escapeHtml(worker.name) +
              '</span>' +
            '</div>';
        headerRow.appendChild(th);

        th.querySelector('.editable-name').addEventListener('click', function() {
            startRenameWorker(worker);
        });
    });
}

function renderBody() {
    const tbody = document.getElementById('proficiencyBody');
    tbody.innerHTML = '';

    machines.forEach(function(machine) {
        const tr = document.createElement('tr');

        // Machine name cell
        const tdName = document.createElement('td');
        tdName.className = 'machine-name align-middle';
        tdName.textContent = machine.name;
        tr.appendChild(tdName);

        // One cell per worker
        workers.forEach(function(worker) {
            const current = getCurrentValue(machine.row, worker.col);
            const td = document.createElement('td');
            td.className = 'proficiency-cell text-center align-middle';
            td.innerHTML = renderProficiencySelect(machine.row, worker.col, current);
            updateCellStyle(td, current);
            tr.appendChild(td);

            // Listen for changes
            td.querySelector('select').addEventListener('change', function() {
                const newVal = this.value;
                if (!changes[machine.row]) changes[machine.row] = {};
                changes[machine.row][worker.col] = newVal;
                updateCellStyle(td, newVal);
                updateSaveButton();
            });
        });

        tbody.appendChild(tr);
    });
}

function renderProficiencySelect(machineRow, workerCol, current) {
    const knownValues = LEVELS.map(function(l) { return l.value; });
    const isKnown     = knownValues.indexOf(current) !== -1;

    let opts = '';

    // If raw value is unrecognised, add it as first option so it's visible
    if (!isKnown && current !== '') {
        opts += '<option value="' + escapeHtml(current) + '" selected>' +
                '⚠ ' + escapeHtml(current) + ' (unknown)</option>';
    }

    LEVELS.forEach(function(level) {
        const selected = (isKnown && current === level.value) ? 'selected' : '';
        opts += '<option value="' + level.value + '" ' + selected + '>' + level.label + '</option>';
    });

    return (
        '<select class="form-select form-select-sm proficiency-select"' +
               ' data-machine-row="' + machineRow + '"' +
               ' data-worker-col="' + workerCol + '">' +
            opts +
        '</select>'
    );
}

function getCurrentValue(machineRow, workerCol) {
    if (changes[machineRow] && changes[machineRow][workerCol] !== undefined) {
        return changes[machineRow][workerCol];
    }
    const raw = (proficiencies[machineRow] && proficiencies[machineRow][workerCol]) ?
        proficiencies[machineRow][workerCol] : '';
    return normaliseProf(raw);
}

function updateCellStyle(td, value) {
    const select = td.querySelector('select');
    if (!select) return;
    select.classList.remove('prof-bg-MR', 'prof-bg-C', 'prof-bg-T');
    if (value) select.classList.add('prof-bg-' + value);
}

function updateSaveButton() {
    const btn   = document.getElementById('saveChanges');
    const count = Object.values(changes).reduce(function(sum, cols) {
        return sum + Object.keys(cols).length;
    }, 0);
    if (count > 0) {
        btn.classList.replace('btn-success', 'btn-warning');
        btn.innerHTML = '<i class="fas fa-save"></i> Save Changes (' + count + ' pending)';
    } else {
        btn.classList.replace('btn-warning', 'btn-success');
        btn.innerHTML = '<i class="fas fa-save"></i> Save All Changes';
    }
}

// ── Rename worker ─────────────────────────────────────────────────────────────

function startRenameWorker(worker) {
    const newName = prompt('Rename worker "' + worker.name + '" to:', worker.name);
    if (!newName || newName.trim() === worker.name) return;

    fetch('/api/workers/update', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ worker_col: worker.col, new_name: newName.trim() })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success) {
            worker.name = newName.trim();
            renderHeaders();   // re-render headers with new name
            alert('Worker renamed successfully.');
        } else {
            alert('Error renaming worker: ' + data.error);
        }
    })
    .catch(function(err) {
        alert('Network error: ' + err.message);
    });
}

// ── Save proficiency changes ───────────────────────────────────────────────────

async function saveChanges() {
    const count = Object.values(changes).reduce(function(sum, cols) {
        return sum + Object.keys(cols).length;
    }, 0);

    if (!count) { alert('No changes to save.'); return; }
    if (!confirm('Save ' + count + ' proficiency change' + (count > 1 ? 's' : '') + ' to Google Drive?')) return;

    const btn  = document.getElementById('saveChanges');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    // Convert int keys to string for JSON (backend expects string or int, both work)
    const payload = {};
    Object.keys(changes).forEach(function(r) {
        payload[r] = {};
        Object.keys(changes[r]).forEach(function(c) {
            payload[r][c] = changes[r][c];
        });
    });

    try {
        const res  = await fetch('/api/proficiency/update', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ proficiencies: payload })
        });
        const data = await res.json();

        if (data.success) {
            // Merge changes into proficiencies and clear pending
            Object.keys(changes).forEach(function(r) {
                if (!proficiencies[parseInt(r)]) proficiencies[parseInt(r)] = {};
                Object.keys(changes[r]).forEach(function(c) {
                    proficiencies[parseInt(r)][parseInt(c)] = changes[r][c];
                });
            });
            changes = {};
            updateSaveButton();
            alert('\u2713 Proficiency matrix saved to Google Drive!');
        } else {
            alert('Error saving: ' + data.error);
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    } finally {
        btn.disabled = false;
        if (btn.innerHTML.includes('spinner')) btn.innerHTML = orig;
    }
}

// ── Status helpers ────────────────────────────────────────────────────────────

function setStatus(state, msg) {
    const tbody = document.getElementById('proficiencyBody');
    const hdr   = document.getElementById('workerHeaders');
    if (state === 'loading') {
        hdr.innerHTML = '<th>Machine / Worker</th>';
        tbody.innerHTML =
            '<tr><td class="text-center py-5" colspan="20">' +
              '<div class="spinner-border text-primary" role="status"></div>' +
              '<p class="mt-2 text-muted">Loading proficiency matrix...</p>' +
            '</td></tr>';
    } else if (state === 'error') {
        tbody.innerHTML =
            '<tr><td class="text-center py-4" colspan="20">' +
              '<div class="alert alert-danger mb-0">' + escapeHtml(msg) + '</div>' +
            '</td></tr>';
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
