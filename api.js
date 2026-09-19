/* ══════════════════════════════════════════════════════════════════════
   api.js — NuraSMS Centralized API Client & Integration Layer
   Base URL: https://nurasms-api.onrender.com
   All dashboard and application API communication is centralized here.
══════════════════════════════════════════════════════════════════════ */

// USING DIRECT BACKEND URL
const API_BASE_URL = 'https://nurasms-api.onrender.com';
const REQUEST_TIMEOUT_MS = 25000; // 25s ceiling as specified in project requirements

/* ══════════════════════════════════════════
   AUTHENTICATION & STORAGE HELPERS
══════════════════════════════════════════ */

function getAuthToken() {
    let token = localStorage.getItem('primes_token');
    if (!token) {
        // One-time fallback and migration from legacy token keys
        token = localStorage.getItem('accessToken') || localStorage.getItem('token');
        if (token) {
            localStorage.setItem('primes_token', token);
            localStorage.removeItem('accessToken');
            localStorage.removeItem('token');
        }
    }
    return token || null;
}

function setAuthToken(token) {
    if (token) {
        localStorage.setItem('primes_token', token);
        // Clear conflicting legacy keys
        localStorage.removeItem('accessToken');
        localStorage.removeItem('token');
    }
}

function clearAuth() {
    localStorage.removeItem('primes_token');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('token');
    localStorage.removeItem('primes_session');
    localStorage.removeItem('currentOrderId');
    localStorage.removeItem('_walletBalance');
    localStorage.removeItem('_walletBalance_NGN');
    localStorage.removeItem('_walletBalance_USD');
    localStorage.removeItem('_actual_usd_balance');
    localStorage.removeItem('_actual_ngn_balance');
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
    const method = (options.method || 'GET').toUpperCase();
    const token  = getAuthToken();
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

    const fetchOptions = { ...options, method };
    delete fetchOptions.suppressAuthRedirect;
    fetchOptions.headers = headers;

    // Log request without exposing sensitive tokens
    console.log(`[API Request] ${method} ${endpoint}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    fetchOptions.signal = controller.signal;

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);
    } catch (networkErr) {
        clearTimeout(timeoutId);

        let errMsg = 'Network error. Unable to connect to the server. Please check your connection and try again.';
        if (networkErr.name === 'AbortError') {
            errMsg = `The server took too long to respond (> ${REQUEST_TIMEOUT_MS / 1000}s). Please check your connection and try again.`;
        }

        const err = new Error(errMsg);
        err.status = 0;
        err.endpoint = endpoint;
        err.method = method;
        err.isNetworkError = true;
        err.originalError = networkErr;
        console.error(`[API Error] 0 ${method} ${endpoint}:`, errMsg);
        throw err;
    }
    clearTimeout(timeoutId);

    console.log(`[API Response] ${response.status} ${method} ${endpoint}`);

    let data = {};
    let textResponse = '';
    try {
        textResponse = await response.text();
        if (textResponse) {
            data = JSON.parse(textResponse);
        }
    } catch (_) {
        // Non-JSON response
    }

    if (!response.ok) {
        let errorMsg = data.message || data.error || data.msg;
        if (!errorMsg && textResponse && !textResponse.trim().startsWith('<')) {
            errorMsg = textResponse.trim();
        }

        // Standard fallback messages per HTTP status code if backend didn't supply one
        if (!errorMsg) {
            switch (response.status) {
                case 400:
                    errorMsg = 'Bad request. Please verify your submitted information.';
                    break;
                case 401:
                    errorMsg = 'Your session has expired. Please log in again.';
                    break;
                case 403:
                    errorMsg = 'You do not have permission to perform this action.';
                    break;
                case 404:
                    errorMsg = 'The requested resource was not found.';
                    break;
                case 409:
                    errorMsg = 'A conflict occurred. Please try again.';
                    break;
                case 422:
                    errorMsg = 'Validation failed. Please verify your submitted information.';
                    break;
                case 429:
                    errorMsg = 'Too many requests. Please wait a moment and try again.';
                    break;
                case 500:
                default:
                    errorMsg = response.status >= 500
                        ? 'Server error. Please try again later.'
                        : `Request failed with status ${response.status}`;
                    break;
            }
        }

        const throwWithStatus = (message) => {
            const err = new Error(message);
            err.status = response.status;
            err.endpoint = endpoint;
            err.method = method;
            err.data = data;
            console.error(`[API Error] ${response.status} ${method} ${endpoint}: ${message}`);
            throw err;
        };

        if (response.status === 401) {
            if (!options.suppressAuthRedirect) {
                clearAuth();
                try {
                    sessionStorage.setItem('auth_message', 'Your session has expired. Please log in again.');
                } catch (_) {}
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 600);
            }
            throwWithStatus(errorMsg);
        }

        // For all non-200 responses, preserve the real status and message
        throwWithStatus(errorMsg);
    }

    return data;
}

/* ══════════════════════════════════════════
   WALLET BALANCE NORMALIZER
   Extracts real balance directly from backend response without synthetic
   cross-currency conversion. NGN and USD remain strictly separate.
══════════════════════════════════════════ */
function normalizeWalletBalance(data, currency = 'NGN') {
    if (!data || typeof data !== 'object') return 0;
    const isUSD = String(currency).toUpperCase() === 'USD';

    if (isUSD) {
        if (data.usdBalance !== undefined) return parseFloat(data.usdBalance) || 0;
        if (data.wallet?.usdBalance !== undefined) return parseFloat(data.wallet.usdBalance) || 0;
        if (data.balanceUSD !== undefined) return parseFloat(data.balanceUSD) || 0;
        if ((data.currency || data.wallet?.currency || '').toUpperCase() === 'USD') {
            return parseFloat(data.balance ?? data.wallet?.balance ?? 0) || 0;
        }
        if (data.balance !== undefined && data.usdBalance === undefined && data.ngnBalance === undefined) {
            return parseFloat(data.balance) || 0;
        }
        return 0;
    } else {
        if (data.ngnBalance !== undefined) return parseFloat(data.ngnBalance) || 0;
        if (data.wallet?.ngnBalance !== undefined) return parseFloat(data.wallet.ngnBalance) || 0;
        if ((data.currency || data.wallet?.currency || '').toUpperCase() === 'NGN') {
            return parseFloat(data.balance ?? data.wallet?.balance ?? 0) || 0;
        }
        if (data.balance !== undefined && data.usdBalance === undefined && data.ngnBalance === undefined) {
            return parseFloat(data.balance) || 0;
        }
        return 0;
    }
}

/* ══════════════════════════════════════════
   VIRTUAL ACCOUNT NORMALIZER
   Paystack's dedicated-account response nests everything inside a
   "dedicatedAccount" object (bank, account_name, account_number, etc.)
   instead of putting those fields at the top level. Any code that was
   reading data.account_number directly off the raw response would get
   undefined. This flattens the shape once, here, so every caller of
   getVirtualAccount() gets the same predictable fields no matter which
   shape the backend actually sends.
══════════════════════════════════════════ */
function normalizeVirtualAccount(data) {
    if (!data || typeof data !== 'object') return null;

    // Some backends already return it flat — support both.
    const src = data.dedicatedAccount || data.virtualAccount || data;

    if (!src || typeof src !== 'object') return null;

    return {
        raw: data,
        accountName: src.account_name || src.accountName || null,
        accountNumber: src.account_number || src.accountNumber || null,
        bankName: (src.bank && (src.bank.name || src.bank.slug)) || src.bankName || null,
        currency: src.currency || 'NGN',
        active: src.active !== undefined ? src.active : null,
        assigned: src.assigned !== undefined ? src.assigned : null,
        id: src.id || data._id || null,
        createdAt: src.created_at || src.createdAt || null,
        updatedAt: src.updated_at || src.updatedAt || null,
    };
}

/* ══════════════════════════════════════════
   REUSABLE API ENDPOINT METHODS
══════════════════════════════════════════ */

async function createVirtualAccount(currency = 'NGN') {
    const data = await apiRequest('/api/create-virtual-account', {
        method: 'POST',
        body: JSON.stringify({ currency: currency || 'NGN' })
    });
    return normalizeVirtualAccount(data);
}

async function getVirtualAccount(currency = 'NGN') {
    const curr = currency || 'NGN';
    const data = await apiRequest(`/api/get-virtual-account?currency=${encodeURIComponent(curr)}`, {
        method: 'GET'
    });
    return normalizeVirtualAccount(data);
}

async function getWalletBalance(currency = 'NGN') {
    const curr = currency || 'NGN';
    return await apiRequest(`/api/get-wallet-balance?currency=${encodeURIComponent(curr)}`, {
        method: 'GET'
    });
}

async function getTransactions(page = 1, limit = 20, currency = 'NGN') {
    const params = new URLSearchParams({
        page: String(page || 1),
        limit: String(limit || 20),
        currency: currency || 'NGN'
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
        body: JSON.stringify({
            country: String(country).toLowerCase().trim(),
            product: String(product).toLowerCase().trim()
        })
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
window.normalizeVirtualAccount = normalizeVirtualAccount;
window.normalizeWalletBalance = normalizeWalletBalance;

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
    normalizeVirtualAccount,
    normalizeWalletBalance,
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