/* ══════════════════════════════════════════════════════════════════════
   ui-shared.js — Shared UI logic for NuraSMS (Theme, Profile, Settings)
══════════════════════════════════════════════════════════════════════ */

// ── Theme Management ──
function updateThemeUI(isDark) {
    const modeText = document.getElementById('modeText');
    if (modeText) modeText.textContent = isDark ? 'Dark mode' : 'Light mode';
    const modeIcon = document.querySelector('.mode-dot i');
    if (modeIcon) {
        modeIcon.className = isDark ? 'ph ph-sun' : 'ph ph-moon';
    }
}

function restoreTheme() {
    const isDark = localStorage.getItem('dashboardTheme') === 'dark';
    if (isDark) document.body.classList.add('dark-theme');
    else         document.body.classList.remove('dark-theme');
    updateThemeUI(isDark);
    updateSettingsThemeBtns();
}

function setTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        localStorage.setItem('dashboardTheme', 'dark');
    } else {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('dashboardTheme', 'light');
    }
    updateThemeUI(theme === 'dark');
    updateSettingsThemeBtns();
}

function toggleDark() {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    updateThemeUI(isDark);
    localStorage.setItem('dashboardTheme', isDark ? 'dark' : 'light');
    updateSettingsThemeBtns();
}

function updateSettingsThemeBtns() {
    const isDark   = document.body.classList.contains('dark-theme');
    const lightBtn = document.getElementById('themeLight');
    const darkBtn  = document.getElementById('themeDark');
    if (lightBtn) lightBtn.classList.toggle('active', !isDark);
    if (darkBtn)  darkBtn.classList.toggle('active',  isDark);
}

// ── Profile Sync ──
function updateProfileUI() {
    const session = getSession();
    if (!session) return;
    
    // Update text elements
    const nameToDisplay = session.name || session.username || 'User';
    document.querySelectorAll('#dashboardUsername, #Username, #profileName, #displayUsername, .username, #buyUsername').forEach(el => {
        el.textContent = nameToDisplay;
    });

    // Specifically target the profile dropdown name to avoid hitting the notifications dropdown title
    const profileDropdownHeaders = document.querySelectorAll('.profile-dropdown .dropdown-header');
    profileDropdownHeaders.forEach(header => {
        const nameEl = header.querySelector('.dropdown-name');
        if (nameEl && nameEl.textContent !== 'Notifications') {
            nameEl.textContent = nameToDisplay;
        }
    });

    document.querySelectorAll('.dropdown-email, #profileEmail').forEach(el => {
        if (session.email) el.textContent = session.email;
    });

    // Update avatar images - handle profile-toggle button images and dropdown header images
    const savedAvatar = localStorage.getItem('userAvatar');
    if (savedAvatar) {
        document.querySelectorAll('.profile img, .profile-toggle img, #settingsAvatarImg, .dropdown-header img, .avatar-preview img').forEach(img => {
            img.src = savedAvatar;
        });
    }
}

// ── Settings Modal Logic ──
function openSettings() {
    const overlay = document.getElementById('settingsOverlay');
    if (!overlay) return;

    const session = getSession() || {};
    const nameEl  = document.getElementById('settingsDisplayName');
    const emailEl = document.getElementById('settingsEmail');
    const phoneEl = document.getElementById('settingsPhone');
    if (nameEl)  nameEl.value  = session.name || session.username || '';
    if (emailEl) emailEl.value = session.email || '';
    if (phoneEl) phoneEl.value = session.phone || '';

    const currEl = document.getElementById('settingsCurrency');
    if (currEl && typeof getCurrency === 'function') currEl.value = getCurrency();
    
    const langEl = document.getElementById('settingsLanguage');
    if (langEl) langEl.value = localStorage.getItem('preferredLanguage') || 'en';

    updateSettingsThemeBtns();

    const notifSettings = JSON.parse(localStorage.getItem('notifSettings') || '{}');
    const n = (id, def) => { const el = document.getElementById(id); if (el) el.checked = notifSettings[id] !== undefined ? notifSettings[id] : def; };
    n('notifOtp', true); n('notifOrder', true); n('notifBalance', true); n('notifPromo', false);

    const newPwEl = document.getElementById('settingsNewPw');
    if (newPwEl && !newPwEl._strengthWired) {
        newPwEl.addEventListener('input', () => checkPasswordStrength(newPwEl.value));
        newPwEl._strengthWired = true;
    }

    overlay.classList.add('show');
    document.body.style.overflow = 'hidden';

    document.querySelectorAll('.stab').forEach(btn => {
        if (!btn._settingsWired) {
            btn.addEventListener('click', () => switchSettingsTab(btn.dataset.tab));
            btn._settingsWired = true;
        }
    });

    const closeBtn = document.getElementById('settingsCloseBtn');
    if (closeBtn && !closeBtn._wired) {
        closeBtn.addEventListener('click', closeSettings);
        closeBtn._wired = true;
    }

    if (!overlay._wired) {
        overlay.addEventListener('click', e => { if (e.target === overlay) closeSettings(); });
        overlay._wired = true;
    }
}

function closeSettings() {
    const overlay = document.getElementById('settingsOverlay');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
}

function switchSettingsTab(tab) {
    document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.stab-content').forEach(c => c.classList.remove('active'));
    const activeBtn     = document.querySelector(`.stab[data-tab="${tab}"]`);
    const activeContent = document.getElementById(`stab-${tab}`);
    if (activeBtn)     activeBtn.classList.add('active');
    if (activeContent) activeContent.classList.add('active');
}

function saveProfileSettings() {
    const name  = document.getElementById('settingsDisplayName')?.value.trim();
    const email = document.getElementById('settingsEmail')?.value.trim();
    const phone = document.getElementById('settingsPhone')?.value.trim();

    if (!name) { 
        if (typeof showToast === 'function') showToast('Please enter your display name.', 'error'); 
        return; 
    }

    const session = getSession() || {};
    session.name  = name;
    if (email) session.email = email;
    if (phone) session.phone = phone;
    localStorage.setItem('primes_session', JSON.stringify(session));

    updateProfileUI();
    if (typeof showToast === 'function') showToast('✅ Profile updated successfully!', 'success');
}

function savePasswordSettings() {
    const oldPw  = document.getElementById('settingsOldPw')?.value;
    const newPw  = document.getElementById('settingsNewPw')?.value;
    const confPw = document.getElementById('settingsConfirmPw')?.value;

    if (!oldPw || !newPw || !confPw) { 
        if (typeof showToast === 'function') showToast('Please fill in all password fields.', 'error'); 
        return; 
    }
    if (newPw.length < 8) { 
        if (typeof showToast === 'function') showToast('New password must be at least 8 characters.', 'error'); 
        return; 
    }
    if (newPw !== confPw) { 
        if (typeof showToast === 'function') showToast('Passwords do not match.', 'error'); 
        return; 
    }

    if (typeof showToast === 'function') showToast('🔒 Password updated successfully!', 'success');
    document.getElementById('settingsOldPw').value  = '';
    document.getElementById('settingsNewPw').value  = '';
    document.getElementById('settingsConfirmPw').value = '';
    const bar = document.getElementById('pwStrengthBar');
    if (bar) bar.style.display = 'none';
    const txt = document.getElementById('pwStrengthText');
    if (txt) txt.textContent = '';
}

function checkPasswordStrength(pw) {
    const bar  = document.getElementById('pwStrengthBar');
    const fill = document.getElementById('pwStrengthFill');
    const text = document.getElementById('pwStrengthText');
    if (!bar || !fill || !text) return;
    bar.style.display = 'block';
    let score = 0;
    if (pw.length >= 8)          score++;
    if (/[A-Z]/.test(pw))        score++;
    if (/[0-9]/.test(pw))        score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const levels = [
        { w: '25%',  bg: '#ef4444', label: 'Weak' },
        { w: '50%',  bg: '#f59e0b', label: 'Fair' },
        { w: '75%',  bg: '#3b82f6', label: 'Good' },
        { w: '100%', bg: '#10b981', label: 'Strong' },
    ];
    const l = levels[Math.max(0, score - 1)] || levels[0];
    fill.style.width      = l.w;
    fill.style.background = l.bg;
    text.textContent      = `Password strength: ${l.label}`;
}

function savePreferences() {
    const currency = document.getElementById('settingsCurrency')?.value;
    const language = document.getElementById('settingsLanguage')?.value;
    if (currency) localStorage.setItem('primes_currency', currency);
    if (language) localStorage.setItem('preferredLanguage', language);

    const sym  = document.getElementById('currencySymbol');
    const name = document.getElementById('currencyName');
    if (sym)  sym.textContent  = currency === 'USD' ? '$' : '₦';
    if (name) name.textContent = currency;

    if (typeof showToast === 'function') showToast('✅ Preferences saved!', 'success');
}

function saveNotifSettings() {
    const settings = {
        notifOtp:     document.getElementById('notifOtp')?.checked,
        notifOrder:   document.getElementById('notifOrder')?.checked,
        notifBalance: document.getElementById('notifBalance')?.checked,
        notifPromo:   document.getElementById('notifPromo')?.checked,
    };
    localStorage.setItem('notifSettings', JSON.stringify(settings));
    if (typeof showToast === 'function') showToast('🔔 Notification settings saved!', 'success');
}

function togglePw(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.querySelector('i').className = isHidden ? 'ph ph-eye-slash' : 'ph ph-eye';
}

function previewAvatar(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = e => {
        localStorage.setItem('userAvatar', e.target.result);
        updateProfileUI(); // Sync immediately everywhere
    };
    reader.readAsDataURL(input.files[0]);
}

function confirmDeleteAccount() {
    if (confirm('⚠️ Are you sure you want to permanently delete your account? This action cannot be undone.')) {
        localStorage.clear();
        window.location.href = 'login.html';
    }
}

// ── Auto-init on load ──
document.addEventListener('DOMContentLoaded', () => {
    restoreTheme();
    updateProfileUI();

    const sidebarSettingsBtn = document.getElementById('sidebarSettingsBtn');
    if (sidebarSettingsBtn && !sidebarSettingsBtn._wired) {
        sidebarSettingsBtn.addEventListener('click', e => { e.preventDefault(); openSettings(); });
        sidebarSettingsBtn._wired = true;
    }
    
    // Check for announcements on load
    setTimeout(checkForAnnouncements, 1000);
});

// Listen for real-time announcements across tabs
window.addEventListener('storage', (e) => {
    if (e.key === 'global_announcement') {
        checkForAnnouncements();
    }
});

// ── Announcements Logic ──
async function checkForAnnouncements() {
    let announcementPayload = null;

    // Check local storage for administrative global announcements
    const raw = localStorage.getItem('global_announcement');
    if (raw) {
        try {
            announcementPayload = JSON.parse(raw);
        } catch (e) {
            announcementPayload = { message: raw, id: raw }; // Fallback for old string format
        }
    }

    // Display the announcement if it hasn't been seen yet
    if (announcementPayload && announcementPayload.message) {
        const lastSeenId = localStorage.getItem('last_seen_announcement_id');
        if (String(announcementPayload.id) !== lastSeenId) {
            showAnnouncementModal(announcementPayload.message, announcementPayload.id);
        }
    }
}

function showAnnouncementModal(message, id) {
    const modal = document.getElementById('announcementModal');
    const content = document.getElementById('announcementModalContent');
    if (modal && content) {
        content.textContent = message;
        modal.style.display = 'flex';
        // Save to last seen so it doesn't pop up again
        localStorage.setItem('last_seen_announcement_id', id);
        localStorage.setItem('last_seen_announcement', message); // For backwards compatibility
    }
}

function closeAnnouncementModal() {
    const modal = document.getElementById('announcementModal');
    if (modal) {
        modal.style.display = 'none';
    }
}
