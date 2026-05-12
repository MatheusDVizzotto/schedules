// static/js/app.js

let machines      = [];   // [{row, name}, ...]
let workers       = [];   // [{col, col_letter, name}, ...]
let proficiencies = {};   // {"row": {"col": "value"}}

// Machines selected in Step 1 (their row numbers)
let selectedMachineRows = new Set();

// workerCol → [{machineName, timeStart, timeFinish}, ...]
let workerAssignments = {};

// Persisted assignment data keyed by machine row, survives Step 1 ↔ Step 2 transitions
let savedAssignments = {};

// Extra time blocks per machine row — apply to all assigned workers
// { machineRow: [{timeStart, timeFinish}, ...] }
let machineExtraTimes = {};

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
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('scheduleDate').value = today;

    loadData();

    document.getElementById('loadSchedule').addEventListener('click', loadSchedule);
    document.getElementById('saveSchedule').addEventListener('click', saveSchedule);
    document.getElementById('proceedBtn').addEventListener('click', showStepTwo);
    document.getElementById('backToFilter').addEventListener('click', showStepOne);
    document.getElementById('selectAllMachines').addEventListener('click', selectAllMachines);
    document.getElementById('clearAllMachines').addEventListener('click', clearAllMachines);
});

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadData() {
    try {
        const response = await fetch('/api/workers/all');
        const data = await response.json();
        if (data.success) {
            machines      = data.machines;
            workers       = data.workers;
            proficiencies = data.proficiencies;
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

    var html = '<div class="row g-3">';

    MACHINE_BLOCKS.forEach(function(block, idx) {
        var list = blockMachines[idx];
        // Always show all 6 blocks, even if empty
        html += '<div class="col-md-4 col-sm-6">';
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
        html += '<div class="col-12">';
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
        cb.addEventListener('change', updateProceedButton);
    });
}

function selectBlock(idx) {
    document.querySelectorAll('.machine-filter-cb[data-block-idx="' + idx + '"]').forEach(function(cb) {
        cb.checked = true;
    });
    updateProceedButton();
}

function clearBlock(idx) {
    document.querySelectorAll('.machine-filter-cb[data-block-idx="' + idx + '"]').forEach(function(cb) {
        cb.checked = false;
    });
    updateProceedButton();
}

function updateProceedButton() {
    const checked = document.querySelectorAll('.machine-filter-cb:checked').length;
    const btn = document.getElementById('proceedBtn');
    btn.disabled = checked === 0;
    btn.textContent = checked
        ? 'Assign Workers (' + checked + ') →'
        : 'Assign Workers →';
}

function selectAllMachines() {
    document.querySelectorAll('.machine-filter-cb').forEach(function(cb) { cb.checked = true; });
    updateProceedButton();
}

function clearAllMachines() {
    document.querySelectorAll('.machine-filter-cb').forEach(function(cb) { cb.checked = false; });
    updateProceedButton();
}

// ── Step transitions ──────────────────────────────────────────────────────────

function showStepTwo() {
    // Collect selected machine rows
    const newSelectedRows = new Set();
    document.querySelectorAll('.machine-filter-cb:checked').forEach(function(cb) {
        newSelectedRows.add(parseInt(cb.dataset.machineRow));
    });

    if (!newSelectedRows.size) return;

    // Drop saved state for machines that were deselected
    Object.keys(savedAssignments).forEach(function(row) {
        if (!newSelectedRows.has(parseInt(row))) {
            delete savedAssignments[row];
            delete machineExtraTimes[parseInt(row)];
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

    // Rebuild the cards (restoreAssignments will re-fill saved state)
    renderScheduleInterface();
    restoreAssignments();

    document.getElementById('stepOne').style.display = 'none';
    document.getElementById('stepTwo').style.display = 'block';
    document.getElementById('selectedMachineCount').textContent =
        '(' + selectedMachineRows.size + ' machine' + (selectedMachineRows.size > 1 ? 's' : '') + ')';

    window.scrollTo(0, 0);
}

function showStepOne() {
    // Snapshot current assignment state before going back
    snapshotAssignments();
    document.getElementById('stepTwo').style.display = 'none';
    document.getElementById('stepOne').style.display = 'block';
    window.scrollTo(0, 0);
}

function snapshotAssignments() {
    selectedMachineRows.forEach(function(machineRow) {
        const notesEl = document.querySelector('.machine-notes[data-machine-row="' + machineRow + '"]');
        const checkedWorkers = [];
        document.querySelectorAll('.worker-checkbox[data-machine-row="' + machineRow + '"]:checked').forEach(function(cb) {
            const wc  = parseInt(cb.dataset.workerCol);
            const tsEl = document.querySelector('.time-start-worker[data-machine-row="' + machineRow + '"][data-worker-col="' + wc + '"]');
            const tfEl = document.querySelector('.time-finish-worker[data-machine-row="' + machineRow + '"][data-worker-col="' + wc + '"]');
            checkedWorkers.push({ col: wc, timeStart: tsEl ? tsEl.value : '', timeFinish: tfEl ? tfEl.value : '' });
        });

        savedAssignments[machineRow] = {
            notes:       notesEl ? notesEl.value : '',
            workers:     checkedWorkers,
            extraTimes:  (machineExtraTimes[machineRow] || []).map(function(t) { return Object.assign({}, t); })
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
            if (tsEl) tsEl.value = w.timeStart  || defaultStart(mach.name);
            if (tfEl) tfEl.value = w.timeFinish || defaultFinish(mach.name);
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

        // Restore extra time blocks
        if (saved.extraTimes && saved.extraTimes.length) {
            machineExtraTimes[row] = saved.extraTimes.map(function(t) { return Object.assign({}, t); });
            const container = document.getElementById('extra-times-container-' + row);
            if (container) {
                const card = container.closest('.machine-card');
                if (card) renderExtraTimesSection(row, card);
            }
        }
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

// ── Step 2: Schedule assignment cards ────────────────────────────────────────

function renderScheduleInterface() {
    const container = document.getElementById('scheduleContainer');
    container.innerHTML = '';

    const selectedMachines = machines.filter(function(m) {
        return selectedMachineRows.has(m.row);
    });

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
                '<div id="extra-times-container-' + machine.row + '" class="mt-2"></div>' +
                '<button type="button" class="btn btn-sm btn-outline-secondary mt-2 add-time-block"' +
                        ' data-machine-row="' + machine.row + '">' +
                  '<i class="fas fa-plus"></i> Add time block for all workers' +
                '</button>' +
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
                const workerCol = parseInt(this.dataset.workerCol);
                const machRow   = parseInt(this.dataset.machineRow);
                const mach      = machines.find(function(m) { return m.row === machRow; });
                const machName  = mach ? mach.name : '';
                const timesDiv  = document.getElementById('worker-times-' + machRow + '-' + workerCol);

                if (this.checked) {
                    if (timesDiv) timesDiv.style.display = 'flex';
                    const tsEl = document.querySelector('.time-start-worker[data-machine-row="' + machRow + '"][data-worker-col="' + workerCol + '"]');
                    const tfEl = document.querySelector('.time-finish-worker[data-machine-row="' + machRow + '"][data-worker-col="' + workerCol + '"]');
                    const ts = tsEl ? tsEl.value : '--:--';
                    const tf = tfEl ? tfEl.value : '--:--';
                    if (!workerAssignments[workerCol]) workerAssignments[workerCol] = [];
                    const exists = workerAssignments[workerCol].find(function(a) { return a.machineName === machName; });
                    if (!exists) {
                        workerAssignments[workerCol].push({ machineName: machName, timeStart: ts, timeFinish: tf });
                    }
                } else {
                    if (timesDiv) timesDiv.style.display = 'none';
                    if (workerAssignments[workerCol]) {
                        workerAssignments[workerCol] = workerAssignments[workerCol].filter(function(a) { return a.machineName !== machName; });
                        if (!workerAssignments[workerCol].length) delete workerAssignments[workerCol];
                    }
                }
                updateAssignmentBadges();
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
                const ts = tsEl ? tsEl.value : '--:--';
                const tf = tfEl ? tfEl.value : '--:--';
                if (workerAssignments[workerCol]) {
                    const a = workerAssignments[workerCol].find(function(x) { return x.machineName === machName; });
                    if (a) { a.timeStart = ts || '--:--'; a.timeFinish = tf || '--:--'; }
                }
                updateAssignmentBadges();
            });
        });

        // Add time block button
        card.querySelector('.add-time-block').addEventListener('click', function() {
            const machRow = parseInt(this.dataset.machineRow);
            const mach    = machines.find(function(m) { return m.row === machRow; });
            if (!machineExtraTimes[machRow]) machineExtraTimes[machRow] = [];
            machineExtraTimes[machRow].push({
                timeStart:  defaultStart(mach ? mach.name : ''),
                timeFinish: defaultFinish(mach ? mach.name : '')
            });
            renderExtraTimesSection(machRow, card);
        });
    });
}

function renderExtraTimesSection(machineRow, card) {
    const container = card.querySelector('#extra-times-container-' + machineRow);
    if (!container) return;
    container.innerHTML = '';

    const blocks = machineExtraTimes[machineRow] || [];
    blocks.forEach(function(block, idx) {
        const row = document.createElement('div');
        row.className = 'd-flex align-items-center flex-wrap gap-2 mt-2 extra-time-block';
        row.innerHTML =
            '<span class="badge bg-secondary">Block ' + (idx + 2) + '</span>' +
            '<div class="d-flex align-items-center gap-1">' +
              '<label class="form-label small mb-0 text-muted">Start</label>' +
              '<input type="time" class="form-control form-control-sm extra-time-start"' +
                     ' data-machine-row="' + machineRow + '" data-idx="' + idx + '"' +
                     ' value="' + block.timeStart + '">' +
            '</div>' +
            '<div class="d-flex align-items-center gap-1">' +
              '<label class="form-label small mb-0 text-muted">Finish</label>' +
              '<input type="time" class="form-control form-control-sm extra-time-finish"' +
                     ' data-machine-row="' + machineRow + '" data-idx="' + idx + '"' +
                     ' value="' + block.timeFinish + '">' +
            '</div>' +
            '<button type="button" class="btn btn-sm btn-outline-danger remove-time-block">' +
              '<i class="fas fa-times"></i>' +
            '</button>';

        row.querySelector('.extra-time-start').addEventListener('change', function() {
            machineExtraTimes[machineRow][idx].timeStart = this.value;
        });
        row.querySelector('.extra-time-finish').addEventListener('change', function() {
            machineExtraTimes[machineRow][idx].timeFinish = this.value;
        });
        row.querySelector('.remove-time-block').addEventListener('click', function() {
            machineExtraTimes[machineRow].splice(idx, 1);
            if (!machineExtraTimes[machineRow].length) delete machineExtraTimes[machineRow];
            renderExtraTimesSection(machineRow, card);
        });

        container.appendChild(row);
    });
}

function renderWorkersList(machine) {
    let html = '<div class="worker-list">';
    workers.forEach(function(worker) {
        const prof     = getProficiency(machine.row, worker.col);
        const display  = getProficiencyDisplay(prof);
        const badgeCls = getProficiencyBadgeClass(prof);
        const defStart = defaultStart(machine.name);
        const defEnd   = defaultFinish(machine.name);
        html +=
            '<div class="worker-item mb-2">' +
              '<div class="d-flex align-items-center justify-content-between">' +
                '<div class="form-check">' +
                  '<input class="form-check-input worker-checkbox" type="checkbox"' +
                         ' id="worker-' + machine.row + '-' + worker.col + '"' +
                         ' data-machine-row="' + machine.row + '"' +
                         ' data-worker-col="' + worker.col + '">' +
                  '<label class="form-check-label" for="worker-' + machine.row + '-' + worker.col + '">' +
                    '<strong>' + escapeHtml(worker.name) + '</strong>' +
                    '<span id="assignment-badge-' + worker.col + '"></span>' +
                  '</label>' +
                '</div>' +
                '<span class="' + badgeCls + '">' + display + '</span>' +
              '</div>' +
              '<div class="worker-times align-items-center gap-3 mt-1 ms-4" id="worker-times-' + machine.row + '-' + worker.col + '" style="display:none;">' +
                '<div class="d-flex align-items-center gap-1">' +
                  '<label class="form-label small mb-0 text-muted">Start</label>' +
                  '<input type="time" class="form-control form-control-sm time-start-worker"' +
                         ' data-machine-row="' + machine.row + '"' +
                         ' data-worker-col="' + worker.col + '"' +
                         ' value="' + defStart + '">' +
                '</div>' +
                '<div class="d-flex align-items-center gap-1">' +
                  '<label class="form-label small mb-0 text-muted">Finish</label>' +
                  '<input type="time" class="form-control form-control-sm time-finish-worker"' +
                         ' data-machine-row="' + machine.row + '"' +
                         ' data-worker-col="' + worker.col + '"' +
                         ' value="' + defEnd + '">' +
                '</div>' +
              '</div>' +
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
    updateProceedButton();

    // Clear any previous saved state and start fresh from the loaded data
    savedAssignments  = {};
    workerAssignments = {};
    machineExtraTimes = {};

    // Move to Step 2 (renders cards, then we fill them below)
    showStepTwo();

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

        const extraTimesSet = [];

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
            if (tsEl) tsEl.value = first.time_start;
            if (tfEl) tfEl.value = first.time_finish;
            if (!workerAssignments[worker.col]) workerAssignments[worker.col] = [];
            workerAssignments[worker.col].push({ machineName: machineName, timeStart: first.time_start || '--:--', timeFinish: first.time_finish || '--:--' });

            // Additional time entries → machine-level extra blocks
            for (var i = 1; i < times.length; i++) {
                const t = times[i];
                const dup = extraTimesSet.find(function(e) { return e.timeStart === t.time_start && e.timeFinish === t.time_finish; });
                if (!dup) extraTimesSet.push({ timeStart: t.time_start, timeFinish: t.time_finish });
            }
        });

        if (extraTimesSet.length) {
            machineExtraTimes[machine.row] = extraTimesSet;
            const container = document.getElementById('extra-times-container-' + machine.row);
            if (container) {
                const card = container.closest('.machine-card');
                if (card) renderExtraTimesSection(machine.row, card);
            }
        }
    });

    updateAssignmentBadges();
}

// ── Save schedule ─────────────────────────────────────────────────────────────

async function saveSchedule() {
    const dateInput = document.getElementById('scheduleDate').value;
    if (!dateInput) { alert('Please select a date'); return; }

    const scheduleData = [];
    const errors       = [];

    machines.filter(function(m) { return selectedMachineRows.has(m.row); }).forEach(function(machine) {
        const notes   = (document.querySelector('.machine-notes[data-machine-row="' + machine.row + '"]').value || '').trim();
        const checked = document.querySelectorAll('.worker-checkbox[data-machine-row="' + machine.row + '"]:checked');

        if (!checked.length) return;   // no workers — skip silently

        const missingTimes    = [];
        const assignedWorkers = [];
        checked.forEach(function(cb) {
            const wc     = parseInt(cb.dataset.workerCol);
            const worker = workers.find(function(w) { return w.col === wc; });
            if (!worker) return;
            const tsEl = document.querySelector('.time-start-worker[data-machine-row="' + machine.row + '"][data-worker-col="' + wc + '"]');
            const tfEl = document.querySelector('.time-finish-worker[data-machine-row="' + machine.row + '"][data-worker-col="' + wc + '"]');
            const ts = tsEl ? tsEl.value : '';
            const tf = tfEl ? tfEl.value : '';
            if (!ts || !tf) { missingTimes.push(worker.name); return; }
            scheduleData.push({ machine: machine.name, worker: worker.name, role: getProficiency(machine.row, wc), time_start: ts, time_finish: tf, notes: notes });
            assignedWorkers.push({ worker: worker, wc: wc });
        });

        // Extra time blocks — emit one entry per assigned worker per block
        (machineExtraTimes[machine.row] || []).forEach(function(block) {
            if (!block.timeStart || !block.timeFinish) return;
            assignedWorkers.forEach(function(aw) {
                scheduleData.push({ machine: machine.name, worker: aw.worker.name, role: getProficiency(machine.row, aw.wc), time_start: block.timeStart, time_finish: block.timeFinish, notes: notes });
            });
        });

        if (missingTimes.length) errors.push(machine.name + ': set times for ' + missingTimes.join(', '));
    });

    if (errors.length) { alert('Please fix:\n\n' + errors.join('\n')); return; }
    if (!scheduleData.length) { alert('Assign at least one worker before saving.'); return; }

    const machineCount = new Set(scheduleData.map(function(s) { return s.machine; })).size;
    if (!confirm('Save schedule for ' + formatDateDisplay(dateInput) + '?\n\nMachines: ' + machineCount + '\nAssignments: ' + scheduleData.length)) return;

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

function getAssignmentBadge(workerCol) {
    const list = workerAssignments[workerCol];
    if (!list || !list.length) return '';
    return list.map(function(a) {
        return '<span class="badge bg-info text-dark ms-1">' + escapeHtml(a.machineName) + ' ' + escapeHtml(a.timeStart) + '–' + escapeHtml(a.timeFinish) + '</span>';
    }).join('');
}

function updateAssignmentBadges() {
    workers.forEach(function(worker) {
        document.querySelectorAll('#assignment-badge-' + worker.col).forEach(function(el) {
            el.innerHTML = getAssignmentBadge(worker.col);
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