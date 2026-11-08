/* ══════════════════════════════════════════════════════════════════════
   transactions.js — NuraXQ Dedicated Transactions Controller
   Integrates with api.js (getTransactions, getWalletBalance)
   ══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Ensure user is authenticated
  if (typeof requireAuth === 'function') {
    if (!requireAuth()) return;
  }

  let currentPage = 1;
  const pageSize = 20;
  let allTransactions = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let activeCurrency = 'NGN';
  let exchangeRate = 1500;
  let isFetching = false;

  // Initialize DOM on ready
  document.addEventListener('DOMContentLoaded', initTransactionsPage);

  async function initTransactionsPage() {
    // 1. Theme and Profile UI
    if (typeof restoreTheme === 'function') restoreTheme();
    if (typeof updateProfileUI === 'function') updateProfileUI();

    // 2. Determine initial currency
    activeCurrency = (typeof getCurrency === 'function' ? getCurrency() : localStorage.getItem('primes_currency')) || 'NGN';
    exchangeRate = (typeof getExchangeRate === 'function' ? getExchangeRate() : 1500);

    // 3. Setup event listeners
    setupHeaderListeners();
    setupFilterListeners();
    setupSearchListeners();
    setupPaginationListeners();

    // 4. Initial live data fetch
    await fetchLiveHeaderBalance();
    if (typeof getUserOrders === 'function') {
      try {
        const remOrders = await getUserOrders();
        if (Array.isArray(remOrders) && remOrders.length > 0) {
          let loc = JSON.parse(localStorage.getItem('primes_orders') || '[]');
          if (!Array.isArray(loc)) loc = [];
          remOrders.forEach(ro => {
            const rId = String(ro.orderId || ro.id);
            const idx = loc.findIndex(o => String(o.orderId || o.id) === rId);
            if (idx !== -1) loc[idx] = { ...loc[idx], ...ro };
            else loc.push(ro);
          });
          localStorage.setItem('primes_orders', JSON.stringify(loc));
          localStorage.setItem('primes_total_numbers', String(loc.length));
        }
      } catch (_) {}
    }
    await fetchTransactions(1);
  }

  /* ══════════════════════════════════════════
     HEADER & WALLET BALANCE
     ══════════════════════════════════════════ */
  async function fetchLiveHeaderBalance() {
    const balEl = document.getElementById('headerWalletBalanceAmount');
    if (!balEl) return;

    try {
      if (typeof getWalletBalance === 'function') {
        const res = await getWalletBalance(activeCurrency);
        const data = res?.data || res || {};
        const rawBal = Number(data.balance ?? data.walletBalance ?? 0);
        const sym = activeCurrency === 'USD' ? '$' : '₦';
        const formatted = sym + ' ' + rawBal.toLocaleString(activeCurrency === 'USD' ? 'en-US' : 'en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
        balEl.textContent = formatted;
        localStorage.setItem('_walletBalance_' + activeCurrency, String(rawBal));
      }
    } catch (err) {
      // Reset to unavailable state
      balEl.textContent = sym + ' 0.00';
    }
  }

  function setupHeaderListeners() {
    // Sidebar Mobile Toggle
    const toggleBtn = document.getElementById('toggle-btn');
    const aside = document.getElementById('aside');
    const backdrop = document.getElementById('sidebarBackdrop');

    if (toggleBtn && aside) {
      toggleBtn.addEventListener('click', () => {
        aside.classList.toggle('active');
        if (backdrop) backdrop.classList.toggle('active');
        document.body.classList.toggle('sidebar-expanded');
      });
    }

    if (backdrop && aside) {
      backdrop.addEventListener('click', () => {
        aside.classList.remove('active');
        backdrop.classList.remove('active');
        document.body.classList.remove('sidebar-expanded');
      });
    }

    // Refresh Button in heading
    const refreshBtn = document.getElementById('txRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('spinning');
        await fetchLiveHeaderBalance();
        await fetchTransactions(currentPage);
        setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
      });
    }
  }

  /* ══════════════════════════════════════════
     SEARCH & FILTERS
     ══════════════════════════════════════════ */
  function setupSearchListeners() {
    const input = document.getElementById('txSearchInput');
    const clearBtn = document.getElementById('txSearchClear');

    if (input) {
      input.addEventListener('input', () => {
        searchQuery = input.value.trim().toLowerCase();
        if (clearBtn) {
          clearBtn.style.display = searchQuery ? 'block' : 'none';
        }
        applyFiltersAndRender();
      });
    }

    if (clearBtn && input) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        searchQuery = '';
        clearBtn.style.display = 'none';
        input.focus();
        applyFiltersAndRender();
      });
    }
  }

  function setupFilterListeners() {
    const filterBtns = document.querySelectorAll('.tn-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.getAttribute('data-filter') || 'all';
        applyFiltersAndRender();
      });
    });
  }

  function setupPaginationListeners() {
    const prevBtn = document.getElementById('txPrevBtn');
    const nextBtn = document.getElementById('txNextBtn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          fetchTransactions(currentPage - 1);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        fetchTransactions(currentPage + 1);
      });
    }
  }

  /* ══════════════════════════════════════════
     TRANSACTION CLASSIFICATION & MAPPING
     ══════════════════════════════════════════ */
  function getNormalizedType(tx) {
    const rawType = String(tx.type || tx.transactionType || tx.action || '').toLowerCase().trim();
    const reason  = String(tx.reason || tx.description || tx.memo || '').toLowerCase().trim();
    const ref     = String(tx.reference || tx.ref || '').toLowerCase().trim();

    // Auto refund & refund
    if (rawType.includes('auto_refund') || rawType.includes('auto-refund') || reason.includes('auto refund') || ref.includes('autorefund')) {
      return 'auto_refund';
    }
    if (rawType.includes('refund') || reason.includes('refund') || ref.includes('refund')) {
      return 'refund';
    }

    // Purchase / Activation / Debit
    if (rawType === 'purchase' || rawType === 'debit' || rawType === 'activation' || reason.includes('purchase') || reason.includes('activation') || ref.startsWith('buy-')) {
      return 'purchase';
    }

    // Withdrawal
    if (rawType.includes('withdraw') || reason.includes('withdraw') || ref.includes('wth-')) {
      return 'withdrawal';
    }

    // Deposit / Credit
    if (rawType === 'deposit' || rawType === 'credit' || rawType === 'funding' || reason.includes('deposit') || reason.includes('funding') || reason.includes('paystack') || ref.startsWith('dep-')) {
      return 'credit';
    }

    // Amount sign fallback
    const num = parseFloat(tx.amount) || 0;
    return num < 0 ? 'purchase' : 'credit';
  }

  /* ══════════════════════════════════════════
     FETCH TRANSACTIONS FROM BACKEND
     ══════════════════════════════════════════ */
  async function fetchTransactions(page = 1) {
    if (isFetching) return;
    isFetching = true;

    const tbody = document.getElementById('txTableBody');
    const paginBar = document.getElementById('txPagination');
    const prevBtn = document.getElementById('txPrevBtn');
    const nextBtn = document.getElementById('txNextBtn');
    const pageLabel = document.getElementById('txPageLabel');

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="tn-state-box">
            <div class="tn-state-icon"><i class="ph ph-circle-notch tn-spin"></i></div>
            <h4 class="tn-state-title">Loading transactions...</h4>
            <p class="tn-state-desc">Retrieving your recent payment and number purchase history.</p>
          </td>
        </tr>
      `;
    }

    try {
      let data = null;
      if (typeof getTransactions === 'function') {
        data = await getTransactions(page, pageSize, activeCurrency);
      } else {
        const token = localStorage.getItem('primes_token') || localStorage.getItem('accessToken');
        const txUrl = typeof buildApiUrl === 'function' ? buildApiUrl(`/get-transactions?page=${page}&limit=${pageSize}&currency=${activeCurrency}`) : `${window.API_BASE_URL || (window.ENV && window.ENV.API_BASE_URL) || ''}/get-transactions?page=${page}&limit=${pageSize}&currency=${activeCurrency}`;
        const res = await fetch(txUrl, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        data = await res.json();
      }

      let txs = Array.isArray(data?.transactions) ? data.transactions : (Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []));
      const pg = data?.pagination || {};

      allTransactions = txs;
      currentPage = page;

      // Update Pagination UI
      const totalRecords = pg.total ?? txs.length;
      const totalPages = pg.totalPages || (totalRecords ? Math.ceil(totalRecords / pageSize) : 1);

      if (paginBar) paginBar.style.display = 'flex';
      if (pageLabel) pageLabel.textContent = `Page ${currentPage} of ${Math.max(1, totalPages)}`;
      if (prevBtn) prevBtn.disabled = !(currentPage > 1);
      if (nextBtn) nextBtn.disabled = !(pg.hasNextPage || currentPage < totalPages);

      applyFiltersAndRender();
    } catch (err) {
      console.error('Error fetching transactions:', err);
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="tn-state-box">
              <div class="tn-state-icon" style="color:var(--tn-danger);"><i class="ph ph-warning-circle"></i></div>
              <h4 class="tn-state-title">Unable to load transactions</h4>
              <p class="tn-state-desc">Please verify your internet connection and try again.</p>
              <button type="button" class="tn-btn-primary" onclick="window.fetchTransactions(${page})" style="margin-top:8px;">
                <i class="ph ph-arrows-clockwise"></i> Retry
              </button>
            </td>
          </tr>
        `;
      }
    } finally {
      isFetching = false;
    }
  }

  // Expose global for retry
  window.fetchTransactions = fetchTransactions;

  /* ══════════════════════════════════════════
     APPLY FILTERS & RENDER TABLE
     ══════════════════════════════════════════ */
  function applyFiltersAndRender() {
    const tbody = document.getElementById('txTableBody');
    if (!tbody) return;

    const sym = activeCurrency === 'USD' ? '$' : '₦';
    const isUSD = activeCurrency === 'USD';

    // 1. Filter by category tab
    let filtered = allTransactions.filter(tx => {
      const type = getNormalizedType(tx);
      if (currentFilter === 'all') return true;
      if (currentFilter === 'purchase') {
        return type === 'purchase' || type === 'debit';
      }
      if (currentFilter === 'deposit') {
        return type === 'credit' || type === 'deposit' || type === 'refund' || type === 'auto_refund';
      }
      if (currentFilter === 'withdrawal') {
        return type === 'withdrawal';
      }
      return true;
    });

    let storedOrders = [];
    try {
      storedOrders = JSON.parse(localStorage.getItem('primes_orders') || '[]');
      if (!Array.isArray(storedOrders)) storedOrders = [];
    } catch (_) {}

    // Fallback if backend ledger has no purchases recorded yet but stored orders exist
    if (currentFilter === 'purchase' && filtered.length === 0 && storedOrders.length > 0) {
      filtered = storedOrders.map((o, i) => ({
        id: o.orderId || o.id || (i + 1),
        reference: `BUY-${o.orderId || o.id}`,
        amount: -(parseFloat(o.amountNGN || o.price || 0) || 0),
        currency: 'NGN',
        reason: `Virtual number for ${(o.service || o.product || 'SMS').toUpperCase()} (${(o.country || 'USA').toUpperCase()})`,
        type: 'purchase',
        status: ['FINISHED', 'COMPLETED', 'SUCCESS'].includes(String(o.status).toUpperCase()) ? 'success' : (['CANCELED', 'CANCELLED', 'BANNED', 'TIMEOUT', 'EXPIRED'].includes(String(o.status).toUpperCase()) ? 'failed' : 'pending'),
        createdAt: o.createdAt || new Date().toISOString(),
        orderData: o
      }));
    }

    // 2. Filter by search query
    if (searchQuery) {
      filtered = filtered.filter((tx, idx) => {
        const idStr = String(tx.id || tx.transactionId || tx._id || (idx + 1)).toLowerCase();
        const refStr = String(tx.reference || tx.ref || '').toLowerCase();
        const typeStr = String(tx.type || getNormalizedType(tx)).toLowerCase();
        const descStr = String(tx.reason || tx.description || tx.memo || '').toLowerCase();
        const amtStr = String(tx.amount || '').toLowerCase();
        const statusStr = String(tx.status || '').toLowerCase();

        return idStr.includes(searchQuery) ||
               refStr.includes(searchQuery) ||
               typeStr.includes(searchQuery) ||
               descStr.includes(searchQuery) ||
               amtStr.includes(searchQuery) ||
               statusStr.includes(searchQuery);
      });
    }

    // 3. Render Empty State if no matches
    if (filtered.length === 0) {
      let title = 'No transactions found';
      let desc = 'You have not made any transactions matching your filter.';
      if (currentFilter === 'purchase') {
        title = 'No number purchases';
        desc = 'Your purchased virtual numbers and activation fees will appear here.';
      } else if (currentFilter === 'deposit') {
        title = 'No deposit records';
        desc = 'Wallet top-ups and Paystack payments will appear here.';
      } else if (currentFilter === 'withdrawal') {
        title = 'No withdrawal records';
        desc = 'Payouts and balance withdrawals will appear here.';
      }

      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="tn-state-box">
            <div class="tn-state-icon"><i class="ph ph-receipt"></i></div>
            <h4 class="tn-state-title">${title}</h4>
            <p class="tn-state-desc">${desc}</p>
          </td>
        </tr>
      `;
      return;
    }

    // 4. Render Table Rows (Matching Image 1 reference)
    tbody.innerHTML = filtered.map((tx, idx) => {
      const displayId = (currentPage - 1) * pageSize + idx + 1;
      const rawType = getNormalizedType(tx);
      const isCredit = (rawType === 'credit' || rawType === 'deposit' || rawType === 'refund' || rawType === 'auto_refund');
      
      const rawAmount = Math.abs(parseFloat(tx.amount) || 0);
      const txCur = (tx.currency || 'NGN').toUpperCase();

      let displayAmount;
      if (isUSD) {
        displayAmount = (txCur === 'USD') ? rawAmount : (rawAmount / exchangeRate);
      } else {
        displayAmount = (txCur === 'USD') ? (rawAmount * exchangeRate) : rawAmount;
      }

      const formattedAmt = (isCredit ? '+' : '−') + sym + displayAmount.toLocaleString(isUSD ? 'en-US' : 'en-NG', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      // Type Badge Label
      let typeLabel = rawType;
      let typeClass = 'type-' + rawType;
      if (rawType === 'auto_refund') {
        typeLabel = 'auto_refund';
      } else if (rawType === 'credit') {
        typeLabel = 'Credit';
      } else if (rawType === 'refund') {
        typeLabel = 'refund';
      } else if (rawType === 'purchase') {
        typeLabel = 'Purchase';
      } else if (rawType === 'withdrawal') {
        typeLabel = 'Withdrawal';
      }

      // Date string
      const dateRaw = tx.createdAt || tx.created_at || tx.date;
      const dateStr = dateRaw ? new Date(dateRaw).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : '—';

      const status = String(tx.status || 'success').toLowerCase();
      const isSuccess = status === 'success' || status === 'completed';
      const isPending = status === 'pending';
      const statusClass = isSuccess ? 'status-success' : (isPending ? 'status-pending' : 'status-failed');
      const statusLabel = isSuccess ? 'Success' : (isPending ? 'Pending' : 'Failed');

      // Cross-reference purchase order for Phone number and SMS OTP code
      let matchedOrder = tx.orderData || null;
      if (!matchedOrder && tx.reference) {
        const cleanRef = String(tx.reference).replace(/^BUY-?/i, '').trim();
        matchedOrder = storedOrders.find(o => String(o.orderId || o.id) === cleanRef);
      }
      const phone = matchedOrder?.phone || tx.phone || null;
      const smsCode = matchedOrder?.smsCode || tx.smsCode || tx.code || null;

      return `
        <tr class="tn-tx-row" data-id="${tx.id || displayId}">
          <td class="col-id">${displayId}</td>
          <td>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <span class="tn-type-pill ${typeClass}">${typeLabel}</span>
                ${(phone && phone !== '—') ? `
                  <span style="font-family:monospace; font-size:12px; font-weight:700; color:var(--text);">${escapeHTML(phone)}</span>
                  <button type="button" class="btn-copy-mini" onclick="event.stopPropagation(); navigator.clipboard.writeText('${escapeHTML(phone)}');" title="Copy Number" style="background:none; border:none; color:inherit; cursor:pointer; padding:0 2px;"><i class="ph ph-copy"></i></button>
                ` : ''}
              </div>
              ${smsCode ? `
                <div style="display:inline-flex; align-items:center; gap:4px; font-size:11.5px; font-weight:800; color:var(--tn-success, #10b981);">
                  <i class="ph ph-shield-check"></i> Code: ${escapeHTML(smsCode)}
                  <button type="button" class="btn-copy-mini" onclick="event.stopPropagation(); navigator.clipboard.writeText('${escapeHTML(smsCode)}'); alert('Code copied: ${escapeHTML(smsCode)}');" title="Copy OTP" style="background:none; border:none; color:#10b981; cursor:pointer; padding:0 2px;"><i class="ph ph-copy"></i></button>
                </div>
              ` : (rawType === 'purchase' && !isSuccess ? `
                <span style="font-size:11px; color:var(--tn-text-muted);"><i class="ph ph-circle-notch tn-spin"></i> Waiting for SMS...</span>
              ` : '')}
            </div>
          </td>
          <td class="col-amount ${isCredit ? 'amount-credit' : 'amount-debit'}">${formattedAmt}</td>
          <td class="tn-hide-mobile" style="color:var(--tn-text-muted); font-size:13px;">${dateStr}</td>
          <td class="tn-hide-mobile">
            <span class="tn-status-pill ${statusClass}">${statusLabel}</span>
          </td>
        </tr>
      `;
    }).join('');
  }

})();
