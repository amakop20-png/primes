/* ══════════════════════════════════════════════════════════════════════
   api.js — NuraSMS Centralized API Client & Integration Layer
   Base URL: https://nurasms-api.onrender.com
   All dashboard and application API communication is centralized here.
══════════════════════════════════════════════════════════════════════ */

const API_BASE_URL = 'https://nurasms-api.onrender.com';

/* ══════════════════════════════════════════
   AUTHENTICATION & STORAGE HELPERS
══════════════════════════════════════════ */

/**
 * Retrieve the active JWT access token from localStorage.
 * Checks primary 'primes_token' as well as fallback keys.
 * @returns {string|null}
 */
function getAuthToken() {
    return localStorage.getItem('primes_token') ||
           localStorage.getItem('token') ||
           localStorage.getItem('accessToken') ||
           null;
}

/**
 * Store the JWT access token into localStorage.
 * @param {string} token
 */
function setAuthToken(token) {
    if (token) {
        localStorage.setItem('primes_token', token);
    }
}

/**
 * Clear all authentication tokens, cached session, and order state.
 */
function clearAuth() {
    localStorage.removeItem('primes_token');
    localStorage.removeItem('token');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('primes_session');
    localStorage.removeItem('currentOrderId');
    localStorage.removeItem('_walletBalance');
}

/**
 * Guard a page — if no JWT exists, redirect immediately to login.
 * @returns {boolean}
 */
function requireAuth() {
    const token = getAuthToken();
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

/**
 * Get the cached user session object from localStorage.
 * @returns {object|null}
 */
function getSession() {
    try {
        return JSON.parse(localStorage.getItem('primes_session') || 'null');
    } catch (_) {
        return null;
    }
}

/**
 * Store updated user session data.
 * @param {object} session
 */
function setSession(session) {
    if (session) {
        localStorage.setItem('primes_session', JSON.stringify(session));
    }
}

/**
 * Clear authentication state and redirect to login page.
 */
function logout() {
    clearAuth();
    localStorage.removeItem('primes_currency');
    window.location.href = 'login.html';
}

/* ══════════════════════════════════════════
   CENTRALIZED FETCH WRAPPER
══════════════════════════════════════════ */

/**
 * Core API request function that handles headers, auth tokens,
 * JSON serialization, and comprehensive error handling.
 *
 * @param {string} endpoint - Path starting with '/', e.g. '/api/get-wallet-balance'
 * @param {object} options  - Fetch options (method, body, headers, suppressAuthRedirect, etc.)
 * @returns {Promise<any>}  - Parsed JSON response
 * @throws {Error}          - Formatted error with status code context
 */
async function apiRequest(endpoint, options = {}) {
    const token = getAuthToken();
    const headers = {};

    // Attach Content-Type for JSON request bodies
    if (options.body && typeof options.body === 'string') {
        headers['Content-Type'] = 'application/json';
    }

    // Attach Bearer token for authenticated requests
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Merge any custom headers provided by caller
    if (options.headers) {
        Object.assign(headers, options.headers);
    }

    // Prepare fetch configuration without custom options
    const fetchOptions = { ...options };
    delete fetchOptions.suppressAuthRedirect;
    fetchOptions.headers = headers;

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);
    } catch (networkErr) {
        console.error(`[API Network Error] ${options.method || 'GET'} ${endpoint}:`, networkErr);
        throw new Error('Network error. Please check your internet connection.');
    }

    // Attempt to parse JSON response body
    let data = {};
    try {
        data = await response.json();
    } catch (_) {
        // Non-JSON response (e.g. 502/504 HTML page)
    }

    // Handle non-2xx HTTP responses
    if (!response.ok) {
        const errorMsg = data.message || data.error || data.msg || `Request failed with status ${response.status}`;

        // 401 Unauthorized — Expired or invalid token
        if (response.status === 401) {
            if (!options.suppressAuthRedirect) {
                clearAuth();
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 600);
            }
            throw new Error(data.message || data.error || 'Your session has expired. Please log in again.');
        }

        // 400 Bad Request
        if (response.status === 400) {
            throw new Error(errorMsg);
        }

        // 403 Forbidden
        if (response.status === 403) {
            throw new Error(data.message || data.error || 'You do not have permission to perform this action.');
        }

        // 404 Not Found
        if (response.status === 404) {
            throw new Error(data.message || data.error || 'The requested resource was not found.');
        }

        // 409 Conflict
        if (response.status === 409) {
            throw new Error(data.message || data.error || 'This resource already exists or conflict occurred.');
        }

        // 422 Unprocessable Entity / Validation Error
        if (response.status === 422) {
            throw new Error(data.message || data.error || 'Validation error. Please verify your submitted information.');
        }

        // 429 Too Many Requests
        if (response.status === 429) {
            throw new Error('Too many requests. Please wait a moment and try again.');
        }

        // 500+ Internal Server Error
        if (response.status >= 500) {
            throw new Error(data.message || data.error || 'Server error. Please try again later.');
        }

        throw new Error(errorMsg);
    }

    return data;
}

/* ══════════════════════════════════════════
   REUSABLE API ENDPOINT METHODS
══════════════════════════════════════════ */

/**
 * 1. Virtual Account Endpoints
 */

/**
 * Create a dedicated virtual account for the logged-in user.
 * POST /api/create-virtual-account
 * @returns {Promise<object>}
 */
async function createVirtualAccount() {
    return await apiRequest('/api/create-virtual-account', {
        method: 'POST'
    });
}

/**
 * Get the virtual account assigned to the logged-in user.
 * GET /api/get-virtual-account
 * @returns {Promise<object>}
 */
async function getVirtualAccount() {
    return await apiRequest('/api/get-virtual-account', {
        method: 'GET'
    });
}

/**
 * 2. Wallet Balance Endpoint
 */

/**
 * Get the wallet balance belonging to the logged-in user.
 * GET /api/get-wallet-balance
 * @returns {Promise<object>}
 */
async function getWalletBalance() {
    return await apiRequest('/api/get-wallet-balance', {
        method: 'GET'
    });
}

/**
 * 3. Transactions Endpoint
 */

/**
 * Get the logged-in user's transaction history with pagination.
 * GET /api/get-transactions?page={page}&limit={limit}
 * @param {number} [page=1]
 * @param {number} [limit=20]
 * @returns {Promise<object>}
 */
async function getTransactions(page = 1, limit = 20) {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(limit)
    });
    return await apiRequest(`/api/get-transactions?${params.toString()}`, {
        method: 'GET'
    });
}

/**
 * 4. Countries Endpoint
 */

/**
 * Returns available countries from 5SIM. (Public endpoint)
 * GET /api/countries
 * @returns {Promise<object>}
 */
async function getCountries() {
    return await apiRequest('/api/countries', {
        method: 'GET'
    });
}

/**
 * 5. Products Endpoint
 */

/**
 * Returns available services/products and operators for a country. (Public endpoint)
 * GET /api/products/:country
 * @param {string} country - e.g. 'usa' or 'nigeria'
 * @returns {Promise<object>}
 */
async function getProducts(country) {
    if (!country) throw new Error('Country parameter is required.');
    return await apiRequest(`/api/products/${encodeURIComponent(country)}`, {
        method: 'GET'
    });
}

/**
 * 6. Buy Activation Number Endpoint
 */

/**
 * Purchases a temporary number for receiving an SMS/OTP.
 * POST /api/buy/activation
 * @param {string} country - e.g. 'usa'
 * @param {string} product - e.g. 'whatsapp'
 * @returns {Promise<object>}
 */
async function buyActivation(country, product) {
    if (!country || !product) {
        throw new Error('Both country and product are required to purchase a number.');
    }
    return await apiRequest('/api/buy/activation', {
        method: 'POST',
        body: JSON.stringify({ country, product })
    });
}

/**
 * 7. Order Management Endpoints
 */

/**
 * Check the status of an order and retrieve received SMS messages.
 * GET /api/order/:orderId
 * @param {string|number} orderId
 * @returns {Promise<object>}
 */
async function getOrder(orderId) {
    if (!orderId) throw new Error('Order ID is required.');
    return await apiRequest(`/api/order/${encodeURIComponent(orderId)}`, {
        method: 'GET'
    });
}

/**
 * Marks an order as completed after SMS/code has been received and used.
 * POST /api/order/:orderId/finish
 * @param {string|number} orderId
 * @returns {Promise<object>}
 */
async function finishOrder(orderId) {
    if (!orderId) throw new Error('Order ID is required.');
    return await apiRequest(`/api/order/${encodeURIComponent(orderId)}/finish`, {
        method: 'POST'
    });
}

/**
 * Cancels an activation order.
 * POST /api/order/:orderId/cancel
 * @param {string|number} orderId
 * @returns {Promise<object>}
 */
async function cancelOrder(orderId) {
    if (!orderId) throw new Error('Order ID is required.');
    return await apiRequest(`/api/order/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST'
    });
}

/**
 * Reports and bans a number when unusable or blocked.
 * POST /api/order/:orderId/ban
 * @param {string|number} orderId
 * @returns {Promise<object>}
 */
async function banOrder(orderId) {
    if (!orderId) throw new Error('Order ID is required.');
    return await apiRequest(`/api/order/${encodeURIComponent(orderId)}/ban`, {
        method: 'POST'
    });
}

/**
 * 8. Authentication Endpoints (Convenience wrappers)
 */

/**
 * User login.
 * POST /api/login
 * @param {string} identifier - Email or username
 * @param {string} password
 * @returns {Promise<object>}
 */
async function loginUser(identifier, password) {
    return await apiRequest('/api/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
        suppressAuthRedirect: true
    });
}

/**
 * User registration.
 * POST /api/signup
 * @param {object} userData
 * @returns {Promise<object>}
 */
async function signupUser(userData) {
    return await apiRequest('/api/signup', {
        method: 'POST',
        body: JSON.stringify(userData),
        suppressAuthRedirect: true
    });
}

/**
 * Request password reset link.
 * POST /api/forgot-password
 * @param {string} email
 * @returns {Promise<object>}
 */
async function forgotPassword(email) {
    return await apiRequest('/api/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
        suppressAuthRedirect: true
    });
}

/**
 * Reset password using token.
 * POST /api/reset-password
 * @param {string} token - Reset token from email link
 * @param {string} newPassword - New password
 * @returns {Promise<object>}
 */
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

// Endpoints
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

// Namespace object
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
    signupUser
};
