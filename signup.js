// signup.js
// Depends on apiRequest() from api.js — make sure api.js is included
// BEFORE this file:
//   <script src="api.js"></script>
//   <script src="signup.js"></script>
// (plain scripts, no type="module" needed — apiRequest is a global function)


// ==============================
// Small helper: escape text before injecting into innerHTML
// ==============================
function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}


// ==============================
// Toast Notification
// ==============================
function showToast(message, type = "info") {
    const colors = {
        success: "#47D764",
        error: "#ff355b",
        info: "#2F86EB",
        warning: "#FFC021"
    };

    const titles = {
        success: "Success!",
        error: "Error!",
        info: "Info!",
        warning: "Warning!"
    };

    const toast = document.createElement("div");

    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 350px;
        max-width: calc(100% - 40px);
        padding: 16px 20px;
        background: white;
        border-left: 5px solid ${colors[type]};
        border-radius: 8px;
        box-shadow: 0 8px 25px rgba(0,0,0,0.15);
        z-index: 9999;
        font-family: Arial, sans-serif;
        animation: slideIn 0.3s ease;
    `;

    toast.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
            <span style="
                font-size:25px;
                color:${colors[type]};
                font-weight:bold;
            ">
                ${type === "success" ? "✓" :
                  type === "error" ? "✗" :
                  type === "warning" ? "⚠" : "ℹ"}
            </span>

            <div style="flex:1;">
                <strong>${titles[type]}</strong>
                <p style="margin:5px 0 0; color:#555; font-size:13px;">
                    ${escapeHTML(message)}
                </p>
            </div>

            <button
                style="
                    border:none;
                    background:none;
                    font-size:22px;
                    cursor:pointer;
                    color:#999;
                "
            >×</button>
        </div>
    `;

    document.body.appendChild(toast);

    toast.querySelector("button").onclick = () => {
        toast.remove();
    };

    setTimeout(() => {
        toast.remove();
    }, 5000);
}


// ==============================
// Validation
// ==============================
function isValidUsername(username) {
    return /^[a-zA-Z0-9]{3,}$/.test(username);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhoneNumber(phone) {
    return /^\+?[0-9]{7,15}$/.test(phone);
}


// ==============================
// Password Show / Hide
// ==============================
function initPasswordToggle() {
    document.querySelectorAll(".password-toggle").forEach(button => {
        button.addEventListener("click", () => {
            const input = button.parentElement.querySelector("input");
            if (!input) return;

            if (input.type === "password") {
                input.type = "text";
                button.textContent = "🙈";
            } else {
                input.type = "password";
                button.textContent = "👁️";
            }
        });
    });
}


// ==============================
// Form
// ==============================

// NOTE: confirm this against your backend — other endpoints in api.js
// use an "/api/" prefix (e.g. "/api/get-wallet-balance"), so signup is
// most likely "/api/signup" rather than "/signup". Check your backend
// route file, or watch the Network tab: if this still 404s, try
// "/signup", "/api/register", or "/api/auth/signup" instead.
const SIGNUP_ENDPOINT = "/api/signup";

function initForm() {

    const form = document.getElementById("registerForm");

    if (!form) {
        console.error("registerForm not found");
        return;
    }

    let isSubmitting = false;

    form.addEventListener("submit", async function (event) {

        event.preventDefault();

        if (isSubmitting) return;

        const firstName = document.getElementById("firstName")?.value.trim();
        const lastName = document.getElementById("lastName")?.value.trim();
        const username = document.getElementById("username")?.value.trim();
        const email = document.getElementById("email")?.value.trim();
        const phoneNumber = document.getElementById("phoneNumber")?.value.trim();
        const password = document.getElementById("password")?.value;
        const confirmPassword =
            document.getElementById("confirm_password")?.value;
        const acceptTerms =
            document.getElementById("accept_terms")?.checked;


        // ==============================
        // Validation
        // ==============================

        if (!firstName) {
            showToast("First name is required", "error");
            return;
        }

        if (!lastName) {
            showToast("Last name is required", "error");
            return;
        }

        if (!username) {
            showToast("Username is required", "error");
            return;
        }

        if (!isValidUsername(username)) {
            showToast(
                "Username must be at least 3 characters and contain only letters and numbers",
                "error"
            );
            return;
        }

        if (!email) {
            showToast("Email is required", "error");
            return;
        }

        if (!isValidEmail(email)) {
            showToast("Please enter a valid email address", "error");
            return;
        }

        if (!phoneNumber) {
            showToast("Phone number is required", "error");
            return;
        }

        if (!isValidPhoneNumber(phoneNumber)) {
            showToast("Please enter a valid phone number", "error");
            return;
        }

        if (!password) {
            showToast("Password is required", "error");
            return;
        }

        if (password.length < 8) {
            showToast(
                "Password must be at least 8 characters",
                "error"
            );
            return;
        }

        if (password !== confirmPassword) {
            showToast("Passwords do not match", "error");
            return;
        }

        if (!acceptTerms) {
            showToast(
                "You must accept the Terms & Conditions",
                "error"
            );
            return;
        }


        // ==============================
        // Button Loading
        // ==============================

        const button = document.getElementById("registerBtn");
        const spinner = document.getElementById("btnSpinner");

        isSubmitting = true;
        if (button) button.disabled = true;
        if (spinner) spinner.style.display = "inline-block";


        // ==============================
        // Send Signup Request — via apiRequest() from api.js.
        // apiRequest already builds the URL, sets headers, parses JSON
        // safely, and turns non-2xx responses into a friendly Error
        // message (401/403/404/409/422/429/500 are all handled there).
        // signup.js just calls it and reacts to success/failure.
        // ==============================

        try {

            const result = await apiRequest(SIGNUP_ENDPOINT, {
                method: "POST",
                body: JSON.stringify({
                    username,
                    email,
                    password,
                    firstName,
                    lastName,
                    phoneNumber
                })
            });

            showToast(
                result.message || "Account created successfully!",
                "success"
            );

            // If token returned on signup, store it
            const token = result.accessToken || result.token || result.access_token || result.data?.token || result.data?.accessToken;
            if (token) {
                setAuthToken(token);
                if (result.user) {
                    setSession(result.user);
                }
            }

            form.reset();

            setTimeout(() => {
                window.location.href = token ? "dashboard.html" : "login.html";
            }, 1500);

        } catch (error) {

            console.error("Signup error:", error);

            // apiRequest() already produces a clean, user-friendly
            // message for every status code it knows about.
            showToast(error.message || "Something went wrong. Please try again.", "error");

        } finally {

            isSubmitting = false;
            if (button) button.disabled = false;

            if (spinner) {
                spinner.style.display = "none";
            }
        }

    });
}


// ==============================
// Toast Animation
// ==============================
if (!document.getElementById("toast-slide-in-style")) {
    const toastStyle = document.createElement("style");
    toastStyle.id = "toast-slide-in-style";

    toastStyle.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }

            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;

    document.head.appendChild(toastStyle);
}


// ==============================
// Start
// ==============================
document.addEventListener("DOMContentLoaded", () => {
    initPasswordToggle();
    initForm();
});