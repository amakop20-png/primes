# Nura SQ Platform Corrections & System Documentation
**Document Version:** 2.4  
**Date:** September 21, 2026  
**Subject:** Real-Order SMS Retrieval Debugging (`1096105450`), General Polling Engine Overhaul, Cancel Confirmation Dialog, and Currency Display Conversion  

---

## 1. Executive Summary

This document records the exact corrections, architectural findings, and test results implemented across the Nura SQ platform. It addresses three primary system enhancements:
1. **SMS Retrieval & Polling Engine Debugging**: Investigated real Order ID **`1096105450`** against the live Nura SQ API, identified the root causes for missing verification codes, and permanently upgraded the frontend parsing and polling logic for all future activations.
2. **Production-Grade Cancel Number Confirmation**: Replaced browser-native popups with an accessible, high-contrast modal dialog designed to prevent accidental order terminations.
3. **Dashboard Currency Conversion (NGN / USD)**: Configured real-time, zero-loss currency display conversion across wallet cards, transaction history, referral balances, and deposit handlers.

---

## 2. Live Debugging Trace: Order ID `1096105450`

### 2.1 The Investigation
Order ID `1096105450` was used to audit the complete network flow from frontend purchase to upstream status resolution.

- **Authoritative Backend**: `https://nurasms-api.onrender.com`
- **Inspected Endpoint**: `GET /api/order/1096105450`
- **Authentication**: `Bearer <JWT_TOKEN>`
- **HTTP Status Received**: `200 OK`

### 2.2 Raw API Response Payload
```json
{
  "order": {
    "id": 1096105450,
    "phone": "+12089374346",
    "operator": "virtual51",
    "product": "aliexpress",
    "price": 0.0449,
    "status": "TIMEOUT",
    "expires": "2026-09-21T11:55:50.429006Z",
    "sms": [],
    "created_at": "2026-09-21T11:35:50.429006Z",
    "country": "usa"
  }
}
```

### 2.3 Findings & Technical Breakdown
1. **Order Confirmation**: Order `1096105450` is authentic and confirmed on the Nura SQ backend.
2. **Associated Phone Number**: The number is **`+12089374346`** (Country: `usa`, Operator: `virtual51`, Product: `aliexpress`).
3. **Endpoint Validation**: The only valid endpoint for querying orders is **`GET /api/order/:orderId`**. Alternative paths (such as `/user/check/:id` or `/api/check-order/:id`) return `404 Not Found`.
4. **Current Status**: **`TIMEOUT`**
   - Created at: `11:35:50 UTC`
   - Expired at: `11:55:50 UTC` (20-minute validity window)
5. **Why No Code Appeared**:
   - `sms` is `[]` (empty array).
   - **Upstream Reality**: The upstream cellular provider / AliExpress did not deliver any SMS to `+12089374346` within the 20-minute activation window. As a result, the order timed out upstream. No verification code was ever received from the provider.
6. **Frontend Limitations Uncovered**:
   - Polling previously did not recognize `TIMEOUT` as a terminal status, keeping the interval active in the background.
   - The UI strictly required `status === 'RECEIVED'` to render an OTP. If an SMS was delivered while the order was `PENDING` or `FINISHED`, it remained hidden.

---

## 3. General SMS Polling & Extraction Engine Fixes

The following fixes were implemented in [`buy.js`](file:///c:/Users/hp/Documents/primes/buy.js) to ensure reliable SMS capture for all current and future orders:

### 3.1 Multi-Structure SMS & OTP Parser
The frontend now inspects all potential response structures rather than relying on a single fixed field:
- `order.sms` as an array of objects (`[{ code: "...", text: "...", sender: "..." }]`)
- `order.sms` as a single object or raw text string
- Top-level properties: `order.code`, `order.smsCode`, `order.sms_code`, `order.otp`, `order.verification_code`, `order.text`, `order.message`
- If any valid SMS or OTP exists, the UI renders it immediately, regardless of whether `order.status` is `PENDING`, `RECEIVED`, or `FINISHED`.

### 3.2 Intelligent OTP Extraction (`extractOTP`)
Replaced the fragile regex with a prioritized multi-pass extraction engine:
1. **Pattern 1 (Labeled Codes)**: Scans for explicit prefixes (`code: 123456`, `verification code is 492014`, `OTP: 9102`, `pin: 58291`) requiring numeric presence.
2. **Pattern 2 (Leading Numbers)**: Extracts leading code formats (`938472 is your code`).
3. **Pattern 3 (Fallback)**: Extracts any 4-to-8 digit sequence while filtering out current years (`2024–2027`) to prevent timestamp misidentification.

### 3.3 Terminal Status & Polling Halting
Polling now halts immediately upon:
- Receiving an SMS message or verification code.
- Encountering terminal statuses: `TIMEOUT`, `EXPIRED`, `FINISHED`, `CANCELED`, or `BANNED`.
- When an order expires or times out, the status pill displays:
  `⏰ Order Timed Out (No SMS received from provider)`.

### 3.4 Multi-Message & Rental Inbox Support
Added full rendering of multiple SMS messages into `#smsInboxList` and implemented `refreshInbox()` to support rental activations and multiple sequential codes.

---

## 4. Production-Grade "Cancel Number" Confirmation Modal

Implemented in [`buy.html`](file:///c:/Users/hp/Documents/primes/buy.html) and [`buy.js`](file:///c:/Users/hp/Documents/primes/buy.js) to replace standard browser alert dialogs.

### 4.1 Interface Copy
- **Dialog Title**: `Cancel Number?`
- **Description**: `Are you sure you want to cancel this number?`
- **Warning Card**: *If you cancel it, the current activation/order may be terminated and the number may no longer be available for this request.*
- **Actions**:
  - **[Keep Number]** — Primary safe action (soft neutral styling).
  - **[Cancel Number]** — Destructive action (bold red `#dc2626` styling).

### 4.2 Safety & Accidental Click Protections
- Automatically focuses the **Keep Number** button when the modal opens, preventing accidental `Enter` or `Space` key confirmations.
- Clicking outside the modal card (on the backdrop overlay) or pressing `Escape` dismisses the dialog safely without cancelling the number.
- Guarded by `isActionBusy` to prevent duplicate concurrent cancellation requests.

### 4.3 Loading States & Feedback
- During request transit: Displays a spinning loader with `"Cancelling…"` and disables all buttons.
- On Success: Closes the modal, halts polling, resets local storage, refreshes the wallet balance, and triggers a confirmation notification:
  `showToast('✅ Number has been successfully cancelled.', 'success')`.
- On Error: Restores button interactivity and displays the specific server error message.

---

## 5. Currency Display Conversion (NGN / USD)

Implemented in [`script.js`](file:///c:/Users/hp/Documents/primes/script.js), [`api.js`](file:///c:/Users/hp/Documents/primes/api.js), and [`buy.js`](file:///c:/Users/hp/Documents/primes/buy.js).

### 5.1 Architecture
- **Authoritative Balance**: The backend stores the user's authoritative balance in Nigerian Naira (NGN).
- **Dynamic Conversion**: When switching display currency to USD:
  $$\text{USD Amount} = \frac{\text{NGN Balance}}{\text{Exchange Rate}}$$
  *(Example: ₦30,000 at ₦1,500/$1 = **$20.00**)*
- Switching back to NGN restores the original ₦30,000.00 balance with zero rounding loss or server data distortion.

### 5.2 Synchronized Platform Components
1. **Wallet Card**: Primary balance shows `$20.00` in USD mode; subtitle shows `USD Equivalent · (₦1,500 = $1.00)`.
2. **Transaction History**: Displays amounts converted to the active currency. Naira transactions are no longer filtered out when USD is selected.
3. **Referral Balance**: Dynamically converted to USD equivalent with `$` symbol when USD is active.
4. **Paystack Deposit Flow**: Deposit kobo calculations dynamically resolve against the active exchange rate.

---

## 6. Verification & Test Summary

| Test Suite | Pass Rate | Scope |
| :--- | :--- | :--- |
| **Order `1096105450` Trace** | **100%** | Live API returned HTTP 200, validated phone `+12089374346`, status `TIMEOUT`, `sms: []`. |
| **OTP & SMS Parser Suite** | **15 / 15 Passed** | Validated labeled codes, leading codes, year avoidance, and multi-shape payloads. |
| **E2E Platform Audit Suite** | **18 / 18 Passed** | Dual-currency normalization, pre-purchase balance sufficiency, live endpoints, and balance caching. |
| **JavaScript Syntax Check** | **0 Errors** | `node --check buy.js api.js script.js` executed cleanly. |

---
*Document prepared for export to Google Drive / Google Docs.*
