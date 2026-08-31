// login.js
// Depends on apiRequest() from api.js.
// IMPORTANT: login.html previously skipped loading api.js (it re-declared
// API_BASE_URL locally instead). Now that this file calls apiRequest(),
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

// ── Initialize Toast ──
const toast = new SimpleToast();

// NOTE: confirm against your backend — other routes use an "/api/"
// prefix (e.g. "/api/get-wallet-balance"), so login is most likely
// "/api/login" rather than "/login". If this 404s, try "/login" or
// "/api/auth/login" instead and check the Network tab response.
const LOGIN_ENDPOINT = '/api/login';

// ── DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {

    // Redirect already-logged-in users straight to the dashboard
    if (localStorage.getItem('primes_token')) {
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

            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = 'Logging in...';
            submitBtn.disabled = true;

            try {
                // ── NuraSMS Login Call — via apiRequest() from api.js.
                // suppressAuthRedirect: true means a 401 here (wrong
                // credentials) throws a plain "invalid login" error
                // instead of triggering apiRequest's normal "session
                // expired, clear token, redirect to login.html" flow —
                // which would make no sense while already on this page.
                const result = await apiRequest(LOGIN_ENDPOINT, {
                    method: 'POST',
                    body: JSON.stringify({ identifier: loginInputValue, password: passwordValue }),
                    suppressAuthRedirect: true
                });

                // ── Clear any stale auth / order state before writing new session ──
                localStorage.removeItem('primes_token');
                localStorage.removeItem('primes_session');
                localStorage.removeItem('currentOrderId');

                const user = result.user || {};
                const sessionData = {
                    ...user,
                    name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username,
                    loggedAt: new Date().toISOString()
                };
                localStorage.setItem('primes_session', JSON.stringify(sessionData));

                // Always store the access token — it is required for every
                // protected API call via apiRequest() in api.js
                const token = result.accessToken || result.token || result.access_token || result.data?.token || result.data?.accessToken;
                if (token) {
                    setAuthToken(token);
                }

                toast.show(result.message || 'Login successful! Redirecting...', 'success');

                setTimeout(() => {
                    window.location.href = result.user?.role === 'admin' ? 'admin.html' : 'dashboard.html';
                }, 1500);

            } catch (error) {
                console.error('Login error:', error);
                // apiRequest() already produces a clean, user-friendly
                // message for every status code it knows about.
                toast.show(error.message || 'Something went wrong. Please try again.', 'error');
            } finally {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled  = false;
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