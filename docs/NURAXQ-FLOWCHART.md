# NuraXQ System Architecture & Technical Flowchart Documentation

> **Role & Perspective:** Senior Software Architect & Full-Stack Systems Analyst  
> **Target Project:** NuraXQ Virtual Number & SMS Platform  
> **Document Status:** Complete Architecture Analysis & Verified Implementation Reference  
> **Specification Version:** 1.0.0  

---

## 1. Executive Summary & Project Overview

**NuraXQ** is a multi-tier web platform engineered for real-time virtual phone number provisioning, SMS/OTP verification, user wallet accounting, referral commission attribution, and administrative control.

The system connects end-users to upstream SMS aggregators (such as 5sim / Nura SQ upstream gateways) while abstracting provider pricing through localized Nigerian Naira (NGN) and US Dollar (USD) currency models, dynamic exchange rate conversions, and automated escrow balance management.

### Technology Stack Summary

| Layer | Technologies & Libraries |
| :--- | :--- |
| **Frontend Client** | HTML5, CSS3 (Modern Dark Theme, Glassmorphism), Vanilla ES6+ JavaScript, FontAwesome 6, Google Fonts (Plus Jakarta Sans, JetBrains Mono, Syne). |
| **Client Utilities** | `api.js` (Centralized Fetch Client, Token Storage, Fallback Handlers), `brand-logo.js` (Centralized SVG Branding), Web Audio API (Chime Synthesizer). |
| **Backend Runtime** | Node.js (v18+) with Express.js REST application server (`server.js`). |
| **Data Persistence** | **Triple-tier Adaptive Storage Engine** (`db.js`):<br>1. **PostgreSQL** via `pg.Pool` with auto-migration schema routines.<br>2. **MongoDB** via `mongoose.Schema` connection fallback.<br>3. **In-Memory Store** for development and zero-dependency deployments. |
| **Payment Gateway** | Paystack Standard API: Inline Popup Checkout (`PaystackPop.setup`) & Dedicated Virtual Bank Accounts (`/api/create-virtual-account`). |
| **SMS Aggregator Proxy** | Upstream REST API client (`fivesim.js`) proxying requests to upstream endpoints (`https://nuraxq.com/api` / `https://api.nuraxq.com/api`). |
| **External Push** | WebPushr Browser Push Notification integration snippet. |

---

## 2. High-Level System Architecture

The following diagram illustrates how external users, client frontend single-page interfaces, backend controllers, databases, payment gateways, and third-party SMS providers interact.

```mermaid
flowchart TB
    subgraph ClientLayer ["Frontend Client Layer (Browser)"]
        UI_Guest["Public Pages\n(index.html, login.html, signup.html)"]
        UI_User["Customer Dashboard & Workspaces\n(dashboard.html, buy.html, numbers.html,\ntransactions.html, accounts.html)"]
        UI_Admin["Administration Console\n(admin.html)"]
        ClientAPI["Client Core Module\n(api.js + script.js + buy.js)"]
        WebAudio["Synthesized Audio Engine\n(Web Audio API - OTP Arrival Alert)"]
    end

    subgraph ServerLayer ["Express.js Application Server (server.js)"]
        Router_Auth["/api/auth & Root Aliases\n(Customer Auth & Session Check)"]
        Router_Admin["/api/admin\n(Admin Auth, Stats, User/Wallet Control)"]
        Router_Ref["/api/referrals\n(Code Generation, Validation, Stats)"]
        Router_Notif["/api/notifications\n(In-App Notification Feed)"]
        Router_Proxy["/api & /guest Proxy Endpoints\n(Upstream SMS Gateway Relay)"]
        Config_Route["/config.js\n(Dynamic Runtime Config Delivery)"]
    end

    subgraph PersistenceLayer ["Adaptive Multi-Driver Database (db.js)"]
        PG[("PostgreSQL Database\n(pg.Pool Tables)")]
        Mongo[("MongoDB Database\n(Mongoose Models)")]
        MemoryCache[("In-Memory State Store\n(Fallback Collections)")]
    end

    subgraph ExternalServices ["External Systems & Third-Party APIs"]
        PaystackAPI["Paystack Payment Gateway\n(Inline Modal & Dedicated Accounts)"]
        UpstreamSMS["Upstream SMS Gateway\n(5sim / Nura SQ Provider)"]
        WebPushr["WebPushr Push Service\n(Browser Web Push Engine)"]
    end

    UI_Guest -->|HTTP Requests| Router_Auth
    UI_User -->|AJAX via api.js| ClientAPI
    UI_Admin -->|AJAX with Admin Token| Router_Admin

    ClientAPI -->|REST API Calls| Router_Auth
    ClientAPI -->|REST API Calls| Router_Ref
    ClientAPI -->|REST API Calls| Router_Notif
    ClientAPI -->|REST API Calls| Router_Proxy
    ClientAPI -.->|Trigger Synthesizer| WebAudio

    Router_Auth --> PersistenceLayer
    Router_Admin --> PersistenceLayer
    Router_Ref --> PersistenceLayer
    Router_Notif --> PersistenceLayer

    Router_Proxy -->|Axios REST| UpstreamSMS
    ClientAPI -->|Inline Checkout & Virtual Acct| PaystackAPI
    ServerLayer -.->|Push Notifications| WebPushr
```

---

## 3. End-to-End Core System Flow

This flowchart documents the unified user journey: from authentication to wallet recharge, country/operator browsing, virtual number purchase, active OTP polling, and administrative settlement.

```mermaid
flowchart TD
    Start([User Visits NuraXQ]) --> AuthCheck{Has Active JWT?}
    
    AuthCheck -- No --> AuthChoice{Action?}
    AuthChoice -- Signup --> SignupFlow["Submit Name, Email, Password,\nOptional Referral Code"]
    AuthChoice -- Login --> LoginFlow["Submit Credentials to /api/auth/login"]
    
    SignupFlow --> ValidateSignup["Backend hashes password,\nrecords user & attributes referral"]
    LoginFlow --> ValidateLogin["Backend validates hash,\nissues 7-day JWT token"]
    
    ValidateSignup --> IssueToken["Token saved in localStorage (token/auth_token)"]
    ValidateLogin --> IssueToken
    IssueToken --> AuthCheck
    
    AuthCheck -- Yes --> Dashboard["Load Dashboard (dashboard.html)\nFetch /api/me & Wallet Balance"]
    
    Dashboard --> ActionBranch{User Action}
    
    %% Fund Wallet Branch
    ActionBranch -- "Fund Wallet" --> FundMethod{Choose Funding Method}
    FundMethod -- "Dedicated Bank Account" --> ShowVirtualAccount["Display Dedicated Wema/Titan/Rolex\nAccount Number from /api/get-virtual-account"]
    FundMethod -- "Instant Paystack Popup" --> OpenPaystackModal["PaystackPop.setup with\nAmount in Kobo (NGN * 100)"]
    OpenPaystackModal --> PaySuccess["Payment Successful via Card/USSD/Transfer"]
    PaySuccess --> BackendCredit["Backend credits user balance,\nlogs transaction, fires 10% referral reward"]
    ShowVirtualAccount --> BankTransfer["User completes bank transfer\ncredited via Paystack Webhook"]
    
    %% Buy Virtual Number Branch
    ActionBranch -- "Buy Virtual Number" --> OpenBuy["Open Buy Workspace (buy.html)"]
    OpenBuy --> FetchCountries["Fetch countries & services from /api/countries"]
    FetchCountries --> SelectService["Select Target Country & Service (e.g. WhatsApp, Telegram)"]
    SelectService --> FetchOperators["Query /guest/products/:country/:operator\nCalculate prices & success rates"]
    FetchOperators --> ConfirmBuy["User Selects Operator & clicks Purchase"]
    
    ConfirmBuy --> BalanceCheck{Wallet Balance >= Price?}
    BalanceCheck -- No --> PromptDeposit["Show Insufficient Balance Warning\nPrompt Wallet Recharge"]
    BalanceCheck -- Yes --> UpstreamOrder["Call /user/buy/activation\nUpstream reserves number"]
    
    UpstreamOrder --> DeductWallet["Backend deducts purchase cost\nStores Order ID in localStorage"]
    DeductWallet --> ActiveOrderView["Display Number, Timer (300s), Waiting for SMS"]
    
    %% Polling Loop
    ActiveOrderView --> PollLoop["Poll /user/check/:id every 2.5s - 3.0s"]
    PollLoop --> StatusCheck{Status Code?}
    StatusCheck -- "WAITING (0)" --> CheckTimeOut{Timer Expired?}
    CheckTimeOut -- No --> PollLoop
    CheckTimeOut -- Yes --> AutoCancel["Auto-cancel / timeout order"]
    
    StatusCheck -- "RECEIVED (1)" --> ShowOTP["Extract SMS & OTP Code\nPlay Alert Chime (Web Audio)\nRender Copy Button"]
    ShowOTP --> FinishOrder["User marks Finished (/user/finish/:id)"]
    
    StatusCheck -- "CANCELLED / BANNED" --> RefundWallet["Refund balance back to customer wallet\nUpdate order status to CANCELLED"]
    
    FinishOrder --> EndSuccess([Order Completed Successfully])
    RefundWallet --> EndFail([Order Cancelled / Refunded])
```

---

## 4. User Registration, Authentication & Session Lifecycle

NuraXQ relies on JSON Web Tokens (JWT) signed with `JWT_SECRET` (defaulting to a system fallback when unconfigured). The client library (`api.js`) automatically synchronizes authorization state across tabs using `localStorage`.

```mermaid
sequenceDiagram
    autonumber
    actor User as Client Browser
    participant API as Frontend Controller (api.js)
    participant AuthRoute as Express Auth Router (/api/auth)
    participant DB as Adaptive Database (db.js)

    %% Registration
    rect rgb(26, 31, 56)
    note right of User: Registration Flow
    User->>API: Enter Full Name, Email, Password, Referral Code
    API->>AuthRoute: POST /api/auth/signup {name, email, password, referralCode}
    AuthRoute->>DB: findUserByEmail(email)
    alt Email already registered
        DB-->>AuthRoute: Existing User Object
        AuthRoute-->>API: 400 Bad Request ("Email already registered")
        API-->>User: Display error message
    else Email is new
        AuthRoute->>AuthRoute: Hash password (bcrypt or PBKDF2 fallback)
        AuthRoute->>DB: createUser({id, name, email, password_hash, referral_code})
        opt Referral Code Provided
            AuthRoute->>DB: recordReferral(referrerUser.id, newUser.id)
        end
        AuthRoute->>AuthRoute: jwt.sign({id, email, name}, JWT_SECRET, {expiresIn: '7d'})
        AuthRoute-->>API: 201 Created {token, user}
        API->>API: localStorage.setItem('token', token)
        API-->>User: Redirect to dashboard.html
    end
    end

    %% Login
    rect rgb(31, 38, 70)
    note right of User: Login & Guard Flow
    User->>API: Enter Email & Password
    API->>AuthRoute: POST /api/auth/login {email, password}
    AuthRoute->>DB: findUserByEmail(email)
    AuthRoute->>AuthRoute: Verify password hash
    AuthRoute->>DB: logLogin(userId, ip, userAgent)
    AuthRoute->>AuthRoute: jwt.sign(userPayload, JWT_SECRET, {expiresIn: '7d'})
    AuthRoute-->>API: 200 OK {token, user}
    API->>API: localStorage.setItem('token', token)
    API-->>User: Redirect to dashboard.html
    end

    %% Session Validation
    rect rgb(40, 24, 60)
    note right of User: Protected Route Verification
    User->>API: Page Load (e.g., dashboard.html)
    API->>AuthRoute: GET /api/auth/me (Header: Bearer <token>)
    alt Token Valid
        AuthRoute->>DB: findUserById(decoded.id)
        AuthRoute-->>API: 200 OK {user: {id, name, email, balance, referral_balance}}
        API-->>User: Populate DOM elements with user profile & balance
    else Token Expired or Invalid
        AuthRoute-->>API: 401 Unauthorized
        API->>API: localStorage.removeItem('token')
        API-->>User: Force redirect to login.html?redirect=current_page
    end
    end
```

---

## 5. Wallet Funding & Payment Processing Architecture

The platform supports two wallet deposit mechanisms powered by Paystack:
1. **Paystack Inline Modal Popup**: Real-time deposit using debit cards, USSD, Apple Pay, or bank transfers.
2. **Dedicated Virtual Accounts**: Dedicated accounts (Wema Bank / Titan Trust Bank) dynamically generated per customer.

```mermaid
flowchart TD
    subgraph DepositTrigger ["Deposit Initiation"]
        UserDeposit["User clicks 'Deposit' on Dashboard / Modal"]
        UserDeposit --> ChooseType{Deposit Pathway}
    end

    subgraph PaystackInlineFlow ["Pathway A: Instant Paystack Popup Checkout"]
        ChooseType -- "Instant Card / USSD / Transfer" --> InputAmount["Enter Deposit Amount in NGN (min ₦100)"]
        InputAmount --> CalcAmount["Convert NGN to Kobo: AmountKobo = NGN * 100"]
        CalcAmount --> InitPopup["Call PaystackPop.setup({\n  key: PAYSTACK_PUBLIC_KEY,\n  email: user.email,\n  amount: AmountKobo,\n  currency: 'NGN',\n  callback: onPaystackSuccess\n})"]
        InitPopup --> UserCompletesPayment["User completes checkout in Paystack iframe"]
        
        UserCompletesPayment --> OnSuccessCallback["Paystack calls client callback(response) with reference"]
        OnSuccessCallback --> PostVerify["POST /api/verify-payment or /api/wallet/credit\nPayload: {reference, amount, trxref}"]
        PostVerify --> BackendValidate["Backend validates transaction status with Paystack API"]
    end

    subgraph DedicatedAccountFlow ["Pathway B: Dedicated Virtual Bank Account"]
        ChooseType -- "Dedicated Virtual Account" --> FetchAcct["GET /api/get-virtual-account"]
        FetchAcct --> HasAcct{Account Exists?}
        HasAcct -- Yes --> RenderAcct["Display Account Name, Number & Bank\n(e.g., Titan Trust / Wema Bank)"]
        HasAcct -- No --> CreateAcct["POST /api/create-virtual-account\nPaystack Dedicated NUBAN API"]
        CreateAcct --> SaveAcct["Persist Virtual Account details in database"]
        SaveAcct --> RenderAcct
        RenderAcct --> UserBankTransfer["Customer transfers funds from standard mobile banking app"]
        UserBankTransfer --> PaystackWebhook["Paystack sends HTTP POST Webhook\nevent: charge.success"]
    end

    subgraph LedgerExecution ["Balance Update & Commission Engine"]
        BackendValidate --> ExecLedger["Atomic Database Transaction:\n1. users.balance = users.balance + depositAmount\n2. Insert into transactions table (type: 'deposit', status: 'completed')"]
        PaystackWebhook --> ExecLedger
        
        ExecLedger --> RefCheck{Was user referred?}
        RefCheck -- Yes --> AwardReferral["Calculate 10% bonus of recharge amount\nCredit referrer's referral_balance\nLog notification for referrer"]
        RefCheck -- No --> NotifyUser["Notify User: 'Wallet recharge of ₦X successful'"]
        AwardReferral --> NotifyUser
        NotifyUser --> ClientRefresh["Client updates displayed balance in DOM\nDispatches primes_notification_updated"]
    end
```

---

## 6. Virtual Number Purchase & SMS Activation Lifecycle

This lifecycle represents the core business logic of NuraXQ: selecting numbers, checking operator inventory, debiting customer wallets, and real-time polling for incoming SMS text messages.

```mermaid
stateDiagram-v2
    [*] --> SelectingCountryService: Browse /buy.html
    SelectingCountryService --> FetchingOperators: Country & Service Picked
    FetchingOperators --> SelectingOperator: Display Operators & Success Rates
    
    SelectingOperator --> PrePurchaseCheck: Click "Buy Activation"
    
    state PrePurchaseCheck {
        [*] --> CheckAuth
        CheckAuth --> CheckWallet: User Authenticated
        CheckWallet --> CheckPrice: Balance >= Order Price
        CheckPrice --> [*]: Validation Passed
    }
    
    PrePurchaseCheck --> InsufficientFunds: Balance < Order Price
    InsufficientFunds --> [*]: Show Warning & Top-up Modal
    
    PrePurchaseCheck --> CallingUpstreamBuy: Balance Sufficient
    
    CallingUpstreamBuy --> OrderCreated: Upstream API returns Number & Order ID
    CallingUpstreamBuy --> OrderFailed: No stock / Provider Error
    OrderFailed --> [*]: Display Error Alert
    
    state OrderActive {
        [*] --> TimerRunning: Start 300s Countdown
        TimerRunning --> PollingAPI: Interval (2500ms - 3000ms)
        
        state PollingAPI {
            [*] --> QueryStatus: GET /user/check/:id
            QueryStatus --> WaitingSMS: Status == WAITING
            QueryStatus --> SMSArrived: Status == RECEIVED
            QueryStatus --> ProviderCancelled: Status == CANCELLED / TIMEOUT
        }
    }
    
    OrderCreated --> OrderActive: Save to localStorage (primes_active_orders)
    
    SMSArrived --> DisplayOTP: Parse SMS text & Extract OTP Code
    DisplayOTP --> PlaySoundAlert: Synthesize Web Audio Chime
    DisplayOTP --> FinishingOrder: User clicks "Done" / Finish
    
    FinishingOrder --> UpstreamFinish: POST /user/finish/:id
    UpstreamFinish --> Completed: Status -> COMPLETED
    
    ProviderCancelled --> UpstreamCancel: Status CANCELLED or Timer Reached
    TimerRunning --> UpstreamCancel: User clicks "Cancel Number"
    UpstreamCancel --> RefundWallet: POST /user/cancel/:id -> Refund Wallet Balance
    
    Completed --> [*]
    RefundWallet --> [*]
```

---

## 7. Referral System Architecture & Commission Distribution

NuraXQ incorporates a viral referral engine designed to award active referrers a **10% instant commission** on all recharges executed by invited peers.

```mermaid
flowchart LR
    subgraph ReferrerSide ["Referrer Flow"]
        RefUser["User Logs In"] --> GenCode["Backend assigns or computes\nReferral Code (e.g. NXQ-JOHN-7B2A)"]
        GenCode --> ShareLink["Share Link:\nhttps://nuraxq.com/signup.html?ref=NXQ-JOHN-7B2A"]
        ShareLink --> ViewStats["View Referral Dashboard:\n- Total Invited Users\n- Total Earnings (₦)\n- Masked Referral List (j***@gmail.com)"]
    end

    subgraph RefereeSide ["Referred User Flow"]
        VisitLink["Referee opens link\nref parameter stored in sessionStorage"] --> SubmitSignup["Referee signs up on signup.html"]
        SubmitSignup --> BackendLink["Backend associates referral:\nINSERT INTO referrals (referrer_id, referred_id)"]
    end

    subgraph RechargeTrigger ["Commission Execution Trigger"]
        RefereeRecharge["Referee funds wallet with ₦10,000 via Paystack"] --> TriggerHook["Backend detects user has referrer_id"]
        TriggerHook --> CalculateCommission["Commission = ₦10,000 * 10% = ₦1,000"]
        CalculateCommission --> CreditReferrer["UPDATE users SET referral_balance = referral_balance + 1000\nWHERE id = referrer_id"]
        CreditReferrer --> LogReferralTx["INSERT INTO transactions\n(type: 'referral_bonus', amount: 1000)"]
        CreditReferrer --> PushAlert["Send in-app notification to Referrer:\n'You earned ₦1,000 from referral recharge!'"]
    end

    ShareLink -.-> VisitLink
    BackendLink -.-> RefereeRecharge
```

---

## 8. Administration Dashboard & Platform Governance

The admin portal (`admin.html` and `routes/admin.js`) allows administrators to monitor financial turnover, manage accounts, freeze suspicious wallets, and issue global announcements.

```mermaid
flowchart TD
    AdminUser([Platform Administrator]) --> AdminLoginCheck{Authenticated?}
    
    AdminLoginCheck -- No --> AdminAuthChoice{Action}
    AdminAuthChoice -- "First Time Setup" --> AdminRegister["POST /api/admin/auth/register\nRequires valid ADMIN_SETUP_KEY"]
    AdminAuthChoice -- "Existing Admin" --> AdminLogin["POST /api/admin/auth/login\nReturns Admin JWT Token"]
    
    AdminRegister --> IssueAdminToken["Token stored in admin_token"]
    AdminLogin --> IssueAdminToken
    IssueAdminToken --> AdminDashboard["Admin Console (admin.html)"]
    
    AdminDashboard --> AdminPanels{Management Operations}
    
    AdminPanels -- "System Metrics" --> GetStats["GET /api/admin/dashboard/stats\n- Total Registered Users\n- Total Platform Deposits\n- Active Numbers Count\n- Aggregate Wallet Liabilities"]
    
    AdminPanels -- "User Management" --> GetUsers["GET /api/admin/users\nSearch, Inspect User Details, View Registration Date"]
    GetUsers --> SuspendAction["POST /api/admin/users/:id/suspend\nPOST /api/admin/users/:id/unsuspend"]
    
    AdminPanels -- "Wallet Governance" --> GetWallets["GET /api/admin/wallets"]
    GetWallets --> WalletActions{Action}
    WalletActions -- "Manual Credit" --> CreditUser["POST /api/admin/wallets/:userId/credit"]
    WalletActions -- "Manual Debit" --> DebitUser["POST /api/admin/wallets/:userId/debit"]
    WalletActions -- "Freeze / Hold" --> FreezeUser["POST /api/admin/wallets/:userId/freeze"]
    WalletActions -- "Unfreeze" --> UnfreezeUser["POST /api/admin/wallets/:userId/unfreeze"]
    
    AdminPanels -- "Transaction Ledger" --> GetTransactions["GET /api/admin/transactions\nFilter by status: Completed, Pending, Failed"]
    
    AdminPanels -- "Global Broadcast" --> PostAnnouncement["POST /api/admin/announcements\nSets system banner delivered via /config.js"]
```

---

## 9. Client-Server API Communication Protocol

All client requests are marshaled through the centralized `apiRequest` utility in `api.js`. This module injects authorization headers, enforces a 25-second timeout controller, and handles token expiration redirects.

```mermaid
sequenceDiagram
    autonumber
    participant UI as Page Component (e.g., buy.js)
    participant ClientAPI as apiRequest Helper (api.js)
    participant Abort as AbortController (25s Timeout)
    participant Server as Express Server (server.js)

    UI->>ClientAPI: apiRequest('/api/buy/activation', 'POST', payload)
    ClientAPI->>ClientAPI: Check localStorage for 'token' or 'auth_token'
    ClientAPI->>Abort: Start timeout watchdog (25,000ms)
    ClientAPI->>Server: fetch(url, { headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, signal })
    
    alt Server responds within 25 seconds
        alt HTTP 200 / 201 Success
            Server-->>ClientAPI: JSON Response { success: true, data: {...} }
            ClientAPI->>Abort: Clear timeout timer
            ClientAPI-->>UI: Return parsed JSON
        else HTTP 401 Unauthorized
            Server-->>ClientAPI: 401 { error: "Session expired or token invalid" }
            ClientAPI->>ClientAPI: localStorage.removeItem('token')
            ClientAPI-->>UI: Redirect to login.html?redirect=current_page
        else HTTP 400 / 500 Error
            Server-->>ClientAPI: Error JSON { error: "Insufficient funds" }
            ClientAPI-->>UI: Throw Error(response.error)
        end
    else Request exceeds 25 seconds
        Abort-->>ClientAPI: AbortSignal triggered (AbortError)
        ClientAPI-->>UI: Throw Error("Request timed out after 25s")
    end
```

---

## 10. Data Model & Entity Relationship Diagram

The underlying data model in `db.js` defines the core entities, their relations, and key constraints across PostgreSQL and MongoDB implementations.

```mermaid
erDiagram
    USERS ||--o{ TRANSACTIONS : executes
    USERS ||--o{ VIRTUAL_ACCOUNTS : owns
    USERS ||--o{ NOTIFICATIONS : receives
    USERS ||--o{ LOGIN_LOGS : records
    USERS ||--o{ REFERRALS : "refers (as referrer)"
    USERS ||--o{ REFERRALS : "joined (as referred)"
    
    USERS {
        string id PK
        string name
        string email UK
        string password_hash
        numeric balance "Default: 0.00"
        numeric referral_balance "Default: 0.00"
        string referral_code UK
        string role "user | admin"
        boolean is_frozen "Default: false"
        boolean is_suspended "Default: false"
        timestamp created_at
    }

    REFERRALS {
        string id PK
        string referrer_id FK
        string referred_id FK
        numeric bonus_amount
        string status "active | paid"
        timestamp created_at
    }

    TRANSACTIONS {
        string id PK
        string user_id FK
        string type "deposit | purchase | refund | referral_bonus"
        numeric amount
        string currency "NGN | USD"
        string status "completed | pending | failed"
        string reference UK
        string description
        timestamp created_at
    }

    VIRTUAL_ACCOUNTS {
        string id PK
        string user_id FK
        string account_number
        string account_name
        string bank_name
        string customer_code
        timestamp created_at
    }

    NOTIFICATIONS {
        string id PK
        string user_id FK
        string title
        string message
        boolean is_read "Default: false"
        timestamp created_at
    }

    LOGIN_LOGS {
        string id PK
        string user_id FK
        string ip_address
        string user_agent
        timestamp created_at
    }
```

---

## 11. System Architecture Analysis & Engineering Recommendations

### A. Architectural Strengths
1. **Resilient Data Layer**: The database abstraction in `db.js` provides automatic fallback from PostgreSQL to MongoDB to In-Memory storage, allowing the server to boot under any infrastructure configuration.
2. **Centralized Frontend Client**: `api.js` centralizes token persistence, timeout limits, currency conversions, and API routing, minimizing code duplication across the UI pages.
3. **Double Redundancy in SMS Order Management**: Active numbers are persisted in `localStorage` (`primes_active_orders`), allowing orders to survive accidental browser reloads or tab closures without losing OTP timers.
4. **Instant Commission Engine**: Referrals are linked upon registration and rewarded automatically during recharges without requiring manual administrative processing.

### B. Identified Gaps & Production Recommendations

| Component | Current Implementation Observation | Recommended Architectural Hardening |
| :--- | :--- | :--- |
| **Payment Verification** | Client sends transaction reference to `/api/verify-payment` after Paystack popup callback. | Rely strictly on **Server-to-Server Paystack Webhooks** with cryptographic signature verification (`x-paystack-signature` HMAC SHA512) before balance credit to avoid client-side spoofing. |
| **System Announcements** | Announcements in `routes/admin.js` are held in process memory (`announcementState`). | Persist announcements to PostgreSQL / MongoDB table so they survive server restarts across clustered instances. |
| **Active Order Ledger** | Active orders and timer states rely primarily on browser `localStorage`. | Persist order records (`order_id`, `phone_number`, `expires_at`, `status`) in a database `orders` table to allow multi-device session continuity. |
| **Rate Limiting** | General endpoints do not currently enforce strict IP/user rate limiting. | Mount `express-rate-limit` on `/api/auth/login`, `/api/auth/signup`, and upstream proxy endpoints (`/api/buy/activation`) to mitigate brute-force and scraping attempts. |
| **Webhook Idempotency** | Webhook verification checks existing references in `transactions`. | Ensure strict database unique constraint on `transactions.reference` to guarantee zero double-crediting under network retries. |

---

*This document was generated through static analysis of the NuraXQ codebase (`server.js`, `db.js`, `routes/`, `fivesim.js`, `api.js`, `script.js`, `buy.js`, `admin.js`).*
