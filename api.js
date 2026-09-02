/* ══════════════════════════════════════════════════════════════════════
   api.js — NuraSMS Centralized API Client & Integration Layer
   Base URL: https://nurasms-api.onrender.com
   All dashboard and application API communication is centralized here.
══════════════════════════════════════════════════════════════════════ */

const API_BASE_URL = 'https://nurasms-api.onrender.com';
const REQUEST_TIMEOUT_MS = 25000; // 25s — gives Render cold starts a chance without hanging forever

/* ══════════════════════════════════════════
   AUTHENTICATION & STORAGE HELPERS
══════════════════════════════════════════ */

function getAuthToken() {
    return localStorage.getItem('primes_token') ||
           localStorage.getItem('token') ||
           localStorage.getItem('accessToken') ||
           null;
}

function setAuthToken(token) {
    if (token) {
        localStorage.setItem('primes_token', token);
    }
}

function clearAuth() {
    localStorage.removeItem('primes_token');
    localStorage.removeItem('token');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('primes_session');
    localStorage.removeItem('currentOrderId');
    localStorage.removeItem('_walletBalance');
}

function requireAuth() {
    const token = getAuthToken();
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

function getSession() {
    try {
        return JSON.parse(localStorage.getItem('primes_session') || 'null');
    } catch (_) {
        return null;
    }
}

function setSession(session) {
    if (session) {
        localStorage.setItem('primes_session', JSON.stringify(session));
    }
}

function logout() {
    clearAuth();
    localStorage.removeItem('primes_currency');
    window.location.href = 'login.html';
}

/* ══════════════════════════════════════════
   CENTRALIZED FETCH WRAPPER
══════════════════════════════════════════ */

async function apiRequest(endpoint, options = {}) {
    const token = getAuthToken();
    const headers = {};

    if (options.body && typeof options.body === 'string') {
        headers['Content-Type'] = 'application/json';
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.headers) {
        Object.assign(headers, options.headers);
    }

    const fetchOptions = { ...options };
    delete fetchOptions.suppressAuthRedirect;
    fetchOptions.headers = headers;

    // fetch() has no built-in timeout — without this, a sleeping Render
    // free-tier backend just hangs the request indefinitely with no
    // feedback to the user. AbortController gives us a hard ceiling.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    fetchOptions.signal = controller.signal;

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);
    } catch (networkErr) {
        clearTimeout(timeoutId);

        if (networkErr.name === 'AbortError') {
            console.error(`[API Timeout] ${options.method || 'GET'} ${endpoint}: exceeded ${REQUEST_TIMEOUT_MS}ms`);
            throw new Error('The server is taking too long to respond. It may be waking up — please try again in a moment.');
        }

        console.error(`[API Network Error] ${options.method || 'GET'} ${endpoint}:`, networkErr);
        throw new Error('Network error. Please check your internet connection.');
    }
    clearTimeout(timeoutId);

    let data = {};
    try {
        data = await response.json();
    } catch (_) {
        // Non-JSON response (e.g. 502/504 HTML page)
    }

    if (!response.ok) {
        const errorMsg = data.message || data.error || data.msg || `Request failed with status ${response.status}`;

        // Every thrown error carries the real HTTP status code as .status,
        // not just a text message. Backend wording changes ("Wallet not
        // found" vs "No assigned VDA" vs anything else) — calling code
        // should never have to guess the status by pattern-matching text.
        const throwWithStatus = (message) => {
            const err = new Error(message);
            err.status = response.status;
            throw err;
        };

        if (response.status === 401) {
            if (!options.suppressAuthRedirect) {
                clearAuth();
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 600);
            }
            throwWithStatus(data.message || data.error || 'Your session has expired. Please log in again.');
        }

        if (response.status === 400) {
            throwWithStatus(errorMsg);
        }

        if (response.status === 403) {
            throwWithStatus(data.message || data.error || 'You do not have permission to perform this action.');
        }

        if (response.status === 404) {
            throwWithStatus(data.message || data.error || 'The requested resource was not found.');
        }

        if (response.status === 409) {
            throwWithStatus(data.message || data.error || 'This resource already exists or conflict occurred.');
        }

        if (response.status === 422) {
            throwWithStatus(data.message || data.error || 'Validation error. Please verify your submitted information.');
        }

        if (response.status === 429) {
            throwWithStatus('Too many requests. Please wait a moment and try again.');
        }

        if (response.status >= 500) {
            throwWithStatus(data.message || data.error || 'Server error. Please try again later.');
        }

        throwWithStatus(errorMsg);
    }

    return data;
}

/* ══════════════════════════════════════════
   REUSABLE API ENDPOINT METHODS
══════════════════════════════════════════ */

async function createVirtualAccount() {
    return await apiRequest('/api/create-virtual-account', {
        method: 'POST'
    });
}

async function getVirtualAccount() {
    return await apiRequest('/api/get-virtual-account', {
        method: 'GET'
    });
}

async function getWalletBalance() {
    return await apiRequest('/api/get-wallet-balance', {
        method: 'GET'
    });
}

async function getTransactions(page = 1, limit = 20) {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(limit)
    });
    return await apiRequest(`/api/get-transactions?${params.toString()}`, {
        method: 'GET'
    });
}

async function getCountries() {
    return await apiRequest('/api/countries', {
        method: 'GET'
    });
}

async function getProducts(country) {
    if (!country) throw new Error('Country parameter is required.');
    return await apiRequest(`/api/products/${encodeURIComponent(country)}`, {
        method: 'GET'
    });
}

async function buyActivation(country, product) {
    if (!country || !product) {
        throw new Error('Both country and product are required to purchase a number.');
    }
    return await apiRequest('/api/buy/activation', {
        method: 'POST',
        body: JSON.stringify({ country, product })
    });
}

async function getOrder(orderId) {
    if (!orderId) throw new Error('Order ID is required.');
    return await apiRequest(`/api/order/${encodeURIComponent(orderId)}`, {
        method: 'GET'
    });
}

async function finishOrder(orderId) {
    if (!orderId) throw new Error('Order ID is required.');
    return await apiRequest(`/api/order/${encodeURIComponent(orderId)}/finish`, {
        method: 'POST'
    });
}

async function cancelOrder(orderId) {
    if (!orderId) throw new Error('Order ID is required.');
    return await apiRequest(`/api/order/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST'
    });
}

async function banOrder(orderId) {
    if (!orderId) throw new Error('Order ID is required.');
    return await apiRequest(`/api/order/${encodeURIComponent(orderId)}/ban`, {
        method: 'POST'
    });
}

async function loginUser(identifier, password) {
    return await apiRequest('/api/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
        suppressAuthRedirect: true
    });
}

async function signupUser(userData) {
    return await apiRequest('/api/signup', {
        method: 'POST',
        body: JSON.stringify(userData),
        suppressAuthRedirect: true
    });
}

async function forgotPassword(email) {
    return await apiRequest('/api/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
        suppressAuthRedirect: true
    });
}

async function resetPassword(token, newPassword) {
    return await apiRequest('/api/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
        suppressAuthRedirect: true
    });
}

/* ══════════════════════════════════════════
   EXPORT TO GLOBAL NAMESPACE
══════════════════════════════════════════ */
window.API_BASE_URL = API_BASE_URL;
window.apiRequest = apiRequest;
window.getAuthToken = getAuthToken;
window.setAuthToken = setAuthToken;
window.clearAuth = clearAuth;
window.requireAuth = requireAuth;
window.getSession = getSession;
window.setSession = setSession;
window.logout = logout;

window.createVirtualAccount = createVirtualAccount;
window.getVirtualAccount = getVirtualAccount;
window.getWalletBalance = getWalletBalance;
window.getTransactions = getTransactions;
window.getCountries = getCountries;
window.getProducts = getProducts;
window.buyActivation = buyActivation;
window.getOrder = getOrder;
window.finishOrder = finishOrder;
window.cancelOrder = cancelOrder;
window.banOrder = banOrder;
window.loginUser = loginUser;
window.signupUser = signupUser;
window.forgotPassword = forgotPassword;
window.resetPassword = resetPassword;

window.NuraAPI = {
    BASE_URL: API_BASE_URL,
    request: apiRequest,
    getAuthToken,
    setAuthToken,
    clearAuth,
    requireAuth,
    getSession,
    setSession,
    logout,
    createVirtualAccount,
    getVirtualAccount,
    getWalletBalance,
    getTransactions,
    getCountries,
    getProducts,
    buyActivation,
    getOrder,
    finishOrder,
    cancelOrder,
    banOrder,
    loginUser,
    signupUser,
    forgotPassword,
    resetPassword
};