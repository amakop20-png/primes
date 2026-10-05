// scratch/test_announcements.js
// Verification script for NuraXQ announcement system

const fs = require('fs');

console.log('--- Testing Announcement System Implementation ---');

// 1. Verify CSS Files contain required classes
const stylesCss = fs.readFileSync('./styles.css', 'utf-8');
const adminCss = fs.readFileSync('./admin.css', 'utf-8');

const requiredCss = [
  'ann-modal-backdrop',
  'ann-modal-card',
  'ann-close-icon-btn',
  'ann-header-wrap',
  'ann-heading-title',
  'ann-heading-subtitle',
  'ann-content-box',
  'ann-item-row',
  'ann-color-purple',
  'ann-color-amber',
  'ann-btn-whatsapp',
  'ann-btn-close'
];

requiredCss.forEach(cls => {
  if (!stylesCss.includes(cls)) {
    console.error(`FAIL: styles.css missing .${cls}`);
  } else {
    console.log(`PASS: styles.css has .${cls}`);
  }
  if (!adminCss.includes(cls)) {
    console.error(`FAIL: admin.css missing .${cls}`);
  } else {
    console.log(`PASS: admin.css has .${cls}`);
  }
});

// 2. Verify HTML files have proper modal markup
const dashboardHtml = fs.readFileSync('./dashboard.html', 'utf-8');
const buyHtml = fs.readFileSync('./buy.html', 'utf-8');
const adminHtml = fs.readFileSync('./admin.html', 'utf-8');

[
  { name: 'dashboard.html', content: dashboardHtml },
  { name: 'buy.html', content: buyHtml },
  { name: 'admin.html', content: adminHtml }
].forEach(({ name, content }) => {
  const checks = [
    'id="announcementModal"',
    'id="announcementCloseTopBtn"',
    'id="announcementTitle"',
    'id="announcementSubtitle"',
    'id="announcementContentBox"',
    'id="announcementModalContent"',
    'id="announcementWhatsappBtn"',
    'id="announcementCloseBtn"'
  ];
  checks.forEach(chk => {
    if (!content.includes(chk)) {
      console.error(`FAIL: ${name} missing ${chk}`);
    } else {
      console.log(`PASS: ${name} has ${chk}`);
    }
  });
});

// 3. Verify admin.html has the section-announcements and nav link
if (adminHtml.includes('id="section-announcements"')) {
  console.log('PASS: admin.html has section-announcements');
} else {
  console.error('FAIL: admin.html missing section-announcements');
}

if (adminHtml.includes('data-section="announcements"')) {
  console.log('PASS: admin.html has announcements nav link');
} else {
  console.error('FAIL: admin.html missing announcements nav link');
}

// 4. Verify ui-shared.js methods
const uiShared = fs.readFileSync('./ui-shared.js', 'utf-8');
[
  'DEFAULT_ANNOUNCEMENT',
  'checkForAnnouncements',
  'showAnnouncementModal',
  'closeAnnouncementModal',
  'parseAnnouncementItems',
  'getActiveAnnouncement',
  'getStoredAnnouncements'
].forEach(fn => {
  if (uiShared.includes(fn)) {
    console.log(`PASS: ui-shared.js contains ${fn}`);
  } else {
    console.error(`FAIL: ui-shared.js missing ${fn}`);
  }
});

// 5. Verify admin.js methods
const adminJs = fs.readFileSync('./admin.js', 'utf-8');
[
  'loadAdminAnnouncements',
  'saveAdminAnnouncement',
  'editAnnouncement',
  'toggleAnnouncementStatus',
  'deleteAnnouncement',
  'previewCurrentAdminAnnouncement',
  'previewFormAnnouncement'
].forEach(fn => {
  if (adminJs.includes(fn)) {
    console.log(`PASS: admin.js contains ${fn}`);
  } else {
    console.error(`FAIL: admin.js missing ${fn}`);
  }
});

console.log('--- Verification Complete ---');
