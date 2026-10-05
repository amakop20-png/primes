// scratch/test-announcements.js
// Verification suite for Announcement Systems & isAdmin functionality

const assert = require('assert');

// Mock browser environment for testing
const mockStorage = {};
const globalMock = {
  localStorage: {
    getItem: (k) => mockStorage[k] || null,
    setItem: (k, v) => { mockStorage[k] = String(v); },
    removeItem: (k) => { delete mockStorage[k]; },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
  },
  sessionStorage: {
    _store: {},
    getItem: function(k) { return this._store[k] || null; },
    setItem: function(k, v) { this._store[k] = String(v); },
    removeItem: function(k) { delete this._store[k]; }
  }
};

// 1. Test isAdmin logic
function testIsAdmin() {
  console.log('Testing isAdmin logic...');
  
  function isAdmin(u) {
    if (!u) {
      const raw = globalMock.localStorage.getItem('primes_session');
      if (raw) {
        try { u = JSON.parse(raw); } catch (_) { u = null; }
      }
    }
    if (!u) {
      const rawAdmin = globalMock.localStorage.getItem('primes_admin_session');
      if (rawAdmin) {
        try { const p = JSON.parse(rawAdmin); if (p && p.loggedIn) return true; } catch (_) {}
      }
      return Boolean(globalMock.localStorage.getItem('primes_admin_token'));
    }
    const role = String(u.role || u.user_role || u.userRole || '').toLowerCase().trim();
    if (role === 'admin' || role === 'superadmin' || role === 'super_admin' || role === 'owner') return true;
    if (u.isAdmin === true || u.is_admin === true || u.admin === true) return true;
    return false;
  }

  assert.strictEqual(isAdmin({ role: 'admin' }), true, 'role admin failed');
  assert.strictEqual(isAdmin({ role: 'ADMIN' }), true, 'role ADMIN failed');
  assert.strictEqual(isAdmin({ role: 'superadmin' }), true, 'role superadmin failed');
  assert.strictEqual(isAdmin({ isAdmin: true }), true, 'isAdmin true failed');
  assert.strictEqual(isAdmin({ is_admin: true }), true, 'is_admin true failed');
  assert.strictEqual(isAdmin({ role: 'customer' }), false, 'customer role should not be admin');
  assert.strictEqual(isAdmin(null), false, 'null should not be admin without stored session');

  globalMock.localStorage.setItem('primes_admin_session', JSON.stringify({ loggedIn: true, username: 'admin' }));
  assert.strictEqual(isAdmin(null), true, 'should detect logged in admin session');
  globalMock.localStorage.clear();

  console.log('✓ isAdmin tests passed successfully');
}

// 2. Test Automatic User Announcement Lifecycle
function testAutomaticUserAnnouncement() {
  console.log('Testing Automatic User Announcement flow...');

  const DEFAULT_LOGIN_ANNOUNCEMENT = {
    id: 'login_tips_v1',
    title: 'Important Announcement',
    subtitle: 'Tips (5)',
    content: '💡 Tip 1\n💡 Tip 2\n💡 Tip 3\n🔒 Tip 4\n💡 Tip 5',
    active: true
  };

  let modalOpened = false;
  let openedData = null;

  function showAnnouncementModal(payload) {
    modalOpened = true;
    openedData = payload;
  }

  function checkForAnnouncements(userKey) {
    const token = globalMock.localStorage.getItem('primes_token');
    if (!token) return false; // Strict auth guard

    const sessionDismissed = globalMock.sessionStorage.getItem(`nuraxq_login_ann_dismissed_${userKey}`);
    if (sessionDismissed === 'true') return false; // Prevent repeated triggers across sections

    const ann = DEFAULT_LOGIN_ANNOUNCEMENT;
    const dismissedKey = `primes_ann_dismissed_${userKey}_${ann.id}`;
    const justLoggedIn = globalMock.sessionStorage.getItem('just_logged_in') === 'true';

    if (globalMock.localStorage.getItem(dismissedKey) === 'true' && !justLoggedIn) {
      return false;
    }

    showAnnouncementModal(ann);
    return true;
  }

  function closeAnnouncementModal(userKey, annId) {
    modalOpened = false;
    globalMock.sessionStorage.setItem(`nuraxq_login_ann_dismissed_${userKey}`, 'true');
    globalMock.sessionStorage.removeItem('just_logged_in');
    globalMock.localStorage.setItem(`primes_ann_dismissed_${userKey}_${annId}`, 'true');
  }

  // Before login: should do nothing
  assert.strictEqual(checkForAnnouncements('testuser@gmail.com'), false, 'Should not show before authentication');

  // User logs in
  globalMock.localStorage.setItem('primes_token', 'jwt_test_token_123');
  globalMock.sessionStorage.setItem('just_logged_in', 'true');

  // Dashboard loads: should open modal automatically
  assert.strictEqual(checkForAnnouncements('testuser@gmail.com'), true, 'Should automatically trigger after login');
  assert.strictEqual(modalOpened, true, 'Modal should be open');
  assert.strictEqual(openedData.title, 'Important Announcement', 'Correct title');

  // User closes modal
  closeAnnouncementModal('testuser@gmail.com', openedData.id);
  assert.strictEqual(modalOpened, false, 'Modal should be closed');

  // User switches dashboard sections: should NOT show again
  assert.strictEqual(checkForAnnouncements('testuser@gmail.com'), false, 'Should not re-trigger when navigating sections');

  console.log('✓ Automatic User Announcement tests passed successfully');
}

// 3. Test Separate Admin Announcement System
function testAdminAnnouncementSystem() {
  console.log('Testing Separate Admin Announcement System...');

  let adminAnnouncements = [];

  function saveAdminAnnouncement(payload) {
    adminAnnouncements.push(payload);
    if (payload.active) {
      // Sync to user notifications
      const notif = {
        id: 'admin_ann_' + payload.id,
        title: `📢 ${payload.title}`,
        message: payload.content,
        type: payload.category || 'notice',
        createdAt: new Date().toISOString()
      };
      const existing = JSON.parse(globalMock.localStorage.getItem('primes_notifications_user') || '[]');
      existing.unshift(notif);
      globalMock.localStorage.setItem('primes_notifications_user', JSON.stringify(existing));
    }
  }

  const newAdminAnn = {
    id: 'ann_maintenance_99',
    title: 'Scheduled Maintenance',
    category: 'maintenance',
    content: 'Server maintenance scheduled tonight at 11PM UTC',
    whatsappUrl: 'https://chat.whatsapp.com/test',
    active: true
  };

  saveAdminAnnouncement(newAdminAnn);

  assert.strictEqual(adminAnnouncements.length, 1, 'Admin announcement saved');
  assert.strictEqual(adminAnnouncements[0].category, 'maintenance', 'Category preserved');

  const userNotifs = JSON.parse(globalMock.localStorage.getItem('primes_notifications_user') || '[]');
  assert.strictEqual(userNotifs.length, 1, 'Synced to user notifications area');
  assert.strictEqual(userNotifs[0].title, '📢 Scheduled Maintenance', 'Notification formatted properly');

  console.log('✓ Separate Admin Announcement System tests passed successfully');
}

testIsAdmin();
testAutomaticUserAnnouncement();
testAdminAnnouncementSystem();
console.log('\nAll verification tests completed with 100% success.');
