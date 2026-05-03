// static/js/darkmode.js — shared across all pages

(function () {
    // Apply saved theme immediately (before paint) to avoid flash
    var saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);

        var btn  = document.getElementById('darkModeToggle');
        if (!btn) return;
        if (theme === 'dark') {
            btn.innerHTML = '<i class="fas fa-sun"></i> <span class="d-none d-sm-inline">Light Mode</span>';
        } else {
            btn.innerHTML = '<i class="fas fa-moon"></i> <span class="d-none d-sm-inline">Dark Mode</span>';
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        var btn = document.getElementById('darkModeToggle');
        if (!btn) return;

        // Set correct icon on load
        applyTheme(localStorage.getItem('theme') || 'light');

        btn.addEventListener('click', function () {
            var current = document.documentElement.getAttribute('data-theme');
            applyTheme(current === 'dark' ? 'light' : 'dark');
        });
    });
})();
