/**
 * ============================================================================
 * webpushr-service.js - Backend Webpushr Push Notification Service
 * ============================================================================
 * Handles sending browser push notifications via Webpushr REST API.
 * Credentials are read exclusively from process.env (WEBPUSHR_KEY & WEBPUSHR_AUTH_TOKEN).
 * Never exposed to browser or client JavaScript.
 * ============================================================================
 */

const https = require('https');
const path = require('path');
const fs = require('fs');

// Attempt loading local .env if present without requiring external dotenv package
try {
    const envPath = path.resolve(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx > 0) {
                    const key = trimmed.slice(0, eqIdx).trim();
                    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
                    if (!process.env[key]) {
                        process.env[key] = val;
                    }
                }
            }
        });
    }
} catch (_) {}

const WEBPUSHR_API_URL = 'https://api.webpushr.com/v1/notification/send/all';

/**
 * Sends a push notification to all subscribers via Webpushr REST API.
 * @param {Object} options
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification body text
 * @param {string} [options.target_url] - Target destination URL
 * @param {Array<Object>} [options.action_buttons] - Array of {title, url}
 * @returns {Promise<Object>}
 */
async function sendWebpushrNotification({ title, message, target_url, action_buttons }) {
    const webpushrKey = process.env.WEBPUSHR_KEY;
    const webpushrAuthToken = process.env.WEBPUSHR_AUTH_TOKEN;

    if (!webpushrKey || !webpushrAuthToken) {
        const err = new Error('Webpushr backend credentials not configured in environment (WEBPUSHR_KEY, WEBPUSHR_AUTH_TOKEN).');
        console.error('[Webpushr Service]', err.message);
        throw err;
    }

    if (!title || !message) {
        throw new Error('Notification title and message are required.');
    }

    const payload = {
        title: String(title).slice(0, 100),
        message: String(message).slice(0, 255),
        target_url: target_url || 'https://nurasms.com'
    };

    if (Array.isArray(action_buttons) && action_buttons.length > 0) {
        payload.action_buttons = action_buttons;
    }

    const postData = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
        const req = https.request(WEBPUSHR_API_URL, {
            method: 'POST',
            rejectUnauthorized: false,
            headers: {
                'webpushrKey': webpushrKey,
                'webpushrAuthToken': String(webpushrAuthToken),
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (res.statusCode >= 200 && res.statusCode < 300 && parsed.status === 'success') {
                        console.log(`[Webpushr Service] Sent "${title}" (Campaign ID: ${parsed.ID})`);
                        resolve(parsed);
                    } else {
                        console.warn('[Webpushr Service] Non-success response:', body);
                        resolve(parsed);
                    }
                } catch (e) {
                    resolve({ status: 'raw', body, statusCode: res.statusCode });
                }
            });
        });

        req.on('error', (err) => {
            console.error('[Webpushr Service] Network error sending notification:', err.message);
            reject(err);
        });

        req.write(postData);
        req.end();
    });
}

/**
 * High-level NuraXQ Notification Dispatchers
 */
const NuraNotifications = {
    // 1. Number Purchased
    numberPurchased: (country, product, phone) => {
        return sendWebpushrNotification({
            title: 'Number Purchased',
            message: `Your ${product ? product.toUpperCase() : ''} number (${country ? country.toUpperCase() : ''}) ${phone || ''} has been purchased successfully.`,
            target_url: 'https://nurasms.com/dashboard.html',
            action_buttons: [
                { title: 'View Orders', url: 'https://nurasms.com/dashboard.html' }
            ]
        });
    },

    // 2. OTP/SMS Received
    otpReceived: (code, service, phone) => {
        return sendWebpushrNotification({
            title: 'OTP Received',
            message: `Your verification code for ${service || 'service'} is: ${code || '***'}.`,
            target_url: 'https://nurasms.com/dashboard.html',
            action_buttons: [
                { title: 'Open Dashboard', url: 'https://nurasms.com/dashboard.html' }
            ]
        });
    },

    // 3. Wallet Funded
    walletFunded: (amount, currency = 'NGN') => {
        const symbol = currency === 'USD' ? '$' : '₦';
        return sendWebpushrNotification({
            title: 'Wallet Funded',
            message: `Your wallet has been credited successfully with ${symbol}${amount}.`,
            target_url: 'https://nurasms.com/dashboard.html',
            action_buttons: [
                { title: 'View Balance', url: 'https://nurasms.com/dashboard.html' }
            ]
        });
    },

    // 4. Order Completed
    orderCompleted: (orderId, service) => {
        return sendWebpushrNotification({
            title: 'Order Completed',
            message: `Your order #${orderId || ''} for ${service || 'number verification'} has been completed.`,
            target_url: 'https://nurasms.com/dashboard.html',
            action_buttons: [
                { title: 'View Order', url: 'https://nurasms.com/dashboard.html' }
            ]
        });
    },

    // 5. Order Cancelled
    orderCancelled: (orderId) => {
        return sendWebpushrNotification({
            title: 'Order Cancelled',
            message: `Your order #${orderId || ''} has been cancelled and funds have been refunded to your wallet.`,
            target_url: 'https://nurasms.com/dashboard.html',
            action_buttons: [
                { title: 'Check Wallet', url: 'https://nurasms.com/dashboard.html' }
            ]
        });
    },

    // Generic Event
    customEvent: ({ title, message, target_url, action_buttons }) => {
        return sendWebpushrNotification({ title, message, target_url, action_buttons });
    }
};

module.exports = {
    sendWebpushrNotification,
    NuraNotifications
};
