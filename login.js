// login.js
// Depends on apiRequest()/loginUser()/clearAuth()/setSession() from api.js.
// api.js MUST be loaded first:
//   <script src="api.js"></script>
//   <script src="login.js"></script>

class SimpleToast {
    constructor() {
        this.toastContainer = null;
        this.createContainer();
        this.injectStyles();
    }

    createContainer() {
        this.toastContainer = document.createElement('div');
        this.toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            width: 380px;
            max-height: 80vh;
            overflow-y: auto;
            font-family: "Poppins", sans-serif;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(this.toastContainer);
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes toastSlideIn {
                from { transform: translateX(110%); opacity: 0; }
                to   { transform: translateX(0);    opacity: 1; }
            }
            @keyframes toastSlideOut {
                from { transform: translateX(0);    opacity: 1; }
                to   { transform: translateX(110%); opacity: 0; }
            }
            .toast-close-btn:hover { color: #333 !important; }
        `;
        document.head.appendChild(style);
    }

    show(message, type = 'info', duration = 5000) {
        const configs = {
            success: { icon: '✓', title: 'Success!', color: '#47D764' },
            error:   { icon: '✗', title: 'Error!',   color: '#ff355b' },
            info:    { icon: 'ℹ', title: 'Info!',    color: '#2F86EB' },
            warning: { icon: '⚠', title: 'Warning!', color: '#FFC021' },
        };

        const config = configs[type] || configs.info;
        const toastEl = document.createElement('div');

        toastEl.style.cssText = `
            width: 100%;
            padding: 16px 20px;
            background-color: #fff;
            border-radius: 8px;
            display: grid;
            grid-template-columns: 48px 1fr 28px;
            align-items: center;
            gap: 8px;
            color: #101020;
            box-shadow: 0 8px 24px rgba(0,0,0,0.10);
            border-left: 6px solid ${config.color};
            animation: toastSlideIn 0.3s ease-out;
        `;

        // escapeHTML() guards against a server error message (or a URL
        // param message below) containing raw HTML/script.
        toastEl.innerHTML = `
            <div style="text-align:center;">
                <span style="font-size:26px; color:${config.color};">${config.icon}</span>
            </div>
            <div>
                <p style="margin:0 0 4px; font-weight:600; font-size:14px;">${config.title}</p>
                <p style="margin:0; font-size:12px; color:#555;">${escapeHTML(message)}</p>
            </div>
            <button class="toast-close-btn" style="background:none;border:none;cursor:pointer;font-size:20px;color:#aaa;">×</button>
        `;

        this.toastContainer.appendChild(toastEl);

        const close = () => {
            toastEl.style.animation = 'toastSlideOut 0.3s ease-out forwards';
            toastEl.addEventListener('animationend', () => toastEl.remove(), { once: true });
        };

        toastEl.querySelector('.toast-close-btn').addEventListener('click', close);
        if (duration > 0) setTimeout(close, duration);
    }
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ── Toast is created inside DOMContentLoaded below (FIX #1) ──
// Creating it at top-level ran document.body.appendChild() before
// <body> was guaranteed to exist, which could throw if this script
// isn't deferred / placed at the end of <body>.
let toast;

// ── DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {

    toast = new SimpleToast();

    // Check for session expired toast notification
    const authMsg = sessionStorage.getItem('auth_message');
    if (authMsg) {
        sessionStorage.removeItem('auth_message');
        setTimeout(() => toast.show(authMsg, 'warning'), 150);
    }

    // Redirect already-logged-in users straight to the dashboard
    if (getAuthToken()) {
        window.location.href = 'dashboard.html';
        return;
    }

    // ── Password Toggle ──
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput  = document.getElementById('password');

    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', function () {
            const isHidden     = passwordInput.type === 'password';
            passwordInput.type = isHidden ? 'text' : 'password';
            this.textContent   = isHidden ? '🙈' : '👁';
        });
    }

    // ── Login Form Submit ──
    const form      = document.getElementById('loginForm');
    const submitBtn = document.getElementById('loginBtn8');

    if (form && submitBtn) {
        form.addEventListener('submit', async function (e) {
            e.preventDefault();

            const loginInputValue = document.getElementById('login_input')?.value.trim();
            const passwordValue   = document.getElementById('password')?.value || '';

            // ── Validate empty fields FIRST ──
            if (!loginInputValue || !passwordValue) {
                toast.show('Email/username and password are required.', 'error');
                return;
            }

            const spinnerEl = document.getElementById('loginSpinner');
            const btnLabel  = submitBtn.querySelector('span');
            const originalText = btnLabel ? btnLabel.textContent : submitBtn.textContent;

            if (btnLabel) btnLabel.textContent = 'Logging in...';
            else submitBtn.textContent = 'Logging in...';
            if (spinnerEl) spinnerEl.style.display = 'inline-block';
            submitBtn.disabled = true;

            try {
                // Clear any stale local auth state before attempting authentication
                clearAuth();

                // ── NuraSMS Login Call — via loginUser() from api.js
                const result = await loginUser(loginInputValue, passwordValue);

                const token = result.accessToken || result.token || result.access_token || result.data?.token || result.data?.accessToken;

                if (!token) {
                    toast.show('Login succeeded but no session token was returned. Please try again.', 'error');
                    return;
                }

                setAuthToken(token);

                const user = result.user || result.data?.user || result.data || {};
                const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.name || 'User';
                const sessionData = {
                    ...user,
                    name: displayName,
                    loggedAt: new Date().toISOString()
                };
                setSession(sessionData);

                // Check admin status robustly
                const isUserAdmin = (typeof isAdmin === 'function' && isAdmin(user)) ||
                                    String(user.role || '').toLowerCase() === 'admin' ||
                                    String(user.role || '').toLowerCase() === 'superadmin' ||
                                    user.isAdmin === true ||
                                    user.is_admin === true;

                if (isUserAdmin) {
                    if (typeof setAdminAuthToken === 'function' && token) {
                        setAdminAuthToken(token);
                    }
                    try {
                        localStorage.setItem('primes_admin_session', JSON.stringify({
                            loggedIn: true,
                            username: displayName || user.username || user.email || 'Admin',
                            role: user.role || 'admin',
                            at: new Date().toISOString()
                        }));
                    } catch (_) {}
                }

                // Mark session flag so automatic user announcement popup checks immediately upon landing on dashboard
                try {
                    sessionStorage.setItem('just_logged_in', 'true');
                } catch (_) {}

                // Initialize welcome notification if user inbox has no items yet
                try {
                    const userEmail = (user.email || '').toLowerCase().trim();
                    const notifKey = `primes_notifications_${userEmail || user._id || user.username || 'user'}`;
                    const existingNotifs = JSON.parse(localStorage.getItem(notifKey) || '[]');
                    if (!existingNotifs || existingNotifs.length === 0) {
                        if (typeof createNotification === 'function') {
                            createNotification({
                                title: 'Welcome to NuraXQ',
                                message: `Welcome, ${displayName}! Your virtual verification account is active and ready.`,
                                type: 'system'
                            });
                        }
                    }
                } catch (_) {}

                toast.show(result.message || 'Login successful! Redirecting...', 'success');

                setTimeout(() => {
                    window.location.href = isUserAdmin ? 'admin.html' : 'dashboard.html';
                }, 1200);

            } catch (error) {
                console.error('Login error:', error);
                const displayMsg = error.message || 'Invalid credentials. Please verify your details.';
                toast.show(displayMsg, 'error');
            } finally {
                if (btnLabel) btnLabel.textContent = originalText;
                else submitBtn.textContent = originalText;
                if (spinnerEl) spinnerEl.style.display = 'none';
                submitBtn.disabled = false;
            }
        });
    }

    // ── URL Param Messages ──
    const params = new URLSearchParams(window.location.search);

    ['error', 'warning', 'success', 'info'].forEach((type) => {
        const msg = params.get(type);
        if (msg) {
            toast.show(decodeURIComponent(msg), type);
            params.delete(type);
        }
    });

    const cleanUrl =
        window.location.pathname +
        (params.toString() ? '?' + params.toString() : '') +
        window.location.hash;

    window.history.replaceState({}, document.title, cleanUrl);
});

// Explicit global exports ensuring inline handlers or external calls never throw 'login is not defined'
if (typeof window !== "undefined") {
    if (typeof loginUser === "function") {
        window.loginUser = loginUser;
        window.login = loginUser;
    }
}