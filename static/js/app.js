// static/js/app.js

let machines      = [];   // [{row, name}, ...]
let workers       = [];   // [{col, col_letter, name}, ...]
let proficiencies = {};   // {"row": {"col": "value"}}

// Machines selected in Step 1 (their row numbers)
let selectedMachineRows = new Set();

// workerCol → [{machineName, timeStart, timeFinish}, ...]
let workerAssignments = {};

// Persisted assignment data keyed by machine row, survives Step 1 ↔ Step 2 transitions
// { machineRow: { timeStart, timeFinish, notes, workers: [workerCol, ...] } }
let savedAssignments = {};

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

function renderMachineFilter() {
    const container = document.getElementById('machineFilterContainer');
    if (!machines.length) {
        container.innerHTML = '<div class="alert alert-warning mb-0">No machines found. Check MACHINE_RANGES in config.py.</div>';
        return;
    }

    // Group machines by block (based on MACHINE_RANGES order)
    // We detect block breaks by gaps in the row numbers
    const blocks = groupMachinesIntoBlocks(machines);

    let html = '<div class="row g-3">';
    blocks.forEach(function(block, blockIdx) {
        html += '<div class="col-md-4">';
        html += '<div class="filter-block">';
        html += '<div class="filter-block-title">Block ' + (blockIdx + 1) + '</div>';
        block.forEach(function(machine) {
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
    });
    html += '</div>';

    container.innerHTML = html;

    // Listen for changes to update the proceed button
    container.querySelectorAll('.machine-filter-cb').forEach(function(cb) {
        cb.addEventListener('change', updateProceedButton);
    });
}

function groupMachinesIntoBlocks(machineList) {
    // Split into blocks wherever there's a gap > 1 between consecutive row numbers
    const blocks = [];
    let current  = [];
    for (let i = 0; i < machineList.length; i++) {
        if (i === 0) {
            current.push(machineList[i]);
        } else {
            const gap = machineList[i].row - machineList[i - 1].row;
            if (gap > 1) {
                blocks.push(current);
                current = [];
            }
            current.push(machineList[i]);
        }
    }
    if (current.length) blocks.push(current);
    return blocks;
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
            // Also remove from workerAssignments any badge entries for this machine
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
    // Save current form state into savedAssignments keyed by machine row
    selectedMachineRows.forEach(function(machineRow) {
        const tsEl    = document.querySelector('.time-start[data-machine-row="'    + machineRow + '"]');
        const tfEl    = document.querySelector('.time-finish[data-machine-row="'   + machineRow + '"]');
        const notesEl = document.querySelector('.machine-notes[data-machine-row="' + machineRow + '"]');
        const checkedWorkers = [];
        document.querySelectorAll('.worker-checkbox[data-machine-row="' + machineRow + '"]:checked').forEach(function(cb) {
            checkedWorkers.push(parseInt(cb.dataset.workerCol));
        });

        savedAssignments[machineRow] = {
            timeStart:  tsEl    ? tsEl.value    : '',
            timeFinish: tfEl    ? tfEl.value    : '',
            notes:      notesEl ? notesEl.value : '',
            workers:    checkedWorkers
        };
    });
}

function restoreAssignments() {
    // Re-apply savedAssignments into the freshly rendered cards
    workerAssignments = {};

    Object.keys(savedAssignments).forEach(function(machineRow) {
        const saved   = savedAssignments[machineRow];
        const row     = parseInt(machineRow);
        const mach    = machines.find(function(m) { return m.row === row; });
        if (!mach) return;

        const tsEl    = document.querySelector('.time-start[data-machine-row="'    + row + '"]');
        const tfEl    = document.querySelector('.time-finish[data-machine-row="'   + row + '"]');
        const notesEl = document.querySelector('.machine-notes[data-machine-row="' + row + '"]');

        if (tsEl)    tsEl.value    = saved.timeStart;
        if (tfEl)    tfEl.value    = saved.timeFinish;
        if (notesEl) notesEl.value = saved.notes;

        saved.workers.forEach(function(workerCol) {
            const cb = document.getElementById('worker-' + row + '-' + workerCol);
            if (cb) {
                cb.checked = true;
                if (!workerAssignments[workerCol]) workerAssignments[workerCol] = [];
                const exists = workerAssignments[workerCol].find(function(a) { return a.machineName === mach.name; });
                if (!exists) {
                    workerAssignments[workerCol].push({
                        machineName: mach.name,
                        timeStart:   saved.timeStart  || '--:--',
                        timeFinish:  saved.timeFinish || '--:--'
                    });
                }
            }
        });
    });

    updateAssignmentBadges();
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
                '<strong>' + escapeHtml(machine.name) + '</strong>' +
              '</div>' +
              '<div class="card-body">' +
                '<div class="row">' +
                  '<div class="col-md-8">' +
                    '<h6 class="text-muted mb-3">Assign Workers</h6>' +
                    renderWorkersList(machine) +
                  '</div>' +
                  '<div class="col-md-4">' +
                    '<h6 class="text-muted mb-3">Time & Notes</h6>' +
                    '<div class="mb-2">' +
                      '<label class="form-label small">Start Time</label>' +
                      '<input type="time" class="form-control time-start" data-machine-row="' + machine.row + '">' +
                    '</div>' +
                    '<div class="mb-2">' +
                      '<label class="form-label small">Finish Time</label>' +
                      '<input type="time" class="form-control time-finish" data-machine-row="' + machine.row + '">' +
                    '</div>' +
                    '<div class="mb-2">' +
                      '<label class="form-label small">Notes</label>' +
                      '<textarea class="form-control machine-notes" data-machine-row="' + machine.row + '"' +
                               ' rows="2" placeholder="Optional notes..."></textarea>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>';

        container.appendChild(card);

        // Worker checkbox listeners
        card.querySelectorAll('.worker-checkbox').forEach(function(cb) {
            cb.addEventListener('change', function() {
                const workerCol = parseInt(this.dataset.workerCol);
                const machRow   = parseInt(this.dataset.machineRow);
                const mach      = machines.find(function(m) { return m.row === machRow; });
                const machName  = mach ? mach.name : '';

                if (this.checked) {
                    const ts = document.querySelector('.time-start[data-machine-row="'  + machRow + '"]').value;
                    const tf = document.querySelector('.time-finish[data-machine-row="' + machRow + '"]').value;
                    if (!workerAssignments[workerCol]) workerAssignments[workerCol] = [];
                    const exists = workerAssignments[workerCol].find(function(a) { return a.machineName === machName; });
                    if (!exists) {
                        workerAssignments[workerCol].push({ machineName: machName, timeStart: ts || '--:--', timeFinish: tf || '--:--' });
                    }
                } else {
                    if (workerAssignments[workerCol]) {
                        workerAssignments[workerCol] = workerAssignments[workerCol].filter(function(a) { return a.machineName !== machName; });
                        if (!workerAssignments[workerCol].length) delete workerAssignments[workerCol];
                    }
                }
                updateAssignmentBadges();
            });
        });

        // Time input listeners — update badge times
        card.querySelectorAll('.time-start, .time-finish').forEach(function(input) {
            input.addEventListener('change', function() {
                const machRow  = parseInt(this.dataset.machineRow);
                const mach     = machines.find(function(m) { return m.row === machRow; });
                const machName = mach ? mach.name : '';
                const ts       = document.querySelector('.time-start[data-machine-row="'  + machRow + '"]').value;
                const tf       = document.querySelector('.time-finish[data-machine-row="' + machRow + '"]').value;
                card.querySelectorAll('.worker-checkbox:checked').forEach(function(cb) {
                    const wc = parseInt(cb.dataset.workerCol);
                    if (!workerAssignments[wc]) workerAssignments[wc] = [];
                    const a = workerAssignments[wc].find(function(x) { return x.machineName === machName; });
                    if (a) { a.timeStart = ts || '--:--'; a.timeFinish = tf || '--:--'; }
                });
                updateAssignmentBadges();
            });
        });
    });
}

function renderWorkersList(machine) {
    let html = '<div class="worker-list">';
    workers.forEach(function(worker) {
        const prof      = getProficiency(machine.row, worker.col);
        const display   = getProficiencyDisplay(prof);
        const badgeCls  = getProficiencyBadgeClass(prof);
        html +=
            '<div class="worker-item mb-2 d-flex align-items-center justify-content-between">' +
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

    // Move to Step 2 (renders cards, then we fill them below)
    showStepTwo();
    const byMachine = {};
    schedule.forEach(function(entry) {
        if (!byMachine[entry.machine]) {
            byMachine[entry.machine] = { workers: [], time_start: entry.time_start || '', time_finish: entry.time_finish || '', notes: entry.notes || '' };
        }
        byMachine[entry.machine].workers.push(entry.worker);
    });

    Object.keys(byMachine).forEach(function(machineName) {
        const machine = machines.find(function(m) { return m.name === machineName; });
        if (!machine) return;

        const entry = byMachine[machineName];
        const startEl  = document.querySelector('.time-start[data-machine-row="'   + machine.row + '"]');
        const finishEl = document.querySelector('.time-finish[data-machine-row="'  + machine.row + '"]');
        const notesEl  = document.querySelector('.machine-notes[data-machine-row="' + machine.row + '"]');

        if (startEl)  startEl.value  = entry.time_start;
        if (finishEl) finishEl.value = entry.time_finish;
        if (notesEl)  notesEl.value  = entry.notes;

        entry.workers.forEach(function(workerName) {
            const worker   = workers.find(function(w) { return w.name === workerName; });
            if (!worker) return;
            const workerCb = document.getElementById('worker-' + machine.row + '-' + worker.col);
            if (workerCb) {
                workerCb.checked = true;
                if (!workerAssignments[worker.col]) workerAssignments[worker.col] = [];
                workerAssignments[worker.col].push({ machineName: machineName, timeStart: entry.time_start || '--:--', timeFinish: entry.time_finish || '--:--' });
            }
        });
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
        const ts    = document.querySelector('.time-start[data-machine-row="'   + machine.row + '"]').value;
        const tf    = document.querySelector('.time-finish[data-machine-row="'  + machine.row + '"]').value;
        const notes = (document.querySelector('.machine-notes[data-machine-row="' + machine.row + '"]').value || '').trim();

        const checked = document.querySelectorAll('.worker-checkbox[data-machine-row="' + machine.row + '"]:checked');

        if (!checked.length) return;   // no workers — skip silently (machine won't appear in sheet)

        if (!ts || !tf) {
            errors.push(machine.name + ': set start and finish times');
            return;
        }

        checked.forEach(function(cb) {
            const wc     = parseInt(cb.dataset.workerCol);
            const worker = workers.find(function(w) { return w.col === wc; });
            if (!worker) return;
            scheduleData.push({ machine: machine.name, worker: worker.name, role: getProficiency(machine.row, wc), time_start: ts, time_finish: tf, notes: notes });
        });
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