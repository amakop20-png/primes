/**
 * config.js - Centralized Runtime Frontend API Configuration
 *
 * Exposes window.ENV for browser environments.
 * When served via server.js, the /config.js route dynamically injects the
 * current API_BASE_URL / API_URL environment variables from the server environment.
 * This static file ensures fallback compatibility for static hosting,
 * CDNs, and offline/direct browser execution.
 *
 * NOTE: Only non-sensitive public variables should be added here.
 * Never expose secret keys or sensitive credentials in frontend environment variables.
 */
(function (global) {
    global.ENV = global.ENV || {};
    // Fallback base URL pointing to the active backend API
    global.ENV.API_BASE_URL = global.ENV.API_BASE_URL || 'https://nuraxq.com/api';
    global.ENV.API_URL = global.ENV.API_URL || global.ENV.API_BASE_URL;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
