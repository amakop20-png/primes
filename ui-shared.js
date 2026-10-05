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

// ── Profile Sync & Avatar State ──
let pendingAvatarData = null;
try {
    Object.defineProperty(window, 'pendingAvatarData', {
        get: () => pendingAvatarData,
        set: (v) => { pendingAvatarData = v; },
        configurable: true
    });
} catch (_) {}

function renderAvatarPreview(dataUrl) {
    const previewImgs = document.querySelectorAll('#profileAvatar, #settingsAvatarImg, .profile-avatar-img, .avatar-preview img');
    previewImgs.forEach(img => {
        if (img.tagName === 'IMG') {
            img.src = dataUrl;
            img.style.display = 'block';
        }
    });

    const previewIcons = document.querySelectorAll('#settingsAvatarIcon, .avatar-preview i.ph-user-circle');
    previewIcons.forEach(icon => {
        icon.style.display = 'none';
    });
}

function updateProfileUI() {
    const session = getSession() || {};
    
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

    // Current effective avatar (pending preview takes precedence while modal is open, then saved avatar)
    const savedAvatar = pendingAvatarData || localStorage.getItem('userAvatar') || session.avatar;

    // 1. Settings avatar preview in modal
    const previewImgs = document.querySelectorAll('#profileAvatar, #settingsAvatarImg, .profile-avatar-img, .avatar-preview img');
    const previewIcons = document.querySelectorAll('#settingsAvatarIcon, .avatar-preview i.ph-user-circle');

    if (savedAvatar) {
        previewImgs.forEach(img => {
            if (img.tagName === 'IMG') {
                img.src = savedAvatar;
                img.style.display = 'block';
            }
        });
        previewIcons.forEach(icon => {
            icon.style.display = 'none';
        });
    } else {
        previewImgs.forEach(img => {
            if (img.tagName === 'IMG') {
                img.style.display = 'none';
            }
        });
        previewIcons.forEach(icon => {
            icon.style.display = 'inline-block';
        });
    }

    // 2. Header profile button (profileToggle)
    const profileToggles = document.querySelectorAll('#profileToggle, .profile-toggle');
    profileToggles.forEach(btn => {
        if (btn.id === 'notifToggle' || btn.closest('.notifications')) return;
        let img = btn.querySelector('img.avatar-thumb');
        let icon = btn.querySelector('.ph-user-circle');
        if (savedAvatar) {
            if (!img) {
                img = document.createElement('img');
                img.className = 'avatar-thumb';
                img.alt = 'User Avatar';
                img.style.cssText = 'width:28px;height:28px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:4px;display:inline-block;';
                btn.insertBefore(img, btn.firstChild);
            }
            img.src = savedAvatar;
            img.style.display = 'inline-block';
            if (icon) icon.style.display = 'none';
        } else {
            if (img) img.style.display = 'none';
            if (icon) icon.style.display = 'inline-block';
        }
    });

    // 3. User dropdown menu header
    const dropdownHeaders = document.querySelectorAll('#dropdown .dropdown-header, .profile-dropdown .dropdown-header');
    dropdownHeaders.forEach(header => {
        if (header.closest('#notifDropdown')) return;
        let img = header.querySelector('img.dropdown-avatar');
        let icon = header.querySelector('.ph-user-circle');
        if (savedAvatar) {
            if (!img) {
                img = document.createElement('img');
                img.className = 'dropdown-avatar';
                img.alt = 'User Avatar';
                img.style.cssText = 'width:42px;height:42px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:12px;display:inline-block;';
                header.insertBefore(img, header.firstChild);
            }
            img.src = savedAvatar;
            img.style.display = 'inline-block';
            if (icon) icon.style.display = 'none';
        } else {
            if (img) img.style.display = 'none';
            if (icon) icon.style.display = 'inline-block';
        }
    });

    // 4. Any other avatar images
    if (savedAvatar) {
        document.querySelectorAll('.profile img, .profile-toggle img, .avatar-preview img').forEach(img => {
            if (img.tagName === 'IMG') {
                img.src = savedAvatar;
            }
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
    if (phoneEl) phoneEl.value = session.phone || session.phoneNumber || '';

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

    updateProfileUI();
    attachProfileEventListeners();
}

function closeSettings() {
    pendingAvatarData = null;
    updateProfileUI();
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

async function saveProfileSettings() {
    console.log("[PROFILE] Saving profile...");

    const nameEl  = document.getElementById('settingsDisplayName');
    const emailEl = document.getElementById('settingsEmail');
    const phoneEl = document.getElementById('settingsPhone');

    const name  = nameEl ? nameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim() : '';
    const phone = phoneEl ? phoneEl.value.trim() : '';

    const session = getSession() || {};
    const displayName = name || session.name || session.username;

    if (!displayName) { 
        if (typeof showToast === 'function') showToast('Please enter your display name.', 'error'); 
        return; 
    }

    const saveBtn = document.getElementById('saveProfileBtn') || document.querySelector('#stab-profile .sbtn-primary');
    const origText = saveBtn ? saveBtn.innerHTML : '';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Saving...';
    }

    try {
        // 1. Update session object
        session.name = displayName;
        if (email) session.email = email;
        if (phone) {
            session.phone = phone;
            session.phoneNumber = phone;
        }

        // 2. Persist avatar if pending
        if (pendingAvatarData) {
            localStorage.setItem('userAvatar', pendingAvatarData);
            session.avatar = pendingAvatarData;
            pendingAvatarData = null;
        }

        // 3. Save session to localStorage
        localStorage.setItem('primes_session', JSON.stringify(session));

        // 4. Sync with primes_users (used across admin & records)
        try {
            const users = JSON.parse(localStorage.getItem('primes_users') || '[]');
            const userEmail = (session.email || '').toLowerCase();
            let matched = false;
            for (let u of users) {
                if ((u.email && u.email.toLowerCase() === userEmail) || (u.name && u.name === session.name) || (u.username && u.username === session.username)) {
                    u.name = displayName;
                    if (email) u.email = email;
                    if (phone) u.phone = phone;
                    if (session.avatar) u.avatar = session.avatar;
                    matched = true;
                    break;
                }
            }
            if (!matched && (userEmail || displayName)) {
                users.unshift({
                    name: displayName,
                    email: userEmail || `${session.username || 'user'}@davessocial.com`,
                    phone: phone || '—',
                    balance: String(session.balance || 0),
                    createdAt: new Date().toISOString()
                });
            }
            localStorage.setItem('primes_users', JSON.stringify(users));
        } catch (_) {}

        // 5. Attempt API request to backend (suppress redirect and handle gracefully)
        if (typeof apiRequest === 'function' && typeof getAuthToken === 'function' && getAuthToken()) {
            try {
                await apiRequest('/api/user/profile', {
                    method: 'PUT',
                    body: JSON.stringify({ name: displayName, email, phone }),
                    suppressAuthRedirect: true
                });
            } catch (apiErr) {
                console.warn('[PROFILE] Backend API profile endpoint status:', apiErr.status || apiErr.message);
            }
        }

        // 6. Update all UI elements across headers, dropdowns, and dashboard
        updateProfileUI();
        if (typeof renderUserInfo === 'function') {
            renderUserInfo();
        }

        console.log("[PROFILE] Profile saved successfully");
        if (typeof showToast === 'function') {
            showToast('✅ Profile saved successfully!', 'success');
        }
    } catch (err) {
        console.error("[PROFILE] Error saving profile:", err);
        if (typeof showToast === 'function') {
            showToast('Failed to save profile: ' + (err.message || 'Storage error'), 'error');
        }
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = origText || '<i class="ph ph-floppy-disk"></i> Save Profile';
        }
    }
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

function handleAvatarFileSelect(inputOrFile) {
    let file = null;
    if (typeof File !== 'undefined' && inputOrFile instanceof File) {
        file = inputOrFile;
    } else if (inputOrFile && inputOrFile.files && inputOrFile.files[0]) {
        file = inputOrFile.files[0];
    } else {
        const input = document.getElementById('imageUpload') || document.getElementById('settingsAvatarFile');
        if (input && input.files && input.files[0]) {
            file = input.files[0];
        }
    }

    if (!file) return;

    console.log("[PROFILE] File selected:", file);

    // 1. File format validation: JPG, JPEG, PNG, WEBP
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const allowedExts  = ['.jpg', '.jpeg', '.png', '.webp'];
    const nameLower    = (file.name || '').toLowerCase();
    const hasValidExt  = allowedExts.some(ext => nameLower.endsWith(ext));
    const hasValidMime = allowedMimes.includes((file.type || '').toLowerCase());

    if (!hasValidExt && !hasValidMime) {
        console.error("[PROFILE] Invalid file format:", file.type, file.name);
        if (typeof showToast === 'function') {
            showToast('Invalid file format. Please upload a JPG, JPEG, PNG, or WEBP image.', 'error');
        }
        if (inputOrFile && inputOrFile.value !== undefined) inputOrFile.value = '';
        return;
    }

    // 2. Prevent unnecessarily large files (max 2MB)
    const maxSizeBytes = 2 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
        console.error("[PROFILE] File too large:", file.size);
        if (typeof showToast === 'function') {
            showToast('Image file is too large. Maximum allowed size is 2MB.', 'error');
        }
        if (inputOrFile && inputOrFile.value !== undefined) inputOrFile.value = '';
        return;
    }

    // 3. Read image and create preview
    const reader = new FileReader();
    reader.onload = e => {
        const rawDataUrl = e.target.result;
        compressAvatarImage(rawDataUrl, (optimizedDataUrl) => {
            pendingAvatarData = optimizedDataUrl;
            renderAvatarPreview(optimizedDataUrl);
            console.log("[PROFILE] Image preview created");
        });
    };
    reader.onerror = err => {
        console.error("[PROFILE] FileReader error:", err);
        if (typeof showToast === 'function') {
            showToast('Failed to read image file. Please try another image.', 'error');
        }
    };
    reader.readAsDataURL(file);
}

function compressAvatarImage(dataUrl, callback) {
    const img = new Image();
    img.onload = () => {
        try {
            const maxDim = 320;
            let width = img.width || maxDim;
            let height = img.height || maxDim;
            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const optimized = canvas.toDataURL('image/jpeg', 0.88);
            callback(optimized);
        } catch (_) {
            callback(dataUrl);
        }
    };
    img.onerror = () => callback(dataUrl);
    img.src = dataUrl;
}

function previewAvatar(input) {
    handleAvatarFileSelect(input);
}

function attachProfileEventListeners() {
    // 1. File input listeners (support both #imageUpload and #settingsAvatarFile)
    const fileInputs = document.querySelectorAll('#imageUpload, #settingsAvatarFile');
    fileInputs.forEach(input => {
        if (!input._wired) {
            input.addEventListener('change', () => handleAvatarFileSelect(input));
            input._wired = true;
        }
    });

    // 2. Avatar click to open file picker (requirement 1 & 2)
    const avatarClickTargets = document.querySelectorAll('.avatar-preview, #profileAvatar, #settingsAvatarImg, #settingsAvatarIcon');
    avatarClickTargets.forEach(target => {
        if (!target._avatarClickWired) {
            target.style.cursor = 'pointer';
            target.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT') return;
                const fileInput = document.getElementById('imageUpload') || document.getElementById('settingsAvatarFile');
                if (fileInput) {
                    fileInput.click();
                }
            });
            target._avatarClickWired = true;
        }
    });

    // 3. Save profile button
    const saveBtn = document.getElementById('saveProfileBtn') || document.querySelector('#stab-profile .sbtn-primary');
    if (saveBtn && !saveBtn._saveWired) {
        saveBtn.addEventListener('click', () => {
            if (!saveBtn.getAttribute('onclick')) {
                saveProfileSettings();
            }
        });
        saveBtn._saveWired = true;
    }
}

function confirmDeleteAccount() {
    if (confirm('⚠️ Are you sure you want to permanently delete your account? This action cannot be undone.')) {
        localStorage.clear();
        window.location.href = 'login.html';
    }
}

window.handleAvatarFileSelect = handleAvatarFileSelect;
window.previewAvatar          = previewAvatar;
window.saveProfileSettings    = saveProfileSettings;
window.updateProfileUI        = updateProfileUI;
window.openSettings           = openSettings;
window.closeSettings          = closeSettings;

// ── Auto-init on load ──
document.addEventListener('DOMContentLoaded', () => {
    restoreTheme();
    updateProfileUI();
    attachProfileEventListeners();

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

// ── Production Announcement System ──
let currentActiveAnnouncementId = null;

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getStoredAnnouncements() {
    try {
        const raw = localStorage.getItem('primes_announcements');
        if (raw) {
            const list = JSON.parse(raw);
            if (Array.isArray(list)) return list;
        }
    } catch (_) {}
    return [];
}

function getActiveAnnouncement() {
    try {
        const raw = localStorage.getItem('primes_active_announcement') || localStorage.getItem('global_announcement');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'string') {
                return {
                    id: 'legacy_' + parsed.slice(0, 8),
                    title: 'Important Announcement',
                    subtitle: 'Tips (1)',
                    content: parsed,
                    active: true
                };
            }
            if (parsed && typeof parsed === 'object') {
                if (!parsed.content && parsed.message) {
                    parsed.content = parsed.message;
                }
                if (!parsed.title) {
                    parsed.title = 'Important Announcement';
                }
                return parsed;
            }
        }
    } catch (_) {}

    // Check stored announcements from backend/admin
    const list = getStoredAnnouncements();
    const active = list.find(a => a.active === true);
    if (active) return active;
    return null;
}

function parseAnnouncementItems(content) {
    if (!content) return [];
    if (Array.isArray(content)) {
        return content.map(item => typeof item === 'string' ? parseSingleItem(item) : item);
    }
    const lines = String(content).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return lines.map(line => parseSingleItem(line));
}

function parseSingleItem(line) {
    if (!line) return { icon: '💡', text: '' };
    // Match unicode emoji or known symbols at start
    const emojiMatch = line.match(/^(\p{Extended_Pictographic}|[💡🔒⏰📢⚠️✅📌🚀⭐🔥ℹ️✨])\s*(.*)$/u);
    if (emojiMatch) {
        return {
            icon: emojiMatch[1],
            text: emojiMatch[2]
        };
    }
    // Match bullet or numbered list
    const bulletMatch = line.match(/^([-*•]|\d+\.)\s*(.*)$/);
    if (bulletMatch) {
        return {
            icon: '💡',
            text: bulletMatch[2]
        };
    }
    return {
        icon: '💡',
        text: line
    };
}

async function checkForAnnouncements() {
    // 1. Strict guard: ONLY display after successful user authentication, when entering dashboard
    const token = typeof getAuthToken === 'function' ? getAuthToken() : localStorage.getItem('primes_token');
    if (!token) {
        return; // Do NOT display before login
    }

    // 2. Fetch latest active announcement from backend / API
    let announcement = null;
    if (typeof fetchActiveAnnouncementFromApi === 'function') {
        try {
            announcement = await fetchActiveAnnouncementFromApi();
        } catch (_) {
            announcement = null;
        }
    }

    // Fallback: check synchronized active announcement from backend/admin
    if (!announcement) {
        announcement = getActiveAnnouncement();
    }

    // 3. If there is no active announcement:
    // - Do nothing
    // - Do not show an empty popup
    // - Do not show an error to the user
    if (!announcement || announcement.active === false) {
        return;
    }

    const content = announcement.content || announcement.message;
    if (!content || !String(content).trim()) {
        return;
    }

    // 4. Client-side state: check if already dismissed by this authenticated user
    const annId = announcement.id || announcement._id || ('ann_' + (announcement.title || 'active').replace(/\s+/g, '_'));
    const session = typeof getSession === 'function' ? getSession() : null;
    const userKey = (session?.email || session?.username || session?._id || 'user').toLowerCase().trim();
    const dismissedKey = `primes_ann_dismissed_${userKey}_${annId}`;

    if (localStorage.getItem(dismissedKey) === 'true') {
        return; // Prevent repeated appearances after dismissal
    }

    // 5. Automatically display the announcement popup
    showAnnouncementModal(announcement, false);
}

function showAnnouncementModal(payload, isPreview = false) {
    const modal = document.getElementById('announcementModal');
    if (!modal) return;

    let data = payload;
    if (typeof payload === 'string') {
        data = {
            id: 'raw_' + Date.now(),
            title: 'Important Announcement',
            subtitle: 'Tips (1)',
            content: payload,
            active: true
        };
    }

    const rawTitle = data.title || 'Important Announcement';
    const titleClean = rawTitle.replace(/^📢\s*/, '').trim();
    const titleTextEl = document.getElementById('announcementTitleText');
    if (titleTextEl) {
        titleTextEl.textContent = titleClean || 'Important Announcement';
    }

    const items = parseAnnouncementItems(data.content || data.message || '');
    const subtitleEl = document.getElementById('announcementSubtitle');
    if (subtitleEl) {
        if (data.subtitle && data.subtitle.trim()) {
            subtitleEl.textContent = data.subtitle.trim();
            subtitleEl.style.display = 'block';
        } else if (items.length > 1) {
            subtitleEl.textContent = `Tips (${items.length})`;
            subtitleEl.style.display = 'block';
        } else {
            subtitleEl.textContent = 'Tips (1)';
            subtitleEl.style.display = 'block';
        }
    }

    const contentBox = document.getElementById('announcementModalContent');
    if (contentBox) {
        if (items.length > 0) {
            contentBox.innerHTML = items.map((item, idx) => {
                const colorClass = (idx % 2 === 0) ? 'ann-color-purple' : 'ann-color-amber';
                return `
                <div class="ann-item-row ${colorClass}">
                    <span class="ann-item-emoji">${item.icon || '💡'}</span>
                    <span class="ann-item-text">${escapeHTML(item.text)}</span>
                </div>`;
            }).join('');
        } else {
            contentBox.innerHTML = `
                <div class="ann-item-row ann-color-purple">
                    <span class="ann-item-emoji">📢</span>
                    <span class="ann-item-text">${escapeHTML(data.content || data.message || 'No announcement details.')}</span>
                </div>
            `;
        }
    }

    const waBtn = document.getElementById('announcementWhatsappBtn');
    if (waBtn) {
        const waUrl = data.whatsappUrl || 'https://chat.whatsapp.com/GzB9gM3l82P6kQ11nuraxq';
        waBtn.href = waUrl;
        waBtn.target = '_blank';
        waBtn.rel = 'noopener noreferrer';
    }

    if (!isPreview) {
        currentActiveAnnouncementId = data.id || 'default';
    } else {
        currentActiveAnnouncementId = null;
    }

    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });
}

function closeAnnouncementModal() {
    const modal = document.getElementById('announcementModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 260);
    }

    if (currentActiveAnnouncementId) {
        try {
            const session = typeof getSession === 'function' ? getSession() : null;
            const userKey = session?.email || session?.username || 'user';
            localStorage.setItem(`primes_ann_dismissed_${userKey}_${currentActiveAnnouncementId}`, 'true');
            localStorage.setItem('last_seen_announcement_id', String(currentActiveAnnouncementId));
        } catch (_) {}
        currentActiveAnnouncementId = null;
    }
}

// Global modal backdrop click & Escape key listener
document.addEventListener('click', (e) => {
    const modal = document.getElementById('announcementModal');
    if (modal && e.target === modal) {
        closeAnnouncementModal();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('announcementModal');
        if (modal && modal.classList.contains('show')) {
            closeAnnouncementModal();
        }
    }
});

// Explicit window exports
window.checkForAnnouncements       = checkForAnnouncements;
window.showAnnouncementModal       = showAnnouncementModal;
window.closeAnnouncementModal      = closeAnnouncementModal;
window.parseAnnouncementItems      = parseAnnouncementItems;
window.getActiveAnnouncement       = getActiveAnnouncement;
window.getStoredAnnouncements      = getStoredAnnouncements;

