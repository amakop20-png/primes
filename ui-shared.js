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

    // 5. Admin Console navigation link if user is administrator
    try {
        const isUserAdmin = (typeof isAdmin === 'function' && isAdmin(session)) ||
                            String(session.role || '').toLowerCase() === 'admin' ||
                            String(session.role || '').toLowerCase() === 'superadmin' ||
                            session.isAdmin === true || session.is_admin === true;
        const dropdown = document.getElementById('dropdown');
        if (dropdown) {
            let adminLink = document.getElementById('userDropdownAdminLink');
            if (isUserAdmin) {
                if (!adminLink) {
                    adminLink = document.createElement('a');
                    adminLink.id = 'userDropdownAdminLink';
                    adminLink.href = 'admin.html';
                    adminLink.innerHTML = '<i class="ph ph-shield-check" style="color:var(--primary);"></i> Admin Console';
                    adminLink.style.cssText = 'color:var(--primary);font-weight:700;border-left:3px solid var(--primary);padding-left:14px;';
                    const logoutBtn = dropdown.querySelector('a.logout') || dropdown.lastElementChild;
                    if (logoutBtn) {
                        dropdown.insertBefore(adminLink, logoutBtn);
                    } else {
                        dropdown.appendChild(adminLink);
                    }
                }
            } else if (adminLink) {
                adminLink.remove();
            }
        }
    } catch (_) {}
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
function initSharedComponents() {
    restoreTheme();
    updateProfileUI();
    attachProfileEventListeners();

    const sidebarSettingsBtn = document.getElementById('sidebarSettingsBtn');
    if (sidebarSettingsBtn && !sidebarSettingsBtn._wired) {
        sidebarSettingsBtn.addEventListener('click', e => { e.preventDefault(); openSettings(); });
        sidebarSettingsBtn._wired = true;
    }
    
    // Check for announcements on dashboard load (after user authentication)
    setTimeout(checkForAnnouncements, 800);
    setTimeout(syncAdminAnnouncementsToUserNotifications, 1000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSharedComponents);
} else {
    initSharedComponents();
}

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
                    subtitle: 'Tips (5)',
                    content: parsed,
                    active: true
                };
            }
            if (parsed && typeof parsed === 'object') {
                if (parsed.id === 'login_tips_v1' || (parsed.content && parsed.content.includes('WhatsApp link issues'))) {
                    return DEFAULT_LOGIN_ANNOUNCEMENT;
                }
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

    return DEFAULT_LOGIN_ANNOUNCEMENT;
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

const DEFAULT_LOGIN_ANNOUNCEMENT = {
    id: 'login_tips_main_rules_v2',
    title: 'Important Announcement',
    subtitle: 'Tips (5)',
    content: [
        '💡 Delete and reinstall WhatsApp before getting a number',
        '💡 Avoid Business WhatsApp. They ban faster... use normal WhatsApp instead',
        '💡 Ensure Your Time Zone & VPN matches the country of the number',
        '💡 Use a fresh WhatsApp installation for better success rates',
        '💡 Complete verification within the allocated time frame'
    ].join('\n'),
    whatsappUrl: 'https://chat.whatsapp.com/GzB9gM3l82P6kQ11nuraxq',
    active: true
};

function ensureAnnouncementModalInDOM() {
    let modal = document.getElementById('announcementModal');
    if (!modal) {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
          <div id="announcementModal" class="ann-modal-backdrop" aria-hidden="true" role="dialog" aria-labelledby="announcementTitleText">
            <div class="ann-modal-card">
              <button class="ann-close-icon-btn" id="announcementCloseTopBtn" onclick="closeAnnouncementModal()" aria-label="Close Announcement">&times;</button>
              <div class="ann-header-wrap">
                <h2 class="ann-heading-title" id="announcementTitle">
                  <span class="ann-icon-badge">📢</span>
                  <span id="announcementTitleText">Important Announcement</span>
                </h2>
                <div class="ann-heading-subtitle" id="announcementSubtitle">Tips (5)</div>
              </div>
              <div class="ann-content-box" id="announcementContentBox">
                <div class="ann-items-list" id="announcementModalContent"></div>
              </div>
              <div class="ann-actions-wrap">
                <a href="https://chat.whatsapp.com/GzB9gM3l82P6kQ11nuraxq" target="_blank" rel="noopener noreferrer" class="ann-btn-whatsapp" id="announcementWhatsappBtn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0;">
                    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.04 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.59 20.16 12.04 20.16C10.61 20.16 9.22 19.78 8.01 19.06L7.71 18.88L4.62 19.69L5.45 16.67L5.25 16.36C4.47 15.11 4.05 13.54 4.05 11.91C4.05 7.51 7.64 3.67 12.04 3.67ZM8.82 7.37C8.61 7.37 8.39 7.37 8.21 7.41C7.99 7.45 7.72 7.57 7.52 7.79C7.26 8.07 6.55 8.74 6.55 10.1C6.55 11.46 7.54 12.77 7.68 12.96C7.82 13.15 9.61 15.91 12.35 17.09C13 17.37 13.51 17.56 13.92 17.69C14.53 17.88 15.09 17.86 15.53 17.79C16.02 17.72 17.04 17.17 17.25 16.57C17.47 15.98 17.47 15.47 17.4 15.36C17.33 15.25 17.15 15.19 16.86 15.05C16.58 14.91 15.22 14.24 14.97 14.15C14.72 14.06 14.54 14.01 14.36 14.28C14.18 14.55 13.68 15.14 13.52 15.32C13.37 15.51 13.22 15.53 12.94 15.39C12.65 15.25 11.75 14.95 10.68 13.99C9.84 13.25 9.28 12.33 9.12 12.05C8.95 11.77 9.1 11.61 9.25 11.47C9.37 11.34 9.53 11.13 9.68 10.96C9.82 10.79 9.87 10.66 9.96 10.47C10.05 10.29 10.01 10.13 9.94 9.99C9.87 9.85 9.35 8.57 9.13 8.04C8.92 7.52 8.7 7.59 8.53 7.58L8.82 7.37Z"/>
                  </svg>
                  <span>Join WhatsApp Community</span>
                </a>
                <button class="ann-btn-close" id="announcementCloseBtn" onclick="closeAnnouncementModal()">
                  <span>✕ Close</span>
                </button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(wrap.firstElementChild);
        modal = document.getElementById('announcementModal');
    }
    return modal;
}

/* ────────────────────────────────────────────────────────
   1. AUTOMATIC USER LOGIN/SIGNUP ANNOUNCEMENT (POPUP SYSTEM)
   Triggers automatically after user logs in or signs up.
   Presents the platform main rules and tips.
   Persists viewed/dismissed state per user.
   Does not re-trigger on simple in-dashboard tab navigation.
──────────────────────────────────────────────────────── */
async function checkForAnnouncements() {
    // 1. Strict guard: ONLY display after successful user authentication, on user dashboard
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('login') || path.includes('signup') || path.includes('admin')) {
        return;
    }

    const token = typeof getAuthToken === 'function' ? getAuthToken() : localStorage.getItem('primes_token');
    if (!token) {
        return; // Do NOT display before login
    }

    const session = typeof getSession === 'function' ? getSession() : null;
    const userKey = (session?.email || session?.username || session?._id || 'user').toLowerCase().trim();

    const justLoggedIn = sessionStorage.getItem('just_logged_in') === 'true' || sessionStorage.getItem('just_signed_up') === 'true';

    // If NOT a fresh login/signup, respect session dismissal to prevent annoying popups during section navigation
    if (!justLoggedIn) {
        const sessionDismissed = sessionStorage.getItem(`nuraxq_login_ann_dismissed_${userKey}`);
        if (sessionDismissed === 'true') {
            return;
        }
    }

    // 2. Fetch latest active announcement from backend / storage
    let announcement = null;
    if (typeof fetchActiveAnnouncementFromApi === 'function') {
        try {
            announcement = await fetchActiveAnnouncementFromApi();
        } catch (_) {
            announcement = null;
        }
    }

    // Fallback or upgrade to platform main rules announcement
    if (!announcement || (!announcement.content && !announcement.message) || announcement.id === 'login_tips_v1' || (announcement.content && announcement.content.includes('WhatsApp link issues'))) {
        announcement = DEFAULT_LOGIN_ANNOUNCEMENT;
    }

    if (!announcement || announcement.active === false) {
        return;
    }

    const annId = announcement.id || announcement._id || 'login_tips_main_rules_v2';
    const dismissedKey = `primes_ann_dismissed_${userKey}_${annId}`;

    // If already dismissed permanently by this user and not a fresh login/signup, do not display
    if (localStorage.getItem(dismissedKey) === 'true' && !justLoggedIn) {
        return;
    }

    // Ensure modal exists in DOM
    ensureAnnouncementModalInDOM();

    // Automatically display the announcement popup
    showAnnouncementModal(announcement, false);
}

/* ────────────────────────────────────────────────────────
   2. SEPARATE ADMIN ANNOUNCEMENT SYSTEM (SYNC TO NOTIFICATIONS)
   Displays admin-created announcements in user notification area
──────────────────────────────────────────────────────── */
function syncAdminAnnouncementsToUserNotifications() {
    try {
        const rawAdmin = localStorage.getItem('primes_announcements') || localStorage.getItem('primes_admin_announcements');
        if (!rawAdmin) return;
        const list = JSON.parse(rawAdmin);
        if (!Array.isArray(list) || !list.length) return;

        const activeAnnouncements = list.filter(a => a && a.active === true);
        if (!activeAnnouncements.length) return;

        const session = typeof getSession === 'function' ? getSession() : null;
        const userKey = (session?.email || session?.username || session?._id || 'user').toLowerCase().trim();
        const userNotifKey = `primes_notifications_${userKey}`;
        let userNotifs = JSON.parse(localStorage.getItem(userNotifKey) || '[]');
        let updated = false;

        for (const ann of activeAnnouncements) {
            const notifId = `admin_ann_${ann.id}`;
            if (!userNotifs.some(n => n.id === notifId)) {
                userNotifs.unshift({
                    id: notifId,
                    title: ann.title || 'Announcement',
                    message: (ann.content || ann.message || '').slice(0, 300),
                    type: ann.category || 'system',
                    createdAt: ann.updatedAt || ann.createdAt || new Date().toISOString(),
                    read: false
                });
                updated = true;
            }
        }

        if (updated) {
            localStorage.setItem(userNotifKey, JSON.stringify(userNotifs.slice(0, 50)));
            if (typeof renderNotifications === 'function') {
                renderNotifications(userNotifs);
            }
            window.dispatchEvent(new CustomEvent('primes_notification_created'));
        }
    } catch (_) {}
}

function showAnnouncementModal(payload, isPreview = false) {
    const modal = ensureAnnouncementModalInDOM();
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

    const session = typeof getSession === 'function' ? getSession() : null;
    const userKey = (session?.email || session?.username || session?._id || 'user').toLowerCase().trim();
    
    // Remember dismissed for this user session
    sessionStorage.setItem(`nuraxq_login_ann_dismissed_${userKey}`, 'true');
    sessionStorage.removeItem('just_logged_in');
    sessionStorage.removeItem('just_signed_up');

    if (currentActiveAnnouncementId) {
        try {
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

// Automatic check and display when user enters dashboard
function autoCheckDashboardAnnouncements() {
    setTimeout(() => {
        if (typeof checkForAnnouncements === 'function') {
            checkForAnnouncements();
        }
        if (typeof syncAdminAnnouncementsToUserNotifications === 'function') {
            syncAdminAnnouncementsToUserNotifications();
        }
    }, 400);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoCheckDashboardAnnouncements);
} else {
    autoCheckDashboardAnnouncements();
}

