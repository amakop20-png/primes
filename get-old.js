const fs = require('fs');
const execSync = require('child_process').execSync;
execSync('git show 4f1fe20:dashboard.html > old_dash.html');
const oldDash = fs.readFileSync('old_dash.html', 'utf8');

const getProfileDropdown = (html) => {
    const startStr = '<div class="profile-dropdown">';
    const start = html.indexOf(startStr);
    const end = html.indexOf('</header>', start);
    return html.substring(start, end).trim();
};

const getStabProfile = (html) => {
    const startStr = '<div class="stab-content active" id="stab-profile">';
    const start = html.indexOf(startStr);
    const endStr = '<div class="stab-content" id="stab-security">';
    const end = html.indexOf(endStr, start);
    return html.substring(start, end).trim();
};

console.log('--- OLD PROFILE DROPDOWN ---');
console.log(getProfileDropdown(oldDash));
console.log('--- OLD STAB PROFILE ---');
console.log(getStabProfile(oldDash));
