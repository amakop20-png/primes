// Webpushr Service Worker
self.addEventListener('install', function(event) {
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event) {
    let payload = {};
    if (event.data) {
        try {
            payload = event.data.json();
        } catch (_) {
            payload = {
                title: 'Notification',
                message: event.data.text()
            };
        }
    }

    const title = payload.title || payload.header || 'NuraXQ Notification';
    const options = {
        body: payload.message || payload.body || payload.alert || 'You have a new update.',
        icon: payload.icon || '/nuraxq-icon.png',
        badge: payload.badge || '/nuraxq-icon.png',
        image: payload.image || undefined,
        data: {
            url: payload.url || payload.target_url || payload.action_url || '/'
        }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
