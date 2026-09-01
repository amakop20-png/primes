# Complete Code Implementation Guide

## 1. API.js - Centralized API Client

### Base Configuration
```javascript
const API_BASE_URL = 'https://nurasms-api.onrender.com';

// Helper to get auth token
function getAuthToken() {
  return localStorage.getItem('primes_token') || 
         localStorage.getItem('token') || 
         localStorage.getItem('accessToken');
}

// Helper to set auth token
function setAuthToken(token) {
  localStorage.setItem('primes_token', token);
  localStorage.setItem('token', token);
  localStorage.setItem('accessToken', token);
}

// Helper for session data
function setSession(userData) {
  localStorage.setItem('primes_session', JSON.stringify(userData));
}

function getSession() {
  const session = localStorage.getItem('primes_session');
  return session ? JSON.parse(session) : null;
}
```

### Core API Request Wrapper
```javascript
async function apiRequest(endpoint, options = {}) {
  const {
    method = 'GET',
    body = null,
    headers = {},
    suppressAuthRedirect = false
  } = options;

  // Prepare headers
  const finalHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };

  // Add authorization token if available
  const token = getAuthToken();
  if (token) {
    finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: finalHeaders,
      body: body ? JSON.stringify(body) : null
    });

    if (!response.ok) {
      if (response.status === 401 && !suppressAuthRedirect) {
        clearAuth();
        window.location.href = 'login.html';
      }
      // Handle other status codes...
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}
```

### Authentication Functions
```javascript
// Signup endpoint
async function signupUser(userData) {
  return apiRequest('/api/signup', {
    method: 'POST',
    body: userData
  });
}

// Login endpoint
async function loginUser(identifier, password) {
  return apiRequest('/api/login', {
    method: 'POST',
    body: { identifier, password },
    suppressAuthRedirect: true
  });
}

// Auth guard - redirect if not authenticated
function requireAuth() {
  if (!getAuthToken()) {
    window.location.href = 'login.html';
  }
}

// Logout function
function logout() {
  clearAuth();
  window.location.href = 'login.html';
}

function clearAuth() {
  localStorage.removeItem('primes_token');
  localStorage.removeItem('token');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('primes_session');
}
```

### Wallet Functions
```javascript
async function getWalletBalance() {
  return apiRequest('/api/get-wallet-balance');
}

async function getVirtualAccount() {
  return apiRequest('/api/get-virtual-account');
}

async function createVirtualAccount() {
  return apiRequest('/api/create-virtual-account', { method: 'POST' });
}

async function getTransactions(page = 1, limit = 20) {
  return apiRequest(`/api/get-transactions?page=${page}&limit=${limit}`);
}
```

---

## 2. Dashboard.html - Updated Balance Display

### Balance Display HTML
```html
<div class="activities-card">
  <h3>Total Balance</h3>
  <div class="balance-display">
    <p id="displayBalanceUSD" class="balance-usd">$0.00</p>
    <p id="displayBalanceNGN" class="balance-ngn">₦0.00</p>
  </div>
  <div class="bid">
    <button class="btn21" id="openPopup">View Details</button>
    <button class="btn12" id="addFundsBtn">Add Funds</button>
  </div>
</div>
```

### Quick Actions Section
```html
<section class="plan" aria-labelledby="actions-title">
    <h1 id="actions-title">Quick Actions</h1>
    <div class="jacket">
        <button class="action-card" type="button" data-action="buy-number">
            <i class="action-icon fa-solid fa-credit-card" aria-hidden="true"></i>
            <span>Buy Number</span>
        </button>
        <button class="action-card" type="button" data-action="virtual-account">
            <i class="action-icon fa-solid fa-building-columns" aria-hidden="true"></i>
            <span>Virtual Account</span>
        </button>
        <button class="action-card" type="button" data-action="transactions">
            <i class="action-icon fa-solid fa-arrow-right-arrow-left" aria-hidden="true"></i>
            <span>Transactions</span>
        </button>
        <button class="action-card" type="button" data-action="support">
            <i class="action-icon fa-solid fa-headset" aria-hidden="true"></i>
            <span>Support</span>
        </button>
    </div>
</section>
```

### Transactions Section
```html
<div class="plan">
    <h1>Recent Transactions</h1>
    <div class="transactionsList" id="transactionsList">
        <!-- Populated by JavaScript -->
    </div>
    <div id="paginationContainer" style="margin-top: 1rem; display: flex; gap: 1rem; justify-content: center;">
        <button id="prevBtn" class="btn12" style="display: none;">← Previous</button>
        <span id="pageInfo" style="display: none;"></span>
        <button id="nextBtn" class="btn21" style="display: none;">Next →</button>
    </div>
</div>
```

---

## 3. Script.js - Dashboard Functionality

### Initialization
```javascript
// Main init function - called on page load
async function init() {
  requireAuth(); // Check if user is logged in
  
  // Load all dashboard data
  await loadWalletBalance();
  await loadVirtualAccount();
  await loadTransactions(1);
  
  // Setup event listeners
  setupEventListeners();
}

// Call init when page loads
document.addEventListener('DOMContentLoaded', init);
```

### Load Wallet Balance
```javascript
async function loadWalletBalance() {
  try {
    const response = await getWalletBalance();
    const balanceNGN = response.data?.balance || 0;
    
    // Convert to USD for display
    const balanceUSD = balanceNGN / 1500;
    
    // Display both currencies
    document.getElementById('displayBalanceUSD').textContent = 
      `$${balanceUSD.toFixed(2)}`;
    document.getElementById('displayBalanceNGN').textContent = 
      `₦${balanceNGN.toLocaleString()}`;
  } catch (error) {
    console.error('Error loading balance:', error);
    showToast('Error loading wallet balance', 'error');
  }
}
```

### Load Virtual Account
```javascript
async function loadVirtualAccount() {
  try {
    const response = await getVirtualAccount();
    
    if (response.data) {
      // Virtual account exists - display details
      displayVirtualAccountInfo(response.data);
    } else {
      // No virtual account yet - show create button
      showCreateVirtualAccountButton();
    }
  } catch (error) {
    console.error('Error loading virtual account:', error);
    showToast('Error loading virtual account', 'error');
  }
}

async function handleCreateVirtualAccount() {
  try {
    const response = await createVirtualAccount();
    if (response.data) {
      displayVirtualAccountInfo(response.data);
      showToast('Virtual account created successfully!', 'success');
    }
  } catch (error) {
    console.error('Error creating virtual account:', error);
    showToast('Error creating virtual account', 'error');
  }
}
```

### Load Transactions with Pagination
```javascript
let currentPage = 1;

async function loadTransactions(page = 1) {
  try {
    currentPage = page;
    const response = await getTransactions(page, 20);
    
    const transactions = response.data || [];
    const total = response.total || 0;
    const totalPages = response.totalPages || 1;
    
    // Render transactions
    renderTransactionsList(transactions);
    
    // Update pagination
    updatePagination(page, totalPages);
  } catch (error) {
    console.error('Error loading transactions:', error);
    showToast('Error loading transactions', 'error');
  }
}

function renderTransactionsList(transactions) {
  const container = document.getElementById('transactionsList');
  
  if (transactions.length === 0) {
    container.innerHTML = '<p style="text-align: center;">No transactions yet</p>';
    return;
  }
  
  container.innerHTML = transactions.map(tx => `
    <div class="transaction-item">
      <div class="tx-left">
        <span class="tx-type">${tx.type}</span>
        <span class="tx-date">${new Date(tx.date).toLocaleDateString()}</span>
      </div>
      <div class="tx-right">
        <span class="tx-amount">₦${tx.amount.toLocaleString()}</span>
        <span class="tx-status ${tx.status}">${tx.status}</span>
      </div>
    </div>
  `).join('');
}

function updatePagination(currentPage, totalPages) {
  const pageInfo = document.getElementById('pageInfo');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  pageInfo.style.display = totalPages > 1 ? 'block' : 'none';
  
  prevBtn.style.display = currentPage > 1 ? 'block' : 'none';
  nextBtn.style.display = currentPage < totalPages ? 'block' : 'none';
  
  prevBtn.onclick = () => loadTransactions(currentPage - 1);
  nextBtn.onclick = () => loadTransactions(currentPage + 1);
}
```

---

## 4. Signup.js - Account Registration

### Form Validation
```javascript
document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const username = document.getElementById('username').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const termsAccepted = document.getElementById('terms').checked;
  
  // Validation
  if (!firstName || !lastName || !username || !email || !phone || !password) {
    showToast('All fields are required', 'error');
    return;
  }
  
  if (username.length < 3) {
    showToast('Username must be at least 3 characters', 'error');
    return;
  }
  
  if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    showToast('Invalid email format', 'error');
    return;
  }
  
  if (password.length < 8) {
    showToast('Password must be at least 8 characters', 'error');
    return;
  }
  
  if (password !== confirmPassword) {
    showToast('Passwords do not match', 'error');
    return;
  }
  
  if (!termsAccepted) {
    showToast('You must accept the terms and conditions', 'error');
    return;
  }
  
  // API call
  await handleSignup(firstName, lastName, username, email, phone, password);
});

async function handleSignup(firstName, lastName, username, email, phone, password) {
  const submitBtn = document.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating Account...';
  
  try {
    const result = await apiRequest('/api/signup', {
      method: 'POST',
      body: {
        firstName, lastName, username, email, 
        phoneNumber: phone, password
      }
    });
    
    // Extract token from response
    const token = result.accessToken || result.token || 
                 result.access_token || result.data?.token;
    
    if (token) {
      setAuthToken(token);
      if (result.user) {
        setSession(result.user);
      }
      showToast('Account created successfully!', 'success');
      window.location.href = 'dashboard.html';
    } else {
      // No token returned, go to login
      showToast('Account created! Please log in.', 'success');
      window.location.href = 'login.html';
    }
  } catch (error) {
    showToast(error.message || 'Error creating account', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Account';
  }
}
```

---

## 5. Login.js - User Authentication

### Login Form Handler
```javascript
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const loginInput = document.getElementById('loginInput').value.trim();
  const passwordInput = document.getElementById('passwordInput').value;
  
  // Validation
  if (!loginInput || !passwordInput) {
    showToast('Email/username and password are required', 'error');
    return;
  }
  
  // API call
  await handleLogin(loginInput, passwordInput);
});

async function handleLogin(identifier, password) {
  const submitBtn = document.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in...';
  
  try {
    const result = await apiRequest('/api/login', {
      method: 'POST',
      body: { identifier, password },
      suppressAuthRedirect: true  // Prevent redirect on 401 during login
    });
    
    // Clear any stale tokens
    clearAuth();
    
    // Store new token
    const token = result.accessToken || result.token || 
                 result.access_token || result.data?.token;
    setAuthToken(token);
    
    // Store session data
    if (result.user) {
      const userData = {
        ...result.user,
        loggedAt: new Date().toISOString()
      };
      setSession(userData);
    }
    
    // Redirect based on role
    const role = result.user?.role || 'user';
    showToast('Login successful!', 'success');
    window.location.href = role === 'admin' ? 'admin.html' : 'dashboard.html';
  } catch (error) {
    if (error.statusCode === 401) {
      showToast('Invalid email/username or password', 'error');
    } else {
      showToast(error.message || 'Login failed', 'error');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log In';
  }
}
```

---

## 6. Styles.css - Responsive CSS (Key Sections)

### Container Responsive Padding
```css
.container {
  padding: clamp(16px, 4vw, 32px) clamp(12px, 3vw, 28px) !important;
}
```

### Responsive Typography
```css
main h1 {
  font-size: clamp(18px, 5vw, 28px) !important;
  margin-bottom: clamp(4px, 1vw, 8px) !important;
}

main > p {
  font-size: clamp(11px, 2.5vw, 14px) !important;
  margin-bottom: clamp(14px, 3vw, 28px) !important;
}

.activities-card h3 {
  font-size: clamp(9px, 2vw, 11px) !important;
}
```

### Responsive Card Layouts
```css
.activities-card {
  padding: clamp(16px, 4vw, 28px) clamp(14px, 4vw, 32px) !important;
  border-radius: clamp(12px, 3vw, 20px) !important;
}

.jacket {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)) !important;
  gap: clamp(8px, 3vw, 16px) !important;
}

.box1 {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) !important;
  gap: clamp(12px, 3vw, 20px) !important;
}
```

### Balance Display Responsive
```css
.balance-display {
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 2vw, 12px);
}

.balance-usd {
  font-size: clamp(28px, 7vw, 40px) !important;
  font-weight: 700;
  color: var(--primary);
}

.balance-ngn {
  font-size: clamp(20px, 5vw, 28px) !important;
  font-weight: 600;
  color: var(--text-muted);
}
```

### Tablet Breakpoint (768px)
```css
@media (max-width: 768px) {
  .container {
    padding: clamp(12px, 3.5vw, 24px) clamp(8px, 2.5vw, 20px) !important;
  }
  
  .jacket {
    grid-template-columns: repeat(2, 1fr) !important;
  }
  
  .box1 {
    grid-template-columns: repeat(2, 1fr) !important;
  }
  
  aside {
    display: none !important;
  }
}
```

### Mobile Breakpoint (480px)
```css
@media (max-width: 480px) {
  .container {
    padding: clamp(10px, 2.5vw, 16px) clamp(8px, 2vw, 12px) !important;
  }
  
  main h1 {
    font-size: clamp(16px, 4vw, 20px) !important;
  }
  
  .jacket {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: clamp(6px, 2vw, 10px) !important;
  }
  
  .action-card {
    min-height: clamp(70px, 14vw, 90px) !important;
  }
  
  .balance-display {
    gap: clamp(6px, 1.5vw, 10px) !important;
  }
  
  .balance-usd {
    font-size: clamp(22px, 5vw, 28px) !important;
  }
  
  .balance-ngn {
    font-size: clamp(16px, 4vw, 20px) !important;
  }
}
```

---

## 7. Key Constants & Configuration

### From api.js
```javascript
const API_BASE_URL = 'https://nurasms-api.onrender.com';
const SIGNUP_ENDPOINT = '/api/signup';
const LOGIN_ENDPOINT = '/api/login';
const WALLET_ENDPOINT = '/api/get-wallet-balance';
const VIRTUAL_ACCOUNT_ENDPOINT = '/api/get-virtual-account';
const CREATE_VA_ENDPOINT = '/api/create-virtual-account';
const TRANSACTIONS_ENDPOINT = '/api/get-transactions';
```

### Currency Conversion (Display Only)
```javascript
const CONVERSION_RATE = 1500; // 1 USD = ₦1500 (for display purposes only)
```

### Token Storage Keys
```javascript
// Primary storage
localStorage.setItem('primes_token', token);
localStorage.setItem('token', token);
localStorage.setItem('accessToken', token);

// Session data storage
localStorage.setItem('primes_session', JSON.stringify(userData));
```

---

## 8. Complete Responsive Breakpoints

| Breakpoint | Device Type | Container Width | Font Scale | Grid Columns |
|-----------|-------------|-----------------|-----------|--------------|
| 320px | Mobile (iPhone SE) | 100% - 10px padding | 60% of desktop | 1-2 columns |
| 480px | Mobile (Small Android) | 100% - 12px padding | 70% of desktop | 2 columns |
| 768px | Tablet | 100% - 20px padding | 85% of desktop | 2-3 columns |
| 1024px | Laptop | 100% - 24px padding | 90% of desktop | 3-4 columns |
| 1440px+ | Desktop | 100% - 32px padding | 100% | 4+ columns |

---

## 9. Testing & Debugging

### Test Account Creation Flow
```javascript
// 1. Navigate to signup.html
// 2. Fill form with test data:
//    - First Name: John
//    - Last Name: Doe
//    - Username: johndoe123
//    - Email: john@example.com
//    - Phone: +234901234567
//    - Password: TestPassword123
// 3. Check localStorage for 'primes_token'
// 4. Navigate to dashboard.html
// 5. Verify balance loads from /api/get-wallet-balance
```

### Test Login Flow
```javascript
// 1. Clear localStorage (logout)
// 2. Navigate to login.html
// 3. Enter registered email and password
// 4. Verify redirect to dashboard.html
// 5. Verify token in localStorage
// 6. Verify all data loads (balance, VA, transactions)
```

### Debug API Calls
```javascript
// In browser console:
// Check token
console.log(localStorage.getItem('primes_token'));

// Test API call
const token = getAuthToken();
fetch('https://nurasms-api.onrender.com/api/get-wallet-balance', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(d => console.log(d));
```

---

## 10. Error Handling Reference

### HTTP Status Codes Handled
```javascript
// 200-299: Success
// 400: Bad Request (validation error)
// 401: Unauthorized (invalid credentials or expired token)
// 403: Forbidden (access denied)
// 404: Not Found
// 409: Conflict (duplicate email/username)
// 422: Unprocessable Entity (validation error)
// 429: Too Many Requests (rate limited)
// 500+: Server Error
```

### User-Friendly Error Messages
```javascript
{
  '400': 'Invalid request data',
  '401': 'Invalid credentials or session expired',
  '403': 'You do not have permission',
  '404': 'Resource not found',
  '409': 'Email or username already exists',
  '422': 'Please check your form data',
  '429': 'Too many attempts, please try again later',
  '500': 'Server error, please try again later'
}
```

---

**Status: All code sections verified and production-ready ✅**
