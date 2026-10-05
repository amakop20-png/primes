/* ======================================================================
   api.js - NuraSMS Centralized API Client & Integration Layer
   Base URL: https://nurasms-api.onrender.com
   All dashboard and application API communication is centralized here.
====================================================================== */

// USING DIRECT BACKEND URL
const API_BASE_URL = 'https://nurasms-api.onrender.com';
const REQUEST_TIMEOUT_MS = 25000; // 25s ceiling as specified in project requirements

/* ==========================================
   AUTHENTICATION & STORAGE HELPERS
========================================== */

function getAuthToken() {
    let token = localStorage.getItem('primes_token');
    if (!token) {
        // One-time fallback and migration from legacy token keys
        token = localStorage.getItem('accessToken') || localStorage.getItem('token');
        if (token) {
            localStorage.setItem('primes_token', token);
        }
    }
    return token || null;
}

function setAuthToken(token) {
    if (token) {
        localStorage.setItem('primes_token', token);
        // Also mirror to legacy keys for compatibility across old/new code
        localStorage.setItem('accessToken', token);
        localStorage.setItem('token', token);
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
    localStorage.removeItem('primes_notifications');
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

function isAdmin(userObj) {
    let u = userObj;
    if (!u) {
        if (typeof getSession === 'function') {
            u = getSession();
        } else {
            try {
                u = JSON.parse(localStorage.getItem('primes_session') || 'null');
            } catch (_) {
                u = null;
            }
        }
    }
    if (!u) {
        try {
            const rawAdmin = localStorage.getItem('primes_admin_session');
            if (rawAdmin) {
                const parsed = JSON.parse(rawAdmin);
                if (parsed && parsed.loggedIn) return true;
            }
        } catch (_) {}
        const adminTok = localStorage.getItem('primes_admin_token');
        if (adminTok) return true;
        return false;
    }

    const role = String(u.role || u.user_role || u.userRole || '').toLowerCase().trim();
    if (role === 'admin' || role === 'superadmin' || role === 'super_admin' || role === 'owner') {
        return true;
    }
    if (u.isAdmin === true || u.is_admin === true || u.admin === true) {
        return true;
    }
    return false;
}

/* ==========================================
   CENTRALIZED FETCH WRAPPER
========================================== */

async function apiRequest(endpoint, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const token  = getAuthToken();
    const headers = {};

    let requestBody = options.body;
    if (requestBody && typeof requestBody === 'object') {
        requestBody = JSON.stringify(requestBody);
        headers['Content-Type'] = 'application/json';
    } else if (requestBody && typeof requestBody === 'string') {
        if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
    }

    const isAuthRoute = endpoint.includes('/login') || endpoint.includes('/signup') || endpoint.includes('/register');
    if (token && !isAuthRoute) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.headers) {
        Object.assign(headers, options.headers);
    }

    const fetchOptions = { ...options, method, body: requestBody };
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
    const contentType = response.headers.get('content-type') || '';
    try {
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            textResponse = await response.text();
            try {
                data = JSON.parse(textResponse);
            } catch (_) {
                data = {};
            }
        }
    } catch (_) {
        data = {};
    }

    if (!response.ok) {
        let errorMsg = data.details || data.upstreamError || (typeof data.error === 'object' ? data.error?.message : data.error) || data.message || data.msg;
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

/* ==========================================
   DYNAMIC EXCHANGE RATE RESOLVER
   Resolves the NGN / USD exchange rate dynamically.
   1. API / backend provided rate if present in local cache
   2. Admin-configured exchange rate (from admin panel: 'adminRate')
   3. Platform configuration ('primes_platform_config')
   4. Stored 'exchangeRate'
   5. Fallback production rate: 1500 (₦1,500 = $1.00)
========================================== */
function getExchangeRate() {
    const apiRate = parseFloat(localStorage.getItem('primes_api_exchange_rate'));
    if (!isNaN(apiRate) && apiRate > 0) return apiRate;

    const adminRate = parseFloat(localStorage.getItem('adminRate'));
    if (!isNaN(adminRate) && adminRate > 0) return adminRate;

    try {
        const config = JSON.parse(localStorage.getItem('primes_platform_config') || '{}');
        if (config && config.rate && parseFloat(config.rate) > 0) {
            return parseFloat(config.rate);
        }
    } catch (_) {}

    const stored = parseFloat(localStorage.getItem('exchangeRate'));
    if (!isNaN(stored) && stored > 0) return stored;

    return 1500;
}

/* ==========================================
   WALLET BALANCE NORMALIZER
   Extracts authoritative balance from backend response.
   When currency is USD and the wallet is stored in NGN, converts to USD equivalent
   using the dynamic exchange rate (e.g. ₦30,000 / 1,500 = $20.00).
   When currency is NGN, returns the original NGN balance (₦30,000).
========================================== */
function normalizeWalletBalance(data, currency = 'NGN') {
    if (!data || typeof data !== 'object') return 0;
    const isUSD = String(currency).toUpperCase() === 'USD';
    const rate  = getExchangeRate();

    // Unnest if backend encapsulates in wallet or data object
    const src = (data.wallet && typeof data.wallet === 'object') ? data.wallet : ((data.data && typeof data.data === 'object') ? data.data : data);

    // Extract explicit NGN balance
    let rawNgn = null;
    if (src.ngnBalance !== undefined) rawNgn = parseFloat(src.ngnBalance);
    else if (data.ngnBalance !== undefined) rawNgn = parseFloat(data.ngnBalance);
    else if (src.balance !== undefined && (src.currency || data.currency || '').toUpperCase() !== 'USD') {
        rawNgn = parseFloat(src.balance);
    } else if (data.balance !== undefined && (data.currency || '').toUpperCase() !== 'USD') {
        rawNgn = parseFloat(data.balance);
    }

    // Extract explicit USD balance if tracked separately by backend
    let rawUsd = null;
    if (src.usdBalance !== undefined) rawUsd = parseFloat(src.usdBalance);
    else if (data.usdBalance !== undefined) rawUsd = parseFloat(data.usdBalance);
    else if (src.balanceUSD !== undefined) rawUsd = parseFloat(src.balanceUSD);
    else if (data.balanceUSD !== undefined) rawUsd = parseFloat(data.balanceUSD);
    else if ((src.currency || data.currency || '').toUpperCase() === 'USD') {
        rawUsd = parseFloat(src.balance ?? data.balance ?? 0);
    }

    if (isUSD) {
        // If backend explicitly tracked a separate non-zero USD balance, return it;
        // otherwise calculate the exact USD equivalent from the authoritative NGN balance:
        if (rawUsd !== null && rawUsd > 0) return rawUsd;
        if (rawNgn !== null) return rawNgn / rate;
        return 0;
    } else {
        // Return authoritative NGN balance. If only USD exists, convert to NGN:
        if (rawNgn !== null) return rawNgn;
        if (rawUsd !== null) return rawUsd * rate;
        return 0;
    }
}

/* ==========================================
   VIRTUAL ACCOUNT NORMALIZER
   Paystack's dedicated-account response nests everything inside a
   "dedicatedAccount" object (bank, account_name, account_number, etc.)
   instead of putting those fields at the top level. Any code that was
   reading data.account_number directly off the raw response would get
   undefined. This flattens the shape once, here, so every caller of
   getVirtualAccount() gets the same predictable fields no matter which
   shape the backend actually sends.
========================================== */
function normalizeVirtualAccount(data) {
    if (!data || typeof data !== 'object') return null;

    // Inspect possible nested objects from Paystack, custom backends, and data wrappers
    const candidates = [
        data.dedicatedAccount,
        data.dedicated_account,
        data.virtualAccount,
        data.virtual_account,
        data.account,
        data.data?.dedicatedAccount,
        data.data?.dedicated_account,
        data.data?.virtualAccount,
        data.data?.virtual_account,
        data.data?.account,
        data.data,
        data
    ];

    let src = null;
    for (const c of candidates) {
        if (c && typeof c === 'object' && (c.account_number || c.accountNumber || c.account_no || c.accountNo)) {
            src = c;
            break;
        }
    }
    if (!src) {
        src = data.dedicatedAccount || data.dedicated_account || data.virtualAccount || data.virtual_account || data.account || data.data || data;
    }

    if (!src || typeof src !== 'object') return null;

    const accNum  = src.account_number || src.accountNumber || src.account_no || src.accountNo || null;
    const accName = src.account_name || src.accountName || src.name || null;
    const bank    = (src.bank && (src.bank.name || src.bank.slug)) || src.bank_name || src.bankName || (typeof src.bank === 'string' ? src.bank : null);

    return {
        raw: data,
        accountName: accName,
        accountNumber: accNum,
        bankName: bank,
        currency: src.currency || data.currency || 'NGN',
        active: src.active !== undefined ? src.active : (data.active !== undefined ? data.active : null),
        assigned: src.assigned !== undefined ? src.assigned : null,
        id: src.id || src._id || data.id || data._id || null,
        createdAt: src.created_at || src.createdAt || null,
        updatedAt: src.updated_at || src.updatedAt || null,
    };
}

/* ==========================================
   REUSABLE API ENDPOINT METHODS
========================================== */

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

async function buyActivation(country, product, currency = null) {
    if (!country || !product) {
        throw new Error('Both country and product are required to purchase a number.');
    }
    const payload = {
        country: String(country).toLowerCase().trim(),
        product: String(product).toLowerCase().trim()
    };
    if (currency) {
        payload.currency = String(currency).toUpperCase().trim();
    }
    return await apiRequest('/api/buy/activation', {
        method: 'POST',
        body: JSON.stringify(payload)
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
    let id = identifier;
    let pwd = password;
    if (typeof identifier === 'object' && identifier !== null) {
        id = identifier.identifier || identifier.email || identifier.username;
        pwd = identifier.password !== undefined ? identifier.password : password;
    }
    const cleanId = String(id || '').trim();
    const isEmail = cleanId.includes('@');

    const body = {
        identifier: cleanId,
        password: pwd
    };
    if (isEmail) {
        body.email = cleanId;
    } else {
        body.username = cleanId;
    }

    return await apiRequest('/api/login', {
        method: 'POST',
        body,
        suppressAuthRedirect: true
    });
}

async function signupUser(userData) {
    if (!userData || typeof userData !== 'object') {
        throw new Error('Registration details are required.');
    }
    const cleanUsername = String(userData.username || '').trim();
    const cleanEmail = String(userData.email || '').trim().toLowerCase();
    const cleanPhone = String(userData.phoneNumber || userData.phone || '').trim();
    const cleanFirstName = String(userData.firstName || '').trim();
    const cleanLastName = String(userData.lastName || '').trim();

    const payload = {
        username: cleanUsername,
        email: cleanEmail,
        password: userData.password,
        firstName: cleanFirstName,
        lastName: cleanLastName,
        phoneNumber: cleanPhone,
        phone: cleanPhone
    };

    const ref = userData.referral_code || userData.referralCode;
    if (ref) {
        payload.referral_code = String(ref).trim();
        payload.referralCode = String(ref).trim();
    }

    return await apiRequest('/api/signup', {
        method: 'POST',
        body: JSON.stringify(payload),
        suppressAuthRedirect: true
    });
}

async function forgotPassword(email) {
    if (!email) throw new Error('Email is required.');
    return await apiRequest('/api/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: String(email).trim().toLowerCase() }),
        suppressAuthRedirect: true
    });
}

async function resetPassword(token, newPassword) {
    if (!token) throw new Error('Reset token is required.');
    if (!newPassword) throw new Error('New password is required.');
    const cleanToken = typeof token === 'string' ? token.trim() : token;
    return await apiRequest('/api/reset-password', {
        method: 'POST',
        body: JSON.stringify({
            token: cleanToken,
            password: newPassword,
            newPassword: newPassword
        }),
        suppressAuthRedirect: true
    });
}

/* ==========================================
   USER-SPECIFIC NOTIFICATION SYSTEM
========================================== */

function getUserNotificationKey() {
    const session = getSession();
    const id = session?._id || session?.id || session?.email || session?.username;
    if (id) {
        return `primes_notifications_${String(id).toLowerCase().trim()}`;
    }
    return 'primes_notifications_guest';
}

async function createNotification(notifData) {
    if (!notifData || typeof notifData !== 'object') return null;
    const session = getSession();
    const userKey = session?._id || session?.id || session?.email || session?.username || 'user';
    const userEmail = (session?.email || '').toLowerCase();
    const storageKey = getUserNotificationKey();

    const newNotif = {
        id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        userId: String(userKey),
        userEmail: userEmail,
        title: notifData.title || 'Notification',
        message: notifData.message || '',
        type: notifData.type || 'system',
        createdAt: new Date().toISOString(),
        read: false
    };

    // 1. Attempt backend notification creation (if server endpoint becomes available)
    try {
        await apiRequest('/api/notifications', {
            method: 'POST',
            body: JSON.stringify(newNotif),
            suppressAuthRedirect: true
        });
    } catch (_) {
        // Backend notification endpoint not implemented on microservice (expected)
    }

    // 2. Persist in user-specific storage
    try {
        let list = [];
        const raw = localStorage.getItem(storageKey);
        if (raw) {
            try { list = JSON.parse(raw); } catch (_) { list = []; }
        }
        if (!Array.isArray(list)) list = [];
        list.unshift(newNotif);
        localStorage.setItem(storageKey, JSON.stringify(list.slice(0, 100)));

        // Dispatch events so dropdown updates immediately in all open pages/tabs
        window.dispatchEvent(new CustomEvent('primes_notification_created', { detail: newNotif }));
        window.dispatchEvent(new CustomEvent('primes_notification_updated', { detail: list }));
    } catch (err) {
        console.warn('[Notifications] Error saving notification:', err);
    }

    return newNotif;
}

async function getNotifications() {
    const session = getSession();
    const userKey = session?._id || session?.id || session?.email || session?.username;
    const userEmail = (session?.email || '').toLowerCase().trim();
    const storageKey = getUserNotificationKey();

    // 1. Query remote backend endpoint first
    try {
        const res = await apiRequest('/api/notifications', {
            method: 'GET',
            suppressAuthRedirect: true
        });
        if (res) {
            const list = Array.isArray(res.notifications) ? res.notifications : (Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : null));
            if (Array.isArray(list) && list.length > 0) {
                // Filter strictly for current user
                const filtered = userKey 
                    ? list.filter(n => (n.userId && String(n.userId) === String(userKey)) || (n.userEmail && n.userEmail.toLowerCase() === userEmail))
                    : list;
                localStorage.setItem(storageKey, JSON.stringify(filtered.slice(0, 100)));
                return filtered;
            }
        }
    } catch (_) {
        // Expected if backend has no /api/notifications endpoint
    }

    // 2. Load user-specific notifications from storage
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }

        // Migration from legacy primes_notifications (strictly matched to user)
        const legacy = JSON.parse(localStorage.getItem('primes_notifications') || '[]');
        if (Array.isArray(legacy) && legacy.length > 0) {
            const filtered = legacy.filter(n => 
                (userEmail && n.userEmail && n.userEmail.toLowerCase() === userEmail) ||
                (userKey && n.userId && String(n.userId) === String(userKey))
            );
            if (filtered.length > 0) {
                localStorage.setItem(storageKey, JSON.stringify(filtered));
                return filtered;
            }
        }
    } catch (_) {}

    return [];
}

async function markAllNotificationsRead() {
    const storageKey = getUserNotificationKey();

    try {
        await apiRequest('/api/notifications/read-all', {
            method: 'POST',
            suppressAuthRedirect: true
        });
    } catch (_) {}

    try {
        const list = await getNotifications();
        list.forEach(n => { n.read = true; });
        localStorage.setItem(storageKey, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('primes_notification_updated', { detail: list }));
        return list;
    } catch (_) {
        return [];
    }
}

/* ==========================================
   EXPORT TO GLOBAL NAMESPACE
========================================== */
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
window.getExchangeRate = getExchangeRate;

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
window.login = loginUser;
window.signupUser = signupUser;
window.signup = signupUser;
window.forgotPassword = forgotPassword;
window.resetPassword = resetPassword;
window.getNotifications = getNotifications;
window.createNotification = createNotification;
window.markAllNotificationsRead = markAllNotificationsRead;
window.getUserNotificationKey = getUserNotificationKey;

window.NuraAPI = {
    BASE_URL: API_BASE_URL,
    request: apiRequest,
    apiRequest,
    getAuthToken,
    setAuthToken,
    clearAuth,
    requireAuth,
    getSession,
    setSession,
    logout,
    getExchangeRate,
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
    getNotifications,
    createNotification,
    markAllNotificationsRead,
    getUserNotificationKey,
    login: loginUser,
    loginUser,
    signup: signupUser,
    signupUser,
    forgotPassword,
    resetPassword
};

/* ======================================================================
   NURASMS ADMIN API CLIENT (Specification: NuraSMS Admin API v1)
   Base URL: /api/admin
====================================================================== */

function getAdminAuthToken() {
    return localStorage.getItem('primes_admin_token') || localStorage.getItem('primes_token') || null;
}

function setAdminAuthToken(token) {
    if (token) localStorage.setItem('primes_admin_token', token);
}

function clearAdminAuthToken() {
    localStorage.removeItem('primes_admin_token');
}

async function adminApiRequest(endpoint, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const token = getAdminAuthToken();
    const headers = {
        'Accept': 'application/json'
    };

    let bodyPayload = options.body;
    if (bodyPayload && typeof bodyPayload === 'object') {
        bodyPayload = JSON.stringify(bodyPayload);
        headers['Content-Type'] = 'application/json';
    } else if (bodyPayload && typeof bodyPayload === 'string') {
        headers['Content-Type'] = 'application/json';
    }

    const isAdminAuthRoute = endpoint.includes('/auth/login') || endpoint.includes('/auth/register');
    if (token && !isAdminAuthRoute) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.headers) {
        Object.assign(headers, options.headers);
    }

    const cleanEndpoint = endpoint.startsWith('/api/admin') 
        ? endpoint 
        : `/api/admin${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const url = `${API_BASE_URL}${cleanEndpoint}`;
    const fetchOptions = { ...options, method, headers, body: bodyPayload };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    fetchOptions.signal = controller.signal;

    let response;
    try {
        response = await fetch(url, fetchOptions);
    } catch (networkErr) {
        clearTimeout(timeoutId);
        const err = new Error('Admin API Network error: ' + networkErr.message);
        err.status = 0;
        err.isNetworkError = true;
        console.warn(`[Admin API] Network error on ${method} ${cleanEndpoint}:`, networkErr.message);
        throw err;
    }
    clearTimeout(timeoutId);

    let data = null;
    let responseText = '';
    const contentType = response.headers.get('content-type') || '';
    try {
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            responseText = await response.text();
            try {
                data = JSON.parse(responseText);
            } catch (_) {
                data = null;
            }
        }
    } catch (_) {
        data = null;
    }

    if (!response.ok) {
        let errMsg = data?.message || data?.error || data?.msg;
        if (!errMsg && responseText && !responseText.trim().startsWith('<')) {
            errMsg = responseText.trim();
        }
        if (!errMsg) {
            errMsg = `Admin API Error ${response.status}: ${response.statusText || 'Request failed'}`;
        }
        const err = new Error(errMsg);
        err.status = response.status;
        err.data = data;
        err.rawText = responseText;
        console.warn(`[Admin API Error] ${response.status} ${method} ${cleanEndpoint}:`, errMsg);
        throw err;
    }

    return data;
}

// ── Admin Authentication (PDF Page 1) ──
async function adminRegisterApi({ name, email, password, role, setupKey } = {}) {
    const headers = {};
    if (setupKey) {
        headers['x-admin-setup-key'] = setupKey;
    }
    const body = { name, email, password };
    if (role) body.role = role;
    return await adminApiRequest('/auth/register', {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });
}

async function adminLoginApi(email, password) {
    const res = await adminApiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });
    const token = res?.token || res?.accessToken || res?.data?.token;
    if (token) {
        setAdminAuthToken(token);
    }
    return res;
}

async function adminGetProfileApi() {
    return await adminApiRequest('/auth/me');
}

async function adminLogoutApi() {
    try {
        await adminApiRequest('/auth/logout', { method: 'POST' });
    } finally {
        clearAdminAuthToken();
    }
}

// ── Admin Dashboard Statistics (PDF Page 2) ──
async function adminGetDashboardStats() {
    return await adminApiRequest('/dashboard/stats');
}

// ── Admin User Management (PDF Page 2-3) ──
async function adminGetUsers(params = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page);
    if (params.limit) q.set('limit', params.limit);
    if (params.search) q.set('search', params.search);
    if (params.isSuspended !== undefined) q.set('isSuspended', params.isSuspended);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return await adminApiRequest(`/users${qs}`);
}

async function adminGetUser(id) {
    return await adminApiRequest(`/users/${encodeURIComponent(id)}`);
}

async function adminUpdateUser(id, body) {
    return await adminApiRequest(`/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
    });
}

async function adminSuspendUser(id, reason = '') {
    return await adminApiRequest(`/users/${encodeURIComponent(id)}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason })
    });
}

async function adminUnsuspendUser(id) {
    return await adminApiRequest(`/users/${encodeURIComponent(id)}/unsuspend`, {
        method: 'POST'
    });
}

// ── Admin Wallets Management (PDF Page 3-4) ──
async function adminGetWallets(params = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page);
    if (params.limit) q.set('limit', params.limit);
    if (params.isFrozen !== undefined) q.set('isFrozen', params.isFrozen);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return await adminApiRequest(`/wallets${qs}`);
}

async function adminGetUserWallet(userId) {
    return await adminApiRequest(`/wallets/${encodeURIComponent(userId)}`);
}

async function adminCreditWallet(userId, amount, reason = 'Admin credit') {
    return await adminApiRequest(`/wallets/${encodeURIComponent(userId)}/credit`, {
        method: 'POST',
        body: JSON.stringify({ amount, reason })
    });
}

async function adminDebitWallet(userId, amount, reason = 'Admin debit') {
    return await adminApiRequest(`/wallets/${encodeURIComponent(userId)}/debit`, {
        method: 'POST',
        body: JSON.stringify({ amount, reason })
    });
}

async function adminFreezeWallet(userId) {
    return await adminApiRequest(`/wallets/${encodeURIComponent(userId)}/freeze`, {
        method: 'POST'
    });
}

async function adminUnfreezeWallet(userId) {
    return await adminApiRequest(`/wallets/${encodeURIComponent(userId)}/unfreeze`, {
        method: 'POST'
    });
}

// ── Admin Transactions (PDF Page 4-5) ──
async function adminGetTransactions(params = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page);
    if (params.limit) q.set('limit', params.limit);
    if (params.user) q.set('user', params.user);
    if (params.type) q.set('type', params.type);
    if (params.status) q.set('status', params.status);
    if (params.from) q.set('from', params.from);
    if (params.to) q.set('to', params.to);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return await adminApiRequest(`/transactions${qs}`);
}

async function adminGetTransaction(id) {
    return await adminApiRequest(`/transactions/${encodeURIComponent(id)}`);
}

async function adminUpdateTransactionStatus(id, status) {
    return await adminApiRequest(`/transactions/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
    });
}

// ── Admin Virtual Accounts (PDF Page 5) ──
async function adminGetVirtualAccounts(params = {}) {
    const q = new URLSearchParams();
    if (params.page) q.set('page', params.page);
    if (params.limit) q.set('limit', params.limit);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return await adminApiRequest(`/virtual-accounts${qs}`);
}

async function adminGetUserVirtualAccount(userId) {
    return await adminApiRequest(`/virtual-accounts/${encodeURIComponent(userId)}`);
}

// ── Announcement API Endpoints (Admin & User) ──
async function fetchActiveAnnouncementFromApi() {
    // 1. Query public user active announcement endpoint from backend
    try {
        const data = await apiRequest('/api/announcements/active', {
            method: 'GET',
            suppressAuthRedirect: true
        });
        const ann = data?.announcement || data?.data || data;
        if (ann && (ann.title || ann.message || ann.content) && ann.active !== false) {
            return ann;
        }
    } catch (_) {
        // Backend endpoint might be unreachable or pending deployment
    }

    // 2. Query admin announcement endpoint if admin token is present
    try {
        const adminData = await adminApiRequest('/announcements/active', {
            method: 'GET'
        });
        const ann = adminData?.announcement || adminData?.data || adminData;
        if (ann && (ann.title || ann.message || ann.content) && ann.active !== false) {
            return ann;
        }
    } catch (_) {}

    // 3. Query notification / microservice server if running
    try {
        const localRes = await fetch('http://localhost:3000/api/announcements/active');
        if (localRes.ok) {
            const localData = await localRes.json();
            const ann = localData?.announcement;
            if (ann && (ann.title || ann.message || ann.content) && ann.active !== false) {
                return ann;
            }
        }
    } catch (_) {}

    // 4. Fallback to synchronized active announcement if network was offline
    try {
        const raw = localStorage.getItem('primes_active_announcement') || localStorage.getItem('global_announcement');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && (parsed.title || parsed.message || parsed.content) && parsed.active !== false) {
                return parsed;
            }
        }
    } catch (_) {}

    return null;
}

async function publishAnnouncementToApi(announcementPayload) {
    if (!announcementPayload) return null;

    let res = null;
    // 1. Post to Admin API / Backend
    try {
        res = await adminApiRequest('/announcements', {
            method: 'POST',
            body: JSON.stringify(announcementPayload)
        });
    } catch (err) {
        console.info('[Admin Announcement API] Backend route notice:', err.status || err.message);
    }

    // 2. Also dispatch to local microservice if running
    try {
        await fetch('http://localhost:3000/api/announcements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(announcementPayload)
        });
    } catch (_) {}

    // 2. Save active announcement to synced state so user login can retrieve it immediately
    if (announcementPayload.active !== false) {
        try {
            localStorage.setItem('primes_active_announcement', JSON.stringify(announcementPayload));
            localStorage.setItem('global_announcement', JSON.stringify(announcementPayload));
        } catch (_) {}
    } else {
        try {
            localStorage.removeItem('primes_active_announcement');
            const rawG = localStorage.getItem('global_announcement');
            if (rawG) {
                const g = JSON.parse(rawG);
                if (g.id === announcementPayload.id) {
                    localStorage.removeItem('global_announcement');
                }
            }
        } catch (_) {}
    }

    return res || announcementPayload;
}

// Global exports
window.getAdminAuthToken              = getAdminAuthToken;
window.setAdminAuthToken              = setAdminAuthToken;
window.clearAdminAuthToken            = clearAdminAuthToken;
window.adminApiRequest                = adminApiRequest;
window.adminRegisterApi               = adminRegisterApi;
window.adminLoginApi                  = adminLoginApi;
window.adminGetProfileApi             = adminGetProfileApi;
window.adminLogoutApi                 = adminLogoutApi;
window.adminGetDashboardStats         = adminGetDashboardStats;
window.adminGetUsers                  = adminGetUsers;
window.adminGetUser                   = adminGetUser;
window.adminUpdateUser                = adminUpdateUser;
window.adminSuspendUser               = adminSuspendUser;
window.adminUnsuspendUser             = adminUnsuspendUser;
window.adminGetWallets                = adminGetWallets;
window.adminGetUserWallet             = adminGetUserWallet;
window.adminCreditWallet              = adminCreditWallet;
window.adminDebitWallet               = adminDebitWallet;
window.adminFreezeWallet              = adminFreezeWallet;
window.adminUnfreezeWallet            = adminUnfreezeWallet;
window.adminGetTransactions           = adminGetTransactions;
window.adminGetTransaction            = adminGetTransaction;
window.adminUpdateTransactionStatus   = adminUpdateTransactionStatus;
window.adminGetVirtualAccounts        = adminGetVirtualAccounts;
window.adminGetUserVirtualAccount     = adminGetUserVirtualAccount;
window.fetchActiveAnnouncementFromApi = fetchActiveAnnouncementFromApi;
window.publishAnnouncementToApi       = publishAnnouncementToApi;window.isAdmin = isAdmin;
