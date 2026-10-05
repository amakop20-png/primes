/**
 * ============================================================================
 * server-notify.js - Secure Notification Dispatcher Endpoint
 * ============================================================================
 * Microservice route to trigger server-side Webpushr notifications from
 * backend events or authenticated admin/server webhooks.
 *
 * Keeps webpushrKey and webpushrAuthToken strictly on the server.
 * ============================================================================
 */

const http = require('http');
const { NuraNotifications, sendWebpushrNotification } = require('./webpushr-service');

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
    // Enable CORS for API communication
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    if (req.url === '/api/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', service: 'webpushr-backend' }));
    }

    // Active announcement query endpoint
    if ((req.url === '/api/announcements/active' || req.url === '/api/announcements') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            announcement: global.__activeServerAnnouncement || null
        }));
    }

    // Announcement publication endpoint
    if ((req.url === '/api/announcements' || req.url === '/api/admin/announcements') && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body || '{}');
                global.__activeServerAnnouncement = {
                    ...data,
                    id: data.id || ('ann_' + Date.now()),
                    updatedAt: new Date().toISOString()
                };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true, announcement: global.__activeServerAnnouncement }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // Secure notification dispatch endpoint
    if (req.url === '/api/notify' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body || '{}');
                const event = data.event; // 'numberPurchased', 'otpReceived', 'walletFunded', 'orderCompleted', 'orderCancelled'
                let result;

                switch (event) {
                    case 'numberPurchased':
                        result = await NuraNotifications.numberPurchased(data.country, data.product, data.phone);
                        break;
                    case 'otpReceived':
                        result = await NuraNotifications.otpReceived(data.code, data.service, data.phone);
                        break;
                    case 'walletFunded':
                        result = await NuraNotifications.walletFunded(data.amount, data.currency);
                        break;
                    case 'orderCompleted':
                        result = await NuraNotifications.orderCompleted(data.orderId, data.service);
                        break;
                    case 'orderCancelled':
                        result = await NuraNotifications.orderCancelled(data.orderId);
                        break;
                    default:
                        if (data.title && data.message) {
                            result = await sendWebpushrNotification({
                                title: data.title,
                                message: data.message,
                                target_url: data.target_url,
                                action_buttons: data.action_buttons
                            });
                        } else {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            return res.end(JSON.stringify({ error: 'Invalid notification event or payload.' }));
                        }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true, result }));

            } catch (err) {
                console.error('[Notification Server Error]', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`[Notification Service] Running on port ${PORT}`);
    });
}

module.exports = server;
