// static/js/app.js

let machines      = [];   // [{row, name}, ...]
let workers       = [];   // [{col, col_letter, name}, ...]
let proficiencies = {};   // {"row": {"col": "value"}}
let workerAbsences = {}; // {workerName: [{date_from, date_to, reason}, ...]}

// Machines selected in Step 1 (their row numbers)
let selectedMachineRows = new Set();

// workerCol → [{machineName, timeStart, timeFinish}, ...]
let workerAssignments = {};

// Persisted assignment data keyed by machine row, survives Step 1 ↔ Step 2 transitions
let savedAssignments = {};

// Extra time blocks per worker per machine: { 'machineRow-workerCol': [{timeStart, timeFinish}, ...] }
let workerExtraTimes = {};

function shortMachineName(name) {
    var s = name;
    ['Mill Floor - ', 'Mill Floor -', 'Build Floor - ', 'Recycled Floor - ', 'Recycle Floor - '].forEach(function(pre) {
        if (s.startsWith(pre)) s = s.slice(pre.length);
    });
    [' - Day', ' - Arvo'].forEach(function(suf) {
        if (s.endsWith(suf)) s = s.slice(0, s.length - suf.length);
    });
    return s || name;
}

// ── Startup ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('scheduleDate').value = adelaideTomorrow();

    loadData();

    document.getElementById('loadSchedule').addEventListener('click', loadSchedule);
    document.getElementById('saveSchedule').addEventListener('click', saveSchedule);
    document.getElementById('selectAllMachines').addEventListener('click', selectAllMachines);
    document.getElementById('clearAllMachines').addEventListener('click', clearAllMachines);
});

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadData() {
    try {
        const [allRes, absRes] = await Promise.all([
            fetch('/api/workers/all'),
            fetch('/api/workers/absences'),
        ]);
        const data   = await allRes.json();
        const absData = await absRes.json();
        if (data.success) {
            machines       = data.machines;
            workers        = data.workers;
            proficiencies  = data.proficiencies;
            workerAbsences = absData.success ? absData.absences : {};
            renderMachineFilter();
        } else {
            showFilterError('Error loading data: ' + data.error);
        }
    } catch (err) {
        showFilterError('Could not reach the server. Is the Flask app running?');
    }
}

// ── Step 1: Machine filter ────────────────────────────────────────────────────

// Named blocks: each defines a label and a filter function
var MACHINE_BLOCKS = [
    {
        label:  'Mill Floor — Day',
        color:  '#dbeafe',   // light blue
        match:  function(name) {
            if (!name.startsWith('Mill Floor -')) return false;
            if (name.endsWith(' - Day')) return true;
            return !name.endsWith(' - Arvo');
        }
    },
    {
        label:  'Build Floor — Day',
        color:  '#dcfce7',   // light green
        match:  function(name) {
            if (!name.startsWith('Build Floor - ') && !name.startsWith('Build Floor')) return false;
            if (name.endsWith(' - Day')) return true;
            return !name.endsWith(' - Arvo');
        }
    },
    {
        label:  'Recycled Floor — Day',
        color:  '#fef9c3',   // light yellow
        // Also catches "Recycle Floor -" (without the d)
        match:  function(name) {
            var isRecycled = name.startsWith('Recycled Floor - ') || name.startsWith('Recycle Floor -');
            if (!isRecycled) return false;
            if (name.endsWith(' - Day')) return true;
            return !name.endsWith(' - Arvo');
        }
    },
    {
        label:  'Mill Floor — Arvo',
        color:  '#bfdbfe',   // medium blue
        match:  function(name) { return name.startsWith('Mill Floor -') && name.endsWith(' - Arvo'); }
    },
    {
        label:  'Build Floor — Arvo',
        color:  '#bbf7d0',   // medium green
        match:  function(name) {
            return (name.startsWith('Build Floor - ') || name.startsWith('Build Floor')) && name.endsWith(' - Arvo');
        }
    },
    {
        label:  'Recycled Floor — Arvo',
        color:  '#fde68a',   // medium yellow
        match:  function(name) {
            return (name.startsWith('Recycled Floor - ') || name.startsWith('Recycle Floor -')) && name.endsWith(' - Arvo');
        }
    },
];

function renderMachineFilter() {
    const container = document.getElementById('machineFilterContainer');
    if (!machines.length) {
        container.innerHTML = '<div class="alert alert-warning mb-0">No machines found. Check MACHINE_RANGES in config.py.</div>';
        return;
    }

    // Assign each machine to its block
    var blockMachines = MACHINE_BLOCKS.map(function() { return []; });
    var unmatched     = [];

    machines.forEach(function(machine) {
        var placed = false;
        MACHINE_BLOCKS.forEach(function(block, idx) {
            if (!placed && block.match(machine.name)) {
                blockMachines[idx].push(machine);
                placed = true;
            }
        });
        if (!placed) unmatched.push(machine);
    });

    function shortName(name) { return shortMachineName(name); }

    var html = '<div class="machine-filter-row">';

    MACHINE_BLOCKS.forEach(function(block, idx) {
        var list = blockMachines[idx];
        // Always show all 6 blocks, even if empty
        html += '<div class="filter-col">';
        html += '<div class="filter-block" style="border-top: 3px solid ' + block.color.replace(/f/g, "c") + ';">';
        html += '<div class="filter-block-title" style="background:' + block.color + ';margin:-12px -12px 10px;padding:8px 12px;border-radius:6px 6px 0 0;">' + escapeHtml(block.label) + '</div>';

        if (list.length === 0) {
            html += '<div class="text-muted small ps-1">No machines</div>';
        } else {
            // Block-level select all / clear
            html += '<div class="d-flex gap-2 mb-2">' +
                      '<button class="btn btn-xs btn-outline-secondary py-0 px-2" style="font-size:0.72rem;" onclick="selectBlock(' + idx + ')">All</button>' +
                      '<button class="btn btn-xs btn-outline-secondary py-0 px-2" style="font-size:0.72rem;" onclick="clearBlock(' + idx + ')">None</button>' +
                    '</div>';

            list.forEach(function(machine) {
                html +=
                    '<div class="filter-item">' +
                      '<div class="form-check">' +
                        '<input class="form-check-input machine-filter-cb" type="checkbox"' +
                               ' id="filter-' + machine.row + '"' +
                               ' data-machine-row="' + machine.row + '"' +
                               ' data-block-idx="' + idx + '">' +
                        '<label class="form-check-label" for="filter-' + machine.row + '">' +
                          escapeHtml(shortName(machine.name, block)) +
                        '</label>' +
                      '</div>' +
                    '</div>';
            });
        }

        html += '</div></div>';
    });

    // Unmatched machines (don't fit any block) — show in an extra block
    if (unmatched.length) {
        html += '<div class="filter-col">';
        html += '<div class="filter-block">';
        html += '<div class="filter-block-title">Other Machines</div>';
        unmatched.forEach(function(machine) {
            html +=
                '<div class="filter-item">' +
                  '<div class="form-check">' +
                    '<input class="form-check-input machine-filter-cb" type="checkbox"' +
                           ' id="filter-' + machine.row + '"' +
                           ' data-machine-row="' + machine.row + '">' +
                    '<label class="form-check-label" for="filter-' + machine.row + '">' +
                      escapeHtml(machine.name) +
                    '</label>' +
                  '</div>' +
                '</div>';
        });
        html += '</div></div>';
    }

    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.machine-filter-cb').forEach(function(cb) {
        cb.addEventListener('change', onMachineSelectionChange);
    });
}

function selectBlock(idx) {
    document.querySelectorAll('.machine-filter-cb[data-block-idx="' + idx + '"]').forEach(function(cb) {
        cb.checked = true;
    });
    onMachineSelectionChange();
}

function clearBlock(idx) {
    document.querySelectorAll('.machine-filter-cb[data-block-idx="' + idx + '"]').forEach(function(cb) {
        cb.checked = false;
    });
    onMachineSelectionChange();
}

function onMachineSelectionChange() {
    snapshotAssignments();
    const newSelectedRows = new Set();
    document.querySelectorAll('.machine-filter-cb:checked').forEach(function(cb) {
        newSelectedRows.add(parseInt(cb.dataset.machineRow));
    });

    // Drop saved state for machines that were deselected
    Object.keys(savedAssignments).forEach(function(row) {
        if (!newSelectedRows.has(parseInt(row))) {
            delete savedAssignments[row];
            const prefix = parseInt(row) + '-';
            Object.keys(workerExtraTimes).forEach(function(k) { if (k.startsWith(prefix)) delete workerExtraTimes[k]; });
            const mach = machines.find(function(m) { return m.row === parseInt(row); });
            if (mach) {
                Object.keys(workerAssignments).forEach(function(wc) {
                    workerAssignments[wc] = workerAssignments[wc].filter(function(a) {
                        return a.machineName !== mach.name;
                    });
                    if (!workerAssignments[wc].length) delete workerAssignments[wc];
                });
            }
        }
    });

    selectedMachineRows = newSelectedRows;
    renderScheduleInterface();
    restoreAssignments();
    updateAssignmentSummary();
}

function updateAssignmentSummary() {
    const el = document.getElementById('assignmentSummary');
    if (!el) return;

    const selectedRows = new Set();
    document.querySelectorAll('.machine-filter-cb:checked').forEach(function(cb) {
        selectedRows.add(parseInt(cb.dataset.machineRow));
    });

    if (!selectedRows.size) { el.innerHTML = ''; return; }

    const assignedWorkers = new Set();
    let missingCount = 0;

    selectedRows.forEach(function(row) {
        const saved = savedAssignments[row];
        if (!saved || !saved.workers.length) {
            missingCount++;
        } else {
            saved.workers.forEach(function(w) { assignedWorkers.add(w.col); });
        }
    });

    const unassignedCount = workers.length - assignedWorkers.size;

    var parts = [];
    if (assignedWorkers.size > 0) {
        parts.push('<span class="badge bg-success">' + assignedWorkers.size + ' worker' + (assignedWorkers.size !== 1 ? 's' : '') + ' assigned</span>');
    }
    if (unassignedCount > 0) {
        parts.push('<span class="badge bg-secondary">' + unassignedCount + ' worker' + (unassignedCount !== 1 ? 's' : '') + ' not assigned</span>');
    }
    if (missingCount > 0) {
        parts.push('<span class="badge bg-warning text-dark">' + missingCount + ' machine' + (missingCount !== 1 ? 's' : '') + ' missing</span>');
    }
    el.innerHTML = parts.join(' ');
}

function selectAllMachines() {
    document.querySelectorAll('.machine-filter-cb').forEach(function(cb) { cb.checked = true; });
    onMachineSelectionChange();
}

function clearAllMachines() {
    document.querySelectorAll('.machine-filter-cb').forEach(function(cb) { cb.checked = false; });
    onMachineSelectionChange();
}


function snapshotAssignments() {
    selectedMachineRows.forEach(function(machineRow) {
        const notesEl = document.querySelector('.machine-notes[data-machine-row="' + machineRow + '"]');
        const checkedWorkers = [];
        document.querySelectorAll('.worker-checkbox[data-machine-row="' + machineRow + '"]:checked').forEach(function(cb) {
            const wc  = parseInt(cb.dataset.workerCol);
            const tsEl = document.querySelector('.time-start-worker[data-machine-row="' + machineRow + '"][data-worker-col="' + wc + '"]');
            const tfEl = document.querySelector('.time-finish-worker[data-machine-row="' + machineRow + '"][data-worker-col="' + wc + '"]');
            const key = machineRow + '-' + wc;
            checkedWorkers.push({
                col:        wc,
                timeStart:  tsEl ? getTime(tsEl) : '',
                timeFinish: tfEl ? getTime(tfEl) : '',
                extraTimes: (workerExtraTimes[key] || []).map(function(t) { return Object.assign({}, t); })
            });
        });

        savedAssignments[machineRow] = {
            notes:   notesEl ? notesEl.value : '',
            workers: checkedWorkers
        };
    });
}

function restoreAssignments() {
    workerAssignments = {};

    Object.keys(savedAssignments).forEach(function(machineRow) {
        const saved   = savedAssignments[machineRow];
        const row     = parseInt(machineRow);
        const mach    = machines.find(function(m) { return m.row === row; });
        if (!mach) return;

        const notesEl = document.querySelector('.machine-notes[data-machine-row="' + row + '"]');
        if (notesEl) notesEl.value = saved.notes;

        saved.workers.forEach(function(w) {
            const cb = document.getElementById('worker-' + row + '-' + w.col);
            if (!cb) return;
            cb.checked = true;
            const timesDiv = document.getElementById('worker-times-' + row + '-' + w.col);
            if (timesDiv) timesDiv.style.display = 'flex';
            const tsEl = document.querySelector('.time-start-worker[data-machine-row="' + row + '"][data-worker-col="' + w.col + '"]');
            const tfEl = document.querySelector('.time-finish-worker[data-machine-row="' + row + '"][data-worker-col="' + w.col + '"]');
            if (tsEl) setTime(tsEl, w.timeStart  || defaultStart(mach.name));
            if (tfEl) setTime(tfEl, w.timeFinish || defaultFinish(mach.name));
            if (!workerAssignments[w.col]) workerAssignments[w.col] = [];
            const exists = workerAssignments[w.col].find(function(a) { return a.machineName === mach.name; });
            if (!exists) {
                workerAssignments[w.col].push({
                    machineName: mach.name,
                    timeStart:   w.timeStart  || '--:--',
                    timeFinish:  w.timeFinish || '--:--'
                });
            }
        });

        // Restore per-worker extra time blocks
        saved.workers.forEach(function(w) {
            if (w.extraTimes && w.extraTimes.length) {
                const key          = row + '-' + w.col;
                const extraContainer = document.getElementById('worker-extra-times-' + key);
                workerExtraTimes[key] = w.extraTimes.map(function(t) { return Object.assign({}, t); });
                if (extraContainer) extraContainer.style.display = 'block';
                renderWorkerExtraTimes(row, w.col);  // calls syncExtraBlockBadges internally
            }
        });
    });

    updateAssignmentBadges();
}

// ── Default times ────────────────────────────────────────────────────────────

function defaultStart(machineName) {
    return machineName.endsWith(' - Arvo') ? '14:30' : '07:00';
}

function defaultFinish(machineName) {
    return machineName.endsWith(' - Arvo') ? '22:30' : '15:00';
}

function fmt12(hhmm) {
    if (!hhmm || hhmm === '--:--') return hhmm;
    var parts = hhmm.split(':');
    var h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return hhmm;
    return (h % 12 || 12) + ':' + (m < 10 ? '0' + m : m) + ' ' + (h < 12 ? 'AM' : 'PM');
}

function getTime(input) {
    return input ? (input.dataset.time24 || input.value) : '--:--';
}

function setTime(input, hhmm) {
    if (!input) return;
    input.dataset.time24 = hhmm;
    input.value = fmt12(hhmm);
}

// Merge sorted blocks and return the first available slot.
// Checks for a gap before the first assignment first, then gaps after.
// Returns {timeStart, timeFinish} or null when no valid blocks exist.
function firstAvailableSlot(blocks, machName) {
    const valid = blocks.filter(function(b) {
        return b.timeStart && b.timeStart !== '--:--' && b.timeFinish && b.timeFinish !== '--:--';
    });
    if (!valid.length) return null;
    valid.sort(function(a, b) { return a.timeStart.localeCompare(b.timeStart); });
    var shiftStart = defaultStart(machName);
    // If the first assignment doesn't start at the shift start, the gap before it is free.
    if (valid[0].timeStart > shiftStart) {
        return { timeStart: shiftStart, timeFinish: valid[0].timeStart };
    }
    var latestFinish = valid[0].timeFinish;
    var nextStart = null;
    for (var i = 1; i < valid.length; i++) {
        if (valid[i].timeStart <= latestFinish) {
            if (valid[i].timeFinish > latestFinish) latestFinish = valid[i].timeFinish;
        } else {
            nextStart = valid[i].timeStart;
            break;
        }
    }
    return { timeStart: latestFinish, timeFinish: nextStart || defaultFinish(machName) };
}

// Collect all blocks for a worker across every machine.
function smartDefaultTimesAllMachines(workerCol, machName) {
    const blocks = [];
    (workerAssignments[workerCol] || []).forEach(function(a) {
        blocks.push({ timeStart: a.timeStart, timeFinish: a.timeFinish });
    });
    machines.forEach(function(m) {
        (workerExtraTimes[m.row + '-' + workerCol] || []).forEach(function(b) {
            blocks.push({ timeStart: b.timeStart, timeFinish: b.timeFinish });
        });
    });
    return firstAvailableSlot(blocks, machName);
}

// Collect blocks for a worker on a specific machine only.
function smartDefaultTimesSameMachine(workerCol, machName, machRow) {
    const blocks = [];
    const primary = (workerAssignments[workerCol] || []).find(function(a) { return a.machineName === machName; });
    if (primary) blocks.push({ timeStart: primary.timeStart, timeFinish: primary.timeFinish });
    (workerExtraTimes[machRow + '-' + workerCol] || []).forEach(function(b) {
        blocks.push({ timeStart: b.timeStart, timeFinish: b.timeFinish });
    });
    return firstAvailableSlot(blocks, machName);
}

// ── Step 2: Schedule assignment cards ────────────────────────────────────────

function renderScheduleInterface() {
    const container = document.getElementById('scheduleContainer');
    container.innerHTML = '';

    const selectedMachines = machines.filter(function(m) {
        return selectedMachineRows.has(m.row);
    });

    if (!selectedMachines.length) {
        container.innerHTML = '<p class="text-muted small py-2">Select machines above to assign workers.</p>';
        return;
    }

    selectedMachines.forEach(function(machine) {
        const card = document.createElement('div');
        card.className = 'machine-card mb-3';
        card.innerHTML =
            '<div class="card">' +
              '<div class="card-header">' +
                '<strong>' + escapeHtml(shortMachineName(machine.name)) + '</strong>' +
              '</div>' +
              '<div class="card-body">' +
                '<h6 class="text-muted mb-3">Assign Workers</h6>' +
                renderWorkersList(machine) +
                '<div class="mt-3">' +
                  '<label class="form-label small">Notes</label>' +
                  '<textarea class="form-control machine-notes" data-machine-row="' + machine.row + '"' +
                           ' rows="2" placeholder="Optional notes..."></textarea>' +
                '</div>' +
              '</div>' +
            '</div>';

        container.appendChild(card);

        // Worker checkbox listeners — show/hide per-worker time inputs
        card.querySelectorAll('.worker-checkbox').forEach(function(cb) {
            cb.addEventListener('change', function() {
                const workerCol      = parseInt(this.dataset.workerCol);
                const machRow        = parseInt(this.dataset.machineRow);
                const mach           = machines.find(function(m) { return m.row === machRow; });
                const machName       = mach ? mach.name : '';
                const timesDiv       = document.getElementById('worker-times-' + machRow + '-' + workerCol);
                const extraContainer = document.getElementById('worker-extra-times-' + machRow + '-' + workerCol);

                if (this.checked) {
                    if (timesDiv)       timesDiv.style.display       = 'flex';
                    if (extraContainer) extraContainer.style.display = 'block';
                    const tsEl = document.querySelector('.time-start-worker[data-machine-row="' + machRow + '"][data-worker-col="' + workerCol + '"]');
                    const tfEl = document.querySelector('.time-finish-worker[data-machine-row="' + machRow + '"][data-worker-col="' + workerCol + '"]');
                    const smart = smartDefaultTimesAllMachines(workerCol, machName);
                    if (smart) {
                        if (tsEl) setTime(tsEl, smart.timeStart);
                        if (tfEl) setTime(tfEl, smart.timeFinish);
                    }
                    const ts = tsEl ? getTime(tsEl) : '--:--';
                    const tf = tfEl ? getTime(tfEl) : '--:--';
                    if (!workerAssignments[workerCol]) workerAssignments[workerCol] = [];
                    const exists = workerAssignments[workerCol].find(function(a) { return a.machineName === machName; });
                    if (!exists) {
                        workerAssignments[workerCol].push({ machineName: machName, timeStart: ts, timeFinish: tf });
                    }
                    syncExtraBlockBadges(machRow, workerCol);
                } else {
                    if (timesDiv)       timesDiv.style.display       = 'none';
                    if (extraContainer) extraContainer.style.display = 'none';
                    if (workerAssignments[workerCol]) {
                        workerAssignments[workerCol] = workerAssignments[workerCol].filter(function(a) { return a.machineName !== machName; });
                        if (!workerAssignments[workerCol].length) delete workerAssignments[workerCol];
                    }
                    updateAssignmentBadges();
                }
                snapshotAssignments();
            });
        });

        // Per-worker time input listeners — update badge times
        card.querySelectorAll('.time-start-worker, .time-finish-worker').forEach(function(input) {
            input.addEventListener('change', function() {
                const machRow   = parseInt(this.dataset.machineRow);
                const workerCol = parseInt(this.dataset.workerCol);
                const mach      = machines.find(function(m) { return m.row === machRow; });
                const machName  = mach ? mach.name : '';
                const tsEl = document.querySelector('.time-start-worker[data-machine-row="' + machRow + '"][data-worker-col="' + workerCol + '"]');
                const tfEl = document.querySelector('.time-finish-worker[data-machine-row="' + machRow + '"][data-worker-col="' + workerCol + '"]');
                const ts = tsEl ? getTime(tsEl) : '--:--';
                const tf = tfEl ? getTime(tfEl) : '--:--';
                if (workerAssignments[workerCol]) {
                    const a = workerAssignments[workerCol].find(function(x) { return x.machineName === machName; });
                    if (a) { a.timeStart = ts || '--:--'; a.timeFinish = tf || '--:--'; }
                }
                updateAssignmentBadges();
            });
        });

        // Per-worker "add time block" buttons
        card.querySelectorAll('.add-worker-time-block').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const machRow   = parseInt(this.dataset.machineRow);
                const workerCol = parseInt(this.dataset.workerCol);
                const mach      = machines.find(function(m) { return m.row === machRow; });
                const key       = machRow + '-' + workerCol;
                const machName  = mach ? mach.name : '';
                if (!workerExtraTimes[key]) workerExtraTimes[key] = [];
                const smart = smartDefaultTimesSameMachine(workerCol, machName, machRow);
                workerExtraTimes[key].push({
                    timeStart:  smart ? smart.timeStart  : defaultStart(machName),
                    timeFinish: smart ? smart.timeFinish : defaultFinish(machName)
                });
                renderWorkerExtraTimes(machRow, workerCol);  // calls syncExtraBlockBadges internally
            });
        });
    });
    updateWorkerAvailability();
}

function renderWorkerExtraTimes(machineRow, workerCol) {
    const key       = machineRow + '-' + workerCol;
    const container = document.getElementById('worker-extra-times-' + key);
    if (!container) return;
    container.innerHTML = '';

    const blocks = workerExtraTimes[key] || [];
    blocks.forEach(function(block, idx) {
        const row = document.createElement('div');
        row.className = 'worker-times align-items-center gap-2 mt-1 ms-4 d-flex flex-wrap';
        row.innerHTML =
            '<span class="badge bg-secondary">+' + (idx + 1) + '</span>' +
            '<div class="d-flex align-items-center gap-1">' +
              '<label class="form-label small mb-0 text-muted">Start</label>' +
              '<input type="text" readonly class="form-control form-control-sm cp-time"' +
                     ' data-time24="' + block.timeStart + '"' +
                     ' value="' + fmt12(block.timeStart) + '">' +
            '</div>' +
            '<div class="d-flex align-items-center gap-1">' +
              '<label class="form-label small mb-0 text-muted">Finish</label>' +
              '<input type="text" readonly class="form-control form-control-sm cp-time"' +
                     ' data-time24="' + block.timeFinish + '"' +
                     ' value="' + fmt12(block.timeFinish) + '">' +
            '</div>' +
            '<button type="button" class="btn btn-sm btn-outline-danger">' +
              '<i class="fas fa-times"></i>' +
            '</button>';

        const inputs = row.querySelectorAll('input.cp-time');
        inputs[0].addEventListener('change', function() {
            workerExtraTimes[key][idx].timeStart = this.dataset.time24 || this.value;
            syncExtraBlockBadges(machineRow, workerCol);
        });
        inputs[1].addEventListener('change', function() {
            workerExtraTimes[key][idx].timeFinish = this.dataset.time24 || this.value;
            syncExtraBlockBadges(machineRow, workerCol);
        });
        row.querySelector('button').addEventListener('click', function() {
            workerExtraTimes[key].splice(idx, 1);
            if (!workerExtraTimes[key].length) delete workerExtraTimes[key];
            renderWorkerExtraTimes(machineRow, workerCol);
        });

        container.appendChild(row);
    });

    syncExtraBlockBadges(machineRow, workerCol);
}

function syncExtraBlockBadges(machineRow, workerCol) {
    const key      = machineRow + '-' + workerCol;
    const mach     = machines.find(function(m) { return m.row === machineRow; });
    if (!mach || !workerAssignments[workerCol]) return;
    const machName = mach.name;

    // Keep only the first (individual) entry for this machine, drop old extra ones
    let kept = false;
    workerAssignments[workerCol] = workerAssignments[workerCol].filter(function(a) {
        if (a.machineName !== machName) return true;
        if (!kept) { kept = true; return true; }
        return false;
    });

    // Append a badge entry for each extra block
    (workerExtraTimes[key] || []).forEach(function(block) {
        workerAssignments[workerCol].push({
            machineName: machName,
            timeStart:   block.timeStart  || '--:--',
            timeFinish:  block.timeFinish || '--:--'
        });
    });

    updateAssignmentBadges();
}

function getActiveAbsence(workerName) {
    const date     = document.getElementById('scheduleDate').value;
    const absences = workerAbsences[workerName] || [];
    return absences.find(function(a) { return date >= a.date_from && date <= a.date_to; }) || null;
}

function renderWorkersList(machine) {
    let html = '<div class="worker-list">';
    workers.forEach(function(worker) {
        const prof     = getProficiency(machine.row, worker.col);
        const display  = getProficiencyDisplay(prof);
        const badgeCls = getProficiencyBadgeClass(prof);
        const defStart = defaultStart(machine.name);
        const defEnd   = defaultFinish(machine.name);
        const absence  = getActiveAbsence(worker.name);

        const absenceBadge = absence
            ? '<span class="badge ms-1" style="background:#ffc107;color:#000;" title="Absent: ' +
              escapeHtml(absence.date_from) + ' to ' + escapeHtml(absence.date_to) + '">' +
              '<i class="fas fa-calendar-minus me-1"></i>' +
              escapeHtml(absence.reason || 'Absent') + '</span>'
            : '';

        html +=
            '<div class="worker-item mb-2' + (absence ? ' opacity-75' : '') + '">' +
              '<div class="d-flex align-items-center justify-content-between">' +
                '<div class="form-check">' +
                  '<input class="form-check-input worker-checkbox" type="checkbox"' +
                         ' id="worker-' + machine.row + '-' + worker.col + '"' +
                         ' data-machine-row="' + machine.row + '"' +
                         ' data-worker-col="' + worker.col + '"' +
                         (absence ? ' disabled title="Worker is absent"' : '') + '>' +
                  '<label class="form-check-label" for="worker-' + machine.row + '-' + worker.col + '">' +
                    '<strong>' + escapeHtml(worker.name) + '</strong>' +
                    absenceBadge +
                    '<span class="worker-hours-badge badge ms-1" data-worker-col="' + worker.col + '" style="background-color:#e2e3e5;color:#41464b;">8.0h free</span>' +
                    '<span id="assignment-badge-' + worker.col + '"></span>' +
                  '</label>' +
                '</div>' +
                '<span class="' + badgeCls + '">' + display + '</span>' +
              '</div>' +
              '<div class="worker-times align-items-center gap-2 mt-1 ms-4" id="worker-times-' + machine.row + '-' + worker.col + '" style="display:none;">' +
                '<div class="d-flex align-items-center gap-1">' +
                  '<label class="form-label small mb-0 text-muted">Start</label>' +
                  '<input type="text" readonly class="form-control form-control-sm time-start-worker cp-time"' +
                         ' data-machine-row="' + machine.row + '"' +
                         ' data-worker-col="' + worker.col + '"' +
                         ' data-time24="' + defStart + '"' +
                         ' value="' + fmt12(defStart) + '">' +
                '</div>' +
                '<div class="d-flex align-items-center gap-1">' +
                  '<label class="form-label small mb-0 text-muted">Finish</label>' +
                  '<input type="text" readonly class="form-control form-control-sm time-finish-worker cp-time"' +
                         ' data-machine-row="' + machine.row + '"' +
                         ' data-worker-col="' + worker.col + '"' +
                         ' data-time24="' + defEnd + '"' +
                         ' value="' + fmt12(defEnd) + '">' +
                '</div>' +
                '<button type="button" class="btn btn-sm btn-outline-secondary add-worker-time-block"' +
                        ' data-machine-row="' + machine.row + '" data-worker-col="' + worker.col + '"' +
                        ' title="Add another time block for this worker">' +
                  '<i class="fas fa-plus"></i>' +
                '</button>' +
              '</div>' +
              '<div id="worker-extra-times-' + machine.row + '-' + worker.col + '"></div>' +
            '</div>';
    });
    html += '</div>';
    return html;
}

// ── Load saved schedule ───────────────────────────────────────────────────────

async function loadSchedule() {
    const dateInput = document.getElementById('scheduleDate').value;
    if (!dateInput) { alert('Please select a date'); return; }

    try {
        const response = await fetch('/api/schedule/' + dateInput);
        const data     = await response.json();
        if (data.success && data.schedule.length) {
            applyScheduleToInterface(data.schedule);
        } else if (data.success) {
            alert('No saved schedule found for ' + formatDateDisplay(dateInput));
        } else {
            alert('Error loading schedule: ' + data.error);
        }
    } catch (err) {
        alert('Error loading schedule: ' + err.message);
    }
}

function applyScheduleToInterface(schedule) {
    // Pre-select the machines from the saved schedule in Step 1
    const machineNames = new Set(schedule.map(function(e) { return e.machine; }));

    // Tick the right filter checkboxes
    document.querySelectorAll('.machine-filter-cb').forEach(function(cb) {
        const row  = parseInt(cb.dataset.machineRow);
        const mach = machines.find(function(m) { return m.row === row; });
        cb.checked = mach && machineNames.has(mach.name);
    });

    // Clear any previous saved state and start fresh from the loaded data
    savedAssignments = {};
    workerAssignments = {};
    workerExtraTimes  = {};

    // Render cards for selected machines
    onMachineSelectionChange();

    // Group by machine; workers may appear multiple times (extra time blocks)
    const byMachine = {};
    schedule.forEach(function(entry) {
        if (!byMachine[entry.machine]) byMachine[entry.machine] = { workerEntries: {}, notes: entry.notes || '' };
        const me = byMachine[entry.machine];
        if (!me.workerEntries[entry.worker]) me.workerEntries[entry.worker] = [];
        me.workerEntries[entry.worker].push({ time_start: entry.time_start || '', time_finish: entry.time_finish || '' });
    });

    Object.keys(byMachine).forEach(function(machineName) {
        const machine = machines.find(function(m) { return m.name === machineName; });
        if (!machine) return;

        const entry   = byMachine[machineName];
        const notesEl = document.querySelector('.machine-notes[data-machine-row="' + machine.row + '"]');
        if (notesEl) notesEl.value = entry.notes;

        Object.keys(entry.workerEntries).forEach(function(workerName) {
            const times  = entry.workerEntries[workerName];
            const worker = workers.find(function(wk) { return wk.name === workerName; });
            if (!worker) return;
            const workerCb = document.getElementById('worker-' + machine.row + '-' + worker.col);
            if (!workerCb) return;

            // First time entry → individual worker time
            const first = times[0];
            workerCb.checked = true;
            const timesDiv = document.getElementById('worker-times-' + machine.row + '-' + worker.col);
            if (timesDiv) timesDiv.style.display = 'flex';
            const tsEl = document.querySelector('.time-start-worker[data-machine-row="' + machine.row + '"][data-worker-col="' + worker.col + '"]');
            const tfEl = document.querySelector('.time-finish-worker[data-machine-row="' + machine.row + '"][data-worker-col="' + worker.col + '"]');
            if (tsEl) setTime(tsEl, first.time_start);
            if (tfEl) setTime(tfEl, first.time_finish);
            if (!workerAssignments[worker.col]) workerAssignments[worker.col] = [];
            workerAssignments[worker.col].push({ machineName: machineName, timeStart: first.time_start || '--:--', timeFinish: first.time_finish || '--:--' });

            // Additional time entries → per-worker extra blocks
            if (times.length > 1) {
                const key            = machine.row + '-' + worker.col;
                const extraContainer = document.getElementById('worker-extra-times-' + key);
                workerExtraTimes[key] = times.slice(1).map(function(t) {
                    return { timeStart: t.time_start, timeFinish: t.time_finish };
                });
                if (extraContainer) extraContainer.style.display = 'block';
                renderWorkerExtraTimes(machine.row, worker.col);  // calls syncExtraBlockBadges internally
            }
        });
    });

    updateAssignmentBadges();
}

// ── Save schedule ─────────────────────────────────────────────────────────────

function showOverwriteModal(dateDisplay) {
    return new Promise(function(resolve) {
        document.getElementById('overwriteDateDisplay').textContent = dateDisplay;
        const modalEl = document.getElementById('overwriteScheduleModal');
        const modal   = new bootstrap.Modal(modalEl);

        function onConfirm() {
            modal.hide();
            resolve(true);
        }
        function onDismiss() {
            resolve(false);
        }

        document.getElementById('confirmOverwriteBtn').addEventListener('click', onConfirm, { once: true });
        modalEl.addEventListener('hidden.bs.modal', onDismiss, { once: true });

        modal.show();
    });
}

async function saveSchedule() {
    const dateInput = document.getElementById('scheduleDate').value;
    if (!dateInput) { alert('Please select a date'); return; }

    const scheduleData = [];
    const errors       = [];

    machines.filter(function(m) { return selectedMachineRows.has(m.row); }).forEach(function(machine) {
        const notes   = (document.querySelector('.machine-notes[data-machine-row="' + machine.row + '"]').value || '').trim();
        const checked = document.querySelectorAll('.worker-checkbox[data-machine-row="' + machine.row + '"]:checked');

        if (!checked.length) return;   // no workers — skip silently

        const missingTimes = [];
        checked.forEach(function(cb) {
            const wc     = parseInt(cb.dataset.workerCol);
            const worker = workers.find(function(w) { return w.col === wc; });
            if (!worker) return;
            const tsEl = document.querySelector('.time-start-worker[data-machine-row="' + machine.row + '"][data-worker-col="' + wc + '"]');
            const tfEl = document.querySelector('.time-finish-worker[data-machine-row="' + machine.row + '"][data-worker-col="' + wc + '"]');
            const ts = tsEl ? getTime(tsEl) : '';
            const tf = tfEl ? getTime(tfEl) : '';
            if (!ts || !tf) { missingTimes.push(worker.name); return; }
            scheduleData.push({ machine: machine.name, worker: worker.name, role: getProficiency(machine.row, wc), time_start: ts, time_finish: tf, notes: notes });

            // Extra time blocks for this specific worker
            const key = machine.row + '-' + wc;
            (workerExtraTimes[key] || []).forEach(function(block) {
                if (!block.timeStart || !block.timeFinish) return;
                scheduleData.push({ machine: machine.name, worker: worker.name, role: getProficiency(machine.row, wc), time_start: block.timeStart, time_finish: block.timeFinish, notes: notes });
            });
        });

        if (missingTimes.length) errors.push(machine.name + ': set times for ' + missingTimes.join(', '));
    });

    if (errors.length) { alert('Please fix:\n\n' + errors.join('\n')); return; }
    if (!scheduleData.length) { alert('Assign at least one worker before saving.'); return; }

    const machineCount = new Set(scheduleData.map(function(s) { return s.machine; })).size;

    // Check if a schedule already exists for this date
    let alreadyExists = false;
    try {
        const checkRes  = await fetch('/api/schedule/check_date?date=' + dateInput);
        const checkData = await checkRes.json();
        alreadyExists   = checkData.success && checkData.exists;
    } catch (_) { /* network hiccup — fall through to normal save */ }

    if (alreadyExists) {
        const overwrite = await showOverwriteModal(formatDateDisplay(dateInput));
        if (!overwrite) return;
    } else {
        if (!confirm('Save schedule for ' + formatDateDisplay(dateInput) + '?\n\nMachines: ' + machineCount + '\nAssignments: ' + scheduleData.length)) return;
    }

    const btn  = document.getElementById('saveSchedule');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    try {
        const res  = await fetch('/api/schedule/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: dateInput, schedule: scheduleData }) });
        const data = await res.json();
        if (data.success) {
            alert('\u2713 Saved to Google Drive!\n\nDate: ' + formatDateDisplay(dateInput) + '\nAssignments: ' + scheduleData.length);
            if (data.sheets_url) {
                window.open(data.sheets_url, '_blank');
            }
        } else {
            alert('Error: ' + data.error);
        }
    } catch (err) {
        alert('Network error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
    }
}

// ── Assignment badges ─────────────────────────────────────────────────────────

var PASTEL_PALETTE = [
    '#ffd6d6', '#ffd6a5', '#fffacd', '#d6f5d6',
    '#d6eaff', '#e8d6ff', '#ffd6f5', '#d6fff5',
    '#ffe4d6', '#d6f0ff', '#f5d6ff', '#d6ffe4',
];

function getMachineColor(machineName) {
    var hash = 0;
    for (var i = 0; i < machineName.length; i++) {
        hash = (hash * 31 + machineName.charCodeAt(i)) & 0xffffffff;
    }
    return PASTEL_PALETTE[Math.abs(hash) % PASTEL_PALETTE.length];
}

function getAssignmentBadge(workerCol) {
    const list = workerAssignments[workerCol];
    if (!list || !list.length) return '';
    const sorted = list.slice().sort(function(a, b) {
        return a.timeStart.localeCompare(b.timeStart);
    });
    return sorted.map(function(a) {
        var bg = getMachineColor(a.machineName);
        return '<span class="badge ms-1" style="background-color:' + bg + ';color:#333;">' +
               escapeHtml(a.machineName) + ' ' + escapeHtml(a.timeStart) + '–' + escapeHtml(a.timeFinish) +
               '</span>';
    }).join('');
}

function updateAssignmentBadges() {
    workers.forEach(function(worker) {
        document.querySelectorAll('#assignment-badge-' + worker.col).forEach(function(el) {
            el.innerHTML = getAssignmentBadge(worker.col);
        });
    });
    updateWorkerAvailability();
}

function parseTimeToMinutes(t) {
    if (!t || t === '--:--') return 0;
    const parts = t.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function calcWorkerMinutes(workerCol) {
    var total = 0;
    (workerAssignments[workerCol] || []).forEach(function(a) {
        const s = parseTimeToMinutes(a.timeStart);
        const f = parseTimeToMinutes(a.timeFinish);
        if (f > s) total += f - s;
    });
    return total;
}

function updateWorkerAvailability() {
    workers.forEach(function(worker) {
        const absent   = !!getActiveAbsence(worker.name);
        const usedMins = absent ? 480 : calcWorkerMinutes(worker.col);
        const freeMins = Math.max(0, 480 - usedMins);
        const freeHrs  = (freeMins / 60).toFixed(1);
        const blocked  = absent || usedMins >= 450; // absent or 7.5 hrs threshold

        document.querySelectorAll('.worker-hours-badge[data-worker-col="' + worker.col + '"]').forEach(function(el) {
            el.textContent = freeHrs + 'h free';
            el.style.backgroundColor = blocked ? '#f8d7da' : '#e2e3e5';
            el.style.color           = blocked ? '#842029' : '#41464b';
        });

        document.querySelectorAll('.worker-checkbox[data-worker-col="' + worker.col + '"]').forEach(function(cb) {
            if (!cb.checked) {
                cb.disabled = blocked;
                const item = cb.closest('.worker-item');
                if (item) item.style.opacity = blocked ? '0.45' : '';
            } else {
                cb.disabled = false;
                const item = cb.closest('.worker-item');
                if (item) item.style.opacity = '';
            }
        });
    });
}

// ── Proficiency helpers ───────────────────────────────────────────────────────

function getProficiency(machineRow, workerCol) {
    const r = String(machineRow), c = String(workerCol);
    return (proficiencies[r] && proficiencies[r][c]) ? proficiencies[r][c] : '';
}

function getProficiencyBadgeClass(p) {
    const v = String(p).toLowerCase();
    if (v.includes('main') || v === 'main role') return 'badge bg-primary';
    if (v.includes('competent') || v === 'c')    return 'badge bg-success';
    if (v.includes('trainee')   || v === 't')    return 'badge bg-warning text-dark';
    if (p) return 'badge bg-secondary';
    return 'badge bg-light text-dark border';
}

function getProficiencyDisplay(p) {
    if (!p) return 'Not Qualified';
    const v = String(p).toLowerCase();
    if (v.includes('main')      || v === 'main role') return 'Main Role';
    if (v.includes('competent') || v === 'c')         return 'Competent';
    if (v.includes('trainee')   || v === 't')         return 'Trainee';
    return p;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatDateDisplay(iso) {
    const p = iso.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0].slice(2) : iso;
}

function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function showFilterError(msg) {
    document.getElementById('machineFilterContainer').innerHTML =
        '<div class="alert alert-danger mb-0">' + escapeHtml(msg) + '</div>';
}