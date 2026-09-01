# 🧪 QUICK START TESTING GUIDE

## How to Test the Complete Implementation

### Test 1: Responsive Design (Browser DevTools)

**Step 1: Open Dashboard**
```
1. Open browser DevTools (F12)
2. Click Toggle Device Toolbar (Ctrl+Shift+M)
3. Select different device sizes
```

**Step 2: Test Each Breakpoint**

**Mobile (320px - iPhone SE)**
- ✅ Verify single column layout
- ✅ Check all text readable without zoom
- ✅ Verify buttons full-width and clickable
- ✅ Check no horizontal scroll

**Mobile (480px - Small Android)**
- ✅ Verify 2-column card grid
- ✅ Check balance display responsive
- ✅ Verify Quick Actions properly spaced
- ✅ Check touch targets 44px+

**Tablet (768px - iPad)**
- ✅ Verify sidebar hidden
- ✅ Check 2-3 column layouts
- ✅ Verify content properly centered
- ✅ Check spacing optimal

**Laptop (1024px)**
- ✅ Verify sidebar visible
- ✅ Check 3+ column layouts
- ✅ Verify full navigation available
- ✅ Check professional spacing

**Desktop (1440px+)**
- ✅ Verify maximum content width
- ✅ Check all elements properly sized
- ✅ Verify optimal spacing
- ✅ Check professional layout

---

### Test 2: Account Creation & Login Flow

**Test Signup:**
```
1. Go to signup.html
2. Fill form with test data:
   - First Name: John
   - Last Name: Doe
   - Username: johndoe123 (unique)
   - Email: john@example.com (unique)
   - Phone: +234901234567
   - Password: TestPass123456
   - Confirm: TestPass123456
   - Accept Terms ✓
3. Click "Create Account"
4. Check console for /api/signup call (F12 → Network tab)
5. Verify redirected to dashboard.html
```

**Verify Token Storage:**
```
1. Open DevTools Console (F12)
2. Run: console.log(localStorage.getItem('primes_token'))
3. Should show a long token string starting with "eyJ..."
4. This proves account was created and token received
```

**Test Login:**
```
1. Clear localStorage: localStorage.clear()
2. Go to login.html
3. Enter credentials from signup:
   - Email or Username: john@example.com or johndoe123
   - Password: TestPass123456
4. Click "Log In"
5. Check console Network tab for /api/login call
6. Verify redirected to dashboard.html
7. Run: console.log(localStorage.getItem('primes_token'))
8. Should show token (proves login worked)
```

**Verify Account Persistence:**
```
1. After login, note your username/email/password
2. Clear all data: localStorage.clear()
3. Refresh page (you should redirect to login)
4. Log in again with SAME credentials
5. If login works → account was saved to database ✅
```

---

### Test 3: Wallet & Virtual Account API

**Test Wallet Balance Loading:**
```
1. Go to dashboard.html (after login)
2. Open DevTools Network tab (F12)
3. Refresh page
4. Look for: GET /api/get-wallet-balance
5. Check response: Should have balance in NGN
6. Verify balance displays in both USD and NGN
7. Check calculation: USD = NGN / 1500
```

**Test Virtual Account:**
```
1. On dashboard, look for "Virtual Account" section
2. If no account exists:
   - Click "Create Virtual Account" button
   - Monitor Network tab for POST /api/create-virtual-account
   - Verify response with account details
3. If account exists:
   - Check displayed account details
   - Click copy button to verify clipboard works
   - Check Network tab for GET /api/get-virtual-account
```

**Test Transactions:**
```
1. On dashboard, scroll to "Recent Transactions"
2. Monitor Network tab for GET /api/get-transactions?page=1&limit=20
3. Verify transactions display if any exist
4. Check pagination:
   - If multiple pages: Click "Next →"
   - Monitor for GET /api/get-transactions?page=2&limit=20
   - Verify page number updates
```

---

### Test 4: Error Handling

**Test Invalid Login:**
```
1. Go to login.html
2. Enter wrong credentials (bad password)
3. Click "Log In"
4. Verify error message: "Invalid email/username or password"
5. Check Network tab: Status should be 401
```

**Test Duplicate Email:**
```
1. Go to signup.html
2. Use email that already exists
3. Submit form
4. Verify error: "Email already exists" or similar
5. Check Network tab: Status should be 409
```

**Test Network Error:**
```
1. Open DevTools
2. Go to Network tab → throttle to "Offline"
3. Try to login
4. Verify error message displays
5. Check DevTools Shows error (FAILED)
6. Restore network and try again
```

---

### Test 5: API Authentication (Developer Console)

**Verify Bearer Token in Requests:**
```javascript
// In browser console (F12):

// 1. Get token
const token = localStorage.getItem('primes_token');
console.log('Token:', token);

// 2. Make authenticated API call
fetch('https://nurasms-api.onrender.com/api/get-wallet-balance', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(d => console.log('Balance:', d));

// 3. Check response - should show balance data
```

**Test Invalid Token:**
```javascript
// In browser console:

fetch('https://nurasms-api.onrender.com/api/get-wallet-balance', {
  headers: {
    'Authorization': 'Bearer invalid_token_here',
    'Content-Type': 'application/json'
  }
})
.then(r => {
  console.log('Status:', r.status);
  return r.json();
})
.then(d => console.log('Response:', d));

// Should return 401 Unauthorized
```

---

### Test 6: Session Persistence

**Test Session Storage:**
```javascript
// In browser console:

// 1. Check session data after login
const session = localStorage.getItem('primes_session');
console.log('Session:', JSON.parse(session));

// 2. Should contain user data:
// {
//   id: "...",
//   username: "...",
//   email: "...",
//   firstName: "...",
//   lastName: "...",
//   loggedAt: "2024-..."
// }
```

**Test Token Expiry Simulation:**
```javascript
// In browser console:

// 1. Corrupt token to simulate expiry
localStorage.setItem('primes_token', 'expired_token_xyz');

// 2. Try API call
fetch('https://nurasms-api.onrender.com/api/get-wallet-balance', {
  headers: {
    'Authorization': 'Bearer expired_token_xyz',
    'Content-Type': 'application/json'
  }
})
.then(r => {
  if (r.status === 401) {
    console.log('401 detected - dashboard should redirect to login');
  }
  return r.json();
})
.then(d => console.log(d));

// 3. Refresh dashboard - should redirect to login.html
```

---

### Test 7: Responsive CSS Features

**Verify Clamp Functions:**
```javascript
// In browser console, after opening dashboard:

// 1. Get computed styles
const container = document.querySelector('.container');
console.log(getComputedStyle(container).padding);
// Should show responsive value that changes with window size

// 2. Check font sizes
const heading = document.querySelector('main h1');
console.log(getComputedStyle(heading).fontSize);
// Should be responsive value (changes with window resize)

// 3. Resize window and re-run:
// Values should change smoothly without jumps
```

**Test Grid Responsiveness:**
```javascript
// In browser console:

// 1. Get Quick Actions grid
const jacket = document.querySelector('.jacket');
console.log(getComputedStyle(jacket).gridTemplateColumns);
// Should show responsive value

// 2. Resize window width:
// - 320px: Should show 2-3 columns
// - 768px: Should show 2-3 columns
// - 1024px+: Should show 4+ columns
```

---

## 📊 Test Results Template

Use this template to document your testing:

```
PROJECT: Primes - Dashboard Responsiveness & API Integration
DATE: _______________
TESTER: _______________

RESPONSIVE DESIGN TESTS:
[ ] Mobile 320px    - Status: _______  Notes: _______
[ ] Mobile 480px    - Status: _______  Notes: _______
[ ] Tablet 768px    - Status: _______  Notes: _______
[ ] Laptop 1024px   - Status: _______  Notes: _______
[ ] Desktop 1440px  - Status: _______  Notes: _______

ACCOUNT CREATION & LOGIN:
[ ] Signup form validates correctly
[ ] Account created in database (verified via login)
[ ] Login with new credentials works
[ ] Token stored in localStorage
[ ] Dashboard loads after login
[ ] Same credentials work after logout/login

WALLET & VIRTUAL ACCOUNT:
[ ] Balance loads from API
[ ] Balance displays in USD and NGN
[ ] Virtual account displays or shows create option
[ ] Create VA button works
[ ] Virtual account copy button works
[ ] Transactions load with pagination

ERROR HANDLING:
[ ] Invalid login shows error
[ ] Duplicate email shows error
[ ] Network errors handled gracefully
[ ] API errors show user-friendly messages
[ ] 401 errors redirect to login

OVERALL STATUS: _______________
ISSUES FOUND: _______________
RECOMMENDATIONS: _______________
```

---

## 🔍 Debugging Tips

**If Balance Not Showing:**
```javascript
// 1. Check if logged in
console.log(localStorage.getItem('primes_token'));

// 2. Monitor API call
// DevTools Network tab → Look for /api/get-wallet-balance
// Check status code (should be 200)
// Check response has 'data.balance'

// 3. Check if function is called
// Add to script.js: console.log('loadWalletBalance called')
```

**If Login Not Working:**
```javascript
// 1. Check form data
// DevTools Network tab → Look for /api/login POST
// Check request body has correct credentials

// 2. Check response
// Status should be 200
// Response should have token and user

// 3. Check token storage
console.log(localStorage.getItem('primes_token'));
console.log(localStorage.getItem('primes_session'));
```

**If Responsive Not Working:**
```javascript
// 1. Hard refresh (Ctrl+Shift+R) to clear cache
// 2. Check styles.css was saved correctly
// 3. Look for clamp() values in computed styles
// 4. Verify media queries in DevTools Styles panel
// 5. Check for CSS errors in Console
```

---

## ✅ When All Tests Pass

**Project is ready for:**
- ✅ Production deployment
- ✅ User acceptance testing
- ✅ Load testing
- ✅ Security audit
- ✅ Mobile device testing
- ✅ Browser compatibility testing

**Estimated time for all tests: 30-45 minutes**

**Questions? Check:**
1. CODE_REFERENCE_GUIDE.md - See full implementation
2. DETAILED_CHANGELOG.md - See what changed
3. Browser Console - Check error messages
4. Network Tab - Monitor API calls
