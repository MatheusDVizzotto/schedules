(function () {
    'use strict';

    var CX = 120, CY = 120;
    var R_OUTER = 88, R_INNER = 56, HIT_R = 20;

    var el = {};
    var state = { hour: 7, minute: 0, mode: 'hour', hover: -1, input: null };
    var ready = false;

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    function build() {
        if (ready) return;
        ready = true;

        el.overlay = document.createElement('div');
        el.overlay.id = 'cp-overlay';
        el.overlay.addEventListener('mousedown', function (e) {
            if (e.target === el.overlay) close(false);
        });

        el.popup = document.createElement('div');
        el.popup.id = 'cp-popup';
        el.popup.innerHTML =
            '<div id="cp-header">' +
                '<span id="cp-hh" class="cp-seg active" title="Select hour"></span>' +
                '<span class="cp-colon">:</span>' +
                '<span id="cp-mm" class="cp-seg" title="Select minute"></span>' +
            '</div>' +
            '<div id="cp-clock-wrap"><canvas id="cp-canvas" width="240" height="240"></canvas></div>' +
            '<div id="cp-footer">' +
                '<button id="cp-cancel" type="button">Cancel</button>' +
                '<button id="cp-ok" type="button">OK</button>' +
            '</div>';

        el.overlay.appendChild(el.popup);
        document.body.appendChild(el.overlay);

        el.hh     = document.getElementById('cp-hh');
        el.mm     = document.getElementById('cp-mm');
        el.canvas = document.getElementById('cp-canvas');
        el.ctx    = el.canvas.getContext('2d');

        el.hh.addEventListener('click', function () { switchMode('hour'); });
        el.mm.addEventListener('click', function () { switchMode('minute'); });
        document.getElementById('cp-cancel').addEventListener('click', function () { close(false); });
        document.getElementById('cp-ok').addEventListener('click', function () { close(true); });

        el.canvas.addEventListener('click', onCanvasClick);
        el.canvas.addEventListener('mousemove', onCanvasMove);
        el.canvas.addEventListener('mouseleave', function () { state.hover = -1; draw(); });

        el.canvas.addEventListener('touchend', function (e) {
            e.preventDefault();
            var t = e.changedTouches[0];
            onCanvasClick({ clientX: t.clientX, clientY: t.clientY });
        });
    }

    function open(input) {
        build();
        state.input = input;
        var parts = (input.value || '07:00').split(':');
        state.hour   = parseInt(parts[0], 10);
        state.minute = parseInt(parts[1], 10);
        if (isNaN(state.hour))   state.hour = 7;
        if (isNaN(state.minute)) state.minute = 0;
        state.mode  = 'hour';
        state.hover = -1;
        el.hh.classList.add('active');
        el.mm.classList.remove('active');
        draw();
        el.overlay.style.display = 'flex';
    }

    function close(confirm) {
        el.overlay.style.display = 'none';
        if (confirm && state.input) {
            state.input.value = pad(state.hour) + ':' + pad(state.minute);
            state.input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        state.input = null;
    }

    function switchMode(mode) {
        state.mode  = mode;
        state.hover = -1;
        el.hh.classList.toggle('active', mode === 'hour');
        el.mm.classList.toggle('active', mode === 'minute');
        draw();
    }

    function getItems() {
        var items = [];
        if (state.mode === 'hour') {
            for (var i = 0; i < 12; i++) {
                var rad = (i * 30 - 90) * Math.PI / 180;
                items.push({ val: i === 0 ? 12 : i,
                             x: CX + R_OUTER * Math.cos(rad),
                             y: CY + R_OUTER * Math.sin(rad) });
            }
            for (var i = 0; i < 12; i++) {
                var rad = (i * 30 - 90) * Math.PI / 180;
                items.push({ val: i === 0 ? 0 : i + 12,
                             x: CX + R_INNER * Math.cos(rad),
                             y: CY + R_INNER * Math.sin(rad) });
            }
        } else {
            for (var i = 0; i < 12; i++) {
                var rad = (i * 30 - 90) * Math.PI / 180;
                items.push({ val: i * 5,
                             x: CX + R_OUTER * Math.cos(rad),
                             y: CY + R_OUTER * Math.sin(rad) });
            }
        }
        return items;
    }

    function draw() {
        var ctx  = el.ctx;
        var dark = document.documentElement.getAttribute('data-theme') === 'dark';

        ctx.clearRect(0, 0, 240, 240);

        // Clock face background
        ctx.fillStyle = dark ? '#2c2c2c' : '#eeeeee';
        ctx.beginPath();
        ctx.arc(CX, CY, 112, 0, 2 * Math.PI);
        ctx.fill();

        var items  = getItems();
        var selVal = state.mode === 'hour' ? state.hour : state.minute;
        var selItem = null;
        items.forEach(function (it) { if (it.val === selVal) selItem = it; });

        // Clock hand
        if (selItem) {
            ctx.strokeStyle = '#2d5a27';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(CX, CY);
            ctx.lineTo(selItem.x, selItem.y);
            ctx.stroke();
            ctx.fillStyle = '#2d5a27';
            ctx.beginPath();
            ctx.arc(CX, CY, 4, 0, 2 * Math.PI);
            ctx.fill();
        }

        // Numbers
        items.forEach(function (item, idx) {
            var isSel   = item.val === selVal;
            var isHover = idx === state.hover && !isSel;

            if (isSel) {
                ctx.fillStyle = '#2d5a27';
                ctx.beginPath();
                ctx.arc(item.x, item.y, 18, 0, 2 * Math.PI);
                ctx.fill();
            } else if (isHover) {
                ctx.fillStyle = dark ? '#3a5a37' : '#c8e6c9';
                ctx.beginPath();
                ctx.arc(item.x, item.y, 18, 0, 2 * Math.PI);
                ctx.fill();
            }

            ctx.fillStyle = isSel ? '#ffffff' : (dark ? '#e0e0e0' : '#333333');
            ctx.font = '13px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(pad(item.val), item.x, item.y);
        });

        // Update header
        el.hh.textContent = pad(state.hour);
        el.mm.textContent = pad(state.minute);
    }

    function hitTest(e) {
        var rect = el.canvas.getBoundingClientRect();
        var sx   = el.canvas.width  / rect.width;
        var sy   = el.canvas.height / rect.height;
        var mx   = (e.clientX - rect.left) * sx;
        var my   = (e.clientY - rect.top)  * sy;
        var items = getItems();
        var best = -1, bestD = HIT_R;
        items.forEach(function (item, idx) {
            var d = Math.sqrt(Math.pow(mx - item.x, 2) + Math.pow(my - item.y, 2));
            if (d < bestD) { best = idx; bestD = d; }
        });
        return { idx: best, items: items };
    }

    function onCanvasClick(e) {
        var res = hitTest(e);
        if (res.idx < 0) return;
        var val = res.items[res.idx].val;
        if (state.mode === 'hour') {
            state.hour = val;
            switchMode('minute');
        } else {
            state.minute = val;
            draw();
        }
    }

    function onCanvasMove(e) {
        var res = hitTest(e);
        if (res.idx !== state.hover) { state.hover = res.idx; draw(); }
    }

    // Open on click for any cp-time input
    document.addEventListener('click', function (e) {
        if (e.target.matches('input.cp-time')) open(e.target);
    });

    document.addEventListener('keydown', function (e) {
        if (!el.overlay || el.overlay.style.display !== 'flex') return;
        if (e.key === 'Escape') close(false);
        if (e.key === 'Enter')  close(true);
    });

    window.ClockPicker = { open: open };
})();