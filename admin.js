const STORAGE_USERS = 'primes_users';
const STORAGE_ACTIVITY = 'primes_activity';

function parseJSON(value) {
    try {
        return JSON.parse(value);
    } catch {
        return [];
    }
}

function getLocalData(key) {
    return parseJSON(localStorage.getItem(key) || '[]');
}

function formatDateTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function countActiveUsers(activity, dateValue) {
    const users = new Set();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    activity.forEach(item => {
        if (item.type !== 'login' || !item.username || !item.timestamp) return;
        const itemDate = new Date(item.timestamp);
        if (dateValue) {
            if (item.timestamp.slice(0, 10) === dateValue) users.add(item.username);
        } else if (itemDate >= sevenDaysAgo) {
            users.add(item.username);
        }
    });

    return users.size;
}

function renderActivity(items) {
    const activityList = document.getElementById('activityList');
    if (!activityList) return;

    activityList.innerHTML = '';
    if (!items.length) {
        activityList.innerHTML = '<li>No activity recorded yet.</li>';
        return;
    }

    items.forEach(item => {
        const entry = document.createElement('li');
        entry.textContent = `${formatDateTime(item.timestamp)} — ${item.message}`;
        activityList.appendChild(entry);
    });
}

function loadDashboard(dateValue = '') {
    const users = getLocalData(STORAGE_USERS);
    const activity = getLocalData(STORAGE_ACTIVITY);
    const filteredActivity = dateValue ? activity.filter(item => item.timestamp.slice(0, 10) === dateValue) : activity;
    const filteredUsers = dateValue ? users.filter(user => user.createdAt.slice(0, 10) === dateValue) : users;

    document.getElementById('totalUsersCount').innerText = users.length;
    document.getElementById('activeUsersCount').innerText = countActiveUsers(activity, dateValue);
    document.getElementById('newSignupsCount').innerText = dateValue ? filteredUsers.length : users.filter(user => {
        const created = new Date(user.createdAt);
        const now = new Date();
        return (now - created) <= 7 * 24 * 60 * 60 * 1000;
    }).length;
    document.getElementById('badge').innerText = filteredActivity.length;
    renderActivity(filteredActivity.slice(0, 15));
}

document.addEventListener('DOMContentLoaded', () => {
    const datePicker = document.getElementById('datePicker');
    loadDashboard(datePicker?.value || '');
    datePicker?.addEventListener('change', () => loadDashboard(datePicker.value));

    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
});
