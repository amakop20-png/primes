// ==============================
// Toast Notification System
// ==============================
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
                to   { transform: translateX(0); opacity: 1; }
            }
            @keyframes toastSlideOut {
                from { transform: translateX(0); opacity: 1; }
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
        const toast = document.createElement('div');

        toast.style.cssText = `
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

        toast.innerHTML = `
            <div style="text-align:center;">
                <span style="font-size:30px; color:${config.color};">${config.icon}</span>
            </div>
            <div>
                <p style="margin:0 0 4px; font-weight:600;">${config.title}</p>
                <p style="margin:0; font-size:12px; color:#555;">${message}</p>
            </div>
            <button class="toast-close-btn" style="background:none;border:none;cursor:pointer;font-size:22px;color:#aaa;">×</button>
        `;

        this.toastContainer.appendChild(toast);

        const close = () => {
            toast.style.animation = 'toastSlideOut 0.3s forwards';
            setTimeout(() => toast.remove(), 300);
        };

        toast.querySelector('.toast-close-btn').addEventListener('click', close);

        if (duration > 0) {
            setTimeout(close, duration);
        }
    }
}

// ==============================
// Init Toast
// ==============================
const toast = new SimpleToast();

// ==============================
// Validation
// ==============================
const Validator = {
    username(value) {
        return /^[a-zA-Z0-9]+$/.test(value);
    },

    email(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    },

    password(password, confirmPassword) {
        if (password.length < 6) {
            return 'Password must be at least 6 characters';
        }
        if (password !== confirmPassword) {
            return 'Passwords do not match';
        }
        return '';
    }
};

// ==============================
// Button Loader Helper
// ==============================
function toggleButton(btn, spinner, loading) {
    if (!btn || !spinner) return;
    btn.disabled = loading;
    spinner.style.display = loading ? 'inline-block' : 'none';
}

// ==============================
// Password Toggle
// ==============================
function initPasswordToggle() {
    document.querySelectorAll('.password-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.parentElement.querySelector('input');
            if (!input) return;
            const hidden = input.type === 'password';
            input.type = hidden ? 'text' : 'password';
            btn.textContent = hidden ? '🙈' : '👁️';
        });
    });
}

// ==============================
// Live Validation
// ==============================
function initLiveValidation() {
    const usernameInput = document.getElementById('username');
    const usernameError = document.getElementById('username-error');

    usernameInput?.addEventListener('input', (e) => {
        const value = e.target.value;
        if (!/^[a-zA-Z0-9]*$/.test(value)) {
            e.target.value = value.replace(/[^a-zA-Z0-9]/g, '');
            if (usernameError) {
                usernameError.textContent = 'Only letters and numbers allowed';
                usernameError.classList.add('show');
            }
        } else {
            usernameError?.classList.remove('show');
        }
    });

    const confirmInput = document.getElementById('confirm_password');
    const passwordError = document.getElementById('password-error');

    confirmInput?.addEventListener('input', () => {
        const password = document.getElementById('password')?.value || '';
        const error = Validator.password(password, confirmInput.value);
        if (error) {
            passwordError.textContent = error;
            passwordError.classList.add('show');
        } else {
            passwordError?.classList.remove('show');
        }
    });
}

// ==============================
// Form Submit — Formspree
// ==============================
function initForm() {
    const form = document.getElementById('registerForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name            = document.getElementById('name')?.value.trim();
        const username        = document.getElementById('username')?.value.trim();
        const email           = document.getElementById('email')?.value.trim();
        const phone           = document.getElementById('phone')?.value.trim();
        const password        = document.getElementById('password')?.value;
        const confirmPassword = document.getElementById('confirm_password')?.value;
        const acceptTerms     = document.getElementById('accept_terms')?.checked || false;

        const btn     = document.getElementById('registerBtn');
        const spinner = document.getElementById('btnSpinner');

        // — Client-side validation —
        if (!name)                          return toast.show('Full name is required', 'error');
        if (!Validator.username(username))  return toast.show('Username must be letters and numbers only', 'error');
        if (!Validator.email(email))        return toast.show('Enter a valid email address', 'error');
        if (!phone)                         return toast.show('Phone number is required', 'error');

        const passwordError = Validator.password(password, confirmPassword);
        if (passwordError)                  return toast.show(passwordError, 'error');

        if (!acceptTerms)                   return toast.show('You must accept the Terms & Conditions', 'error');

        // — Send to Backend API —
        toggleButton(btn, spinner, true);

        try {
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ name, username, email, phone, password, acceptTerms })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Auto log in by setting the session data
                const sessionData = {
                    ...result.user,
                    loggedAt: new Date().toISOString()
                };
                localStorage.setItem('primes_session', JSON.stringify(sessionData));
                localStorage.setItem('primes_token', result.token);

                toast.show('Account created successfully 🎉', 'success');
                form.reset();
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1500);
            } else {
                toast.show(result.error || 'Submission failed. Please try again.', 'error');
            }

        } catch (err) {
            toast.show('Network error. Please check your connection.', 'error');
        } finally {
            toggleButton(btn, spinner, false);
        }
    });
}

  // Mobile menu toggle
    const menuToggle = document.getElementById('menu-toggle');
    const nav = document.getElementById('nav');

    if (menuToggle) {
      menuToggle.addEventListener('click', function() {
        menuToggle.classList.toggle('open');
        nav.classList.toggle('open');
      });

      // Close menu when a link is clicked
      nav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', function() {
          menuToggle.classList.remove('open');
          nav.classList.remove('open');
        });
      });
    }

    // Hide loader when page fully loads
    window.addEventListener('load', function () {
      const loader = document.getElementById('loaderWrapper');
      if (loader) {
        loader.classList.add('hidden');

        // Remove from DOM completely after fade out
        setTimeout(function () {
          loader.remove();
        }, 500);
      }
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href !== '#' && document.querySelector(href)) {
          e.preventDefault();
          document.querySelector(href).scrollIntoView({
            behavior: 'smooth'
          });
        }
      });
    });
// ==============================
// Init App
// ==============================
document.addEventListener('DOMContentLoaded', () => {
    initPasswordToggle();
    initLiveValidation();
    initForm();
});