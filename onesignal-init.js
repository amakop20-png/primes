/**
 * ============================================================================
 * onesignal-init.js - OneSignal Web SDK Integration Module for NuraXQ
 * ============================================================================
 * Official OneSignal Web SDK (v16 User Model) integration.
 * - App ID: 316c0fd1-602f-4bf5-a5eb-8b434b00ff16
 * - Handles SDK initialization, subscription management (opt-in / opt-out),
 *   user identity association (login / logout), and permission flow.
 * - Does not disturb existing notification systems, dropdowns, or authentication.
 * ============================================================================
 */

(function() {
    'use strict';

    const ONESIGNAL_APP_ID = '316c0fd1-602f-4bf5-a5eb-8b434b00ff16';

    // Global queue as required by OneSignal v16
    window.OneSignalDeferred = window.OneSignalDeferred || [];

    let isInitialized = false;

    /**
     * Resolves the stable unique user ID for the logged in NuraXQ user.
     * Looks through session and storage formats safely without breaking auth.
     */
    function getCurrentUserId() {
        try {
            let session = null;
            if (typeof window.getSession === 'function') {
                session = window.getSession();
            }
            if (!session) {
                const raw = localStorage.getItem('primes_session');
                if (raw) session = JSON.parse(raw);
            }
            if (session && typeof session === 'object') {
                const id = session.id || session._id || session.userId || session.user_id || session.email || session.username;
                if (id) return String(id).trim();
            }
        } catch (e) {
            console.warn('[OneSignal] Error reading session for user ID:', e);
        }
        return null;
    }

    /**
     * Associates the current OneSignal subscription with the authenticated NuraXQ user.
     */
    function identifyUser(userId) {
        if (!userId) return;
        window.OneSignalDeferred.push(async function(OneSignal) {
            try {
                // Check if current user is already logged in with this ID
                const currentExternalId = await OneSignal.User?.externalId;
                if (currentExternalId !== String(userId)) {
                    console.log('[OneSignal] Associating push subscription with user:', userId);
                    await OneSignal.login(String(userId));
                }
            } catch (err) {
                console.warn('[OneSignal] Login association failed:', err);
            }
        });
    }

    /**
     * Clears user association on logout so different users on the same browser
     * are not conflated.
     */
    function logoutUser() {
        window.OneSignalDeferred.push(async function(OneSignal) {
            try {
                console.log('[OneSignal] Disassociating user identity on logout');
                await OneSignal.logout();
            } catch (err) {
                console.warn('[OneSignal] Logout disassociation failed:', err);
            }
        });
    }

    /**
     * Request notification permission programmatically (e.g. from user interaction)
     */
    async function requestPermission() {
        return new Promise((resolve) => {
            window.OneSignalDeferred.push(async function(OneSignal) {
                try {
                    const permission = await OneSignal.Notifications.requestPermission();
                    syncSettingsUI();
                    resolve(permission);
                } catch (err) {
                    console.warn('[OneSignal] Error requesting permission:', err);
                    resolve(false);
                }
            });
        });
    }

    /**
     * Opt-in the user to push notifications
     */
    async function optIn() {
        return new Promise((resolve) => {
            window.OneSignalDeferred.push(async function(OneSignal) {
                try {
                    // Check browser permission first
                    if (Notification && Notification.permission === 'default') {
                        await OneSignal.Notifications.requestPermission();
                    }
                    if (OneSignal.User && OneSignal.User.PushSubscription) {
                        await OneSignal.User.PushSubscription.optIn();
                    }
                    syncSettingsUI();
                    resolve(true);
                } catch (err) {
                    console.warn('[OneSignal] Opt-in error:', err);
                    resolve(false);
                }
            });
        });
    }

    /**
     * Opt-out the user from push notifications
     */
    async function optOut() {
        return new Promise((resolve) => {
            window.OneSignalDeferred.push(async function(OneSignal) {
                try {
                    if (OneSignal.User && OneSignal.User.PushSubscription) {
                        await OneSignal.User.PushSubscription.optOut();
                    }
                    syncSettingsUI();
                    resolve(true);
                } catch (err) {
                    console.warn('[OneSignal] Opt-out error:', err);
                    resolve(false);
                }
            });
        });
    }

    /**
     * Checks if the user is currently opted in to push notifications
     */
    async function isSubscribed() {
        return new Promise((resolve) => {
            window.OneSignalDeferred.push(function(OneSignal) {
                try {
                    const isOptedIn = Boolean(OneSignal.User?.PushSubscription?.optedIn);
                    resolve(isOptedIn);
                } catch (err) {
                    resolve(false);
                }
            });
        });
    }

    /**
     * Synchronizes any push notification toggle in the UI (e.g. settings modal)
     */
    function syncSettingsUI() {
        const toggle = document.getElementById('notifPush');
        if (!toggle) return;

        window.OneSignalDeferred.push(function(OneSignal) {
            try {
                const optedIn = OneSignal.User?.PushSubscription?.optedIn;
                toggle.checked = Boolean(optedIn);
            } catch (_) {}
        });
    }

    /**
     * Initialize OneSignal
     */
    function init() {
        if (isInitialized) return;
        isInitialized = true;

        window.OneSignalDeferred.push(async function(OneSignal) {
            try {
                const isLocalhost = window.location.hostname === 'localhost' ||
                                    window.location.hostname === '127.0.0.1';

                await OneSignal.init({
                    appId: ONESIGNAL_APP_ID,
                    allowLocalhostAsSecureOrigin: isLocalhost,
                    promptOptions: {
                        slidedown: {
                            prompts: [
                                {
                                    type: "push",
                                    autoPrompt: true,
                                    delay: {
                                        pageViews: 1,
                                        seconds: 3
                                    }
                                }
                            ]
                        }
                    }
                });

                console.log('[OneSignal] Initialized successfully.');

                // Associate user if already logged in
                const userId = getCurrentUserId();
                if (userId) {
                    identifyUser(userId);
                }

                // Listen for push subscription state changes
                if (OneSignal.User && OneSignal.User.PushSubscription) {
                    OneSignal.User.PushSubscription.addEventListener('change', function(event) {
                        console.log('[OneSignal] Push subscription status changed:', event?.current?.optedIn);
                        syncSettingsUI();
                    });
                }

                syncSettingsUI();

            } catch (err) {
                console.error('[OneSignal] Initialization failed:', err);
            }
        });
    }

    // Public API exposed under window.NuraPush
    window.NuraPush = {
        appId: ONESIGNAL_APP_ID,
        init: init,
        identifyUser: identifyUser,
        logoutUser: logoutUser,
        requestPermission: requestPermission,
        optIn: optIn,
        optOut: optOut,
        isSubscribed: isSubscribed,
        syncSettingsUI: syncSettingsUI,
        getCurrentUserId: getCurrentUserId
    };

    // Auto-run initialization when DOM is loaded or immediately if already ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
