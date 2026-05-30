// Shared timezone utilities — Australia/Adelaide (UTC+09:30 / UTC+10:30 DST)

function adelaideToday() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Adelaide' });
}

function adelaideTomorrow() {
    var today = adelaideToday();
    var d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
}

function adelaideTimeNow() {
    return new Date().toLocaleTimeString('en-AU', {
        timeZone: 'Australia/Adelaide',
        hour: '2-digit',
        minute: '2-digit'
    });
}
