/**
 * config.js - Centralized Runtime Frontend API Configuration
 *
 * Exposes window.ENV for browser environments.
 * When served via server.js, the /config.js route dynamically injects the
 * current API_BASE_URL / API_URL environment variables from the server environment.
 * This static file ensures fallback compatibility for static hosting,
 * CDNs, and direct browser execution.
 *
 * NOTE: Only non-sensitive public variables should be added here.
 * Never expose secret keys or sensitive credentials in frontend environment variables.
 */
(function (global) {
    global.ENV = global.ENV || {};

    // Production base URL pointing to NuraXQ API
    // Auto-detect Render testing environment or local testing vs production
    var defaultApiUrl = (typeof window !== 'undefined' && (window.location.hostname.includes('onrender.com') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
        ? 'https://nurasms-api.onrender.com'
        : 'https://api.nuraxq.com';
    global.ENV.API_BASE_URL = global.ENV.API_BASE_URL || defaultApiUrl;
    global.ENV.API_URL = global.ENV.API_URL || global.ENV.API_BASE_URL;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
