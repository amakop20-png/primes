/* ══════════════════════════════════════════════════════════════════════
   numbers.js — NuraXQ My Numbers / Virtual Numbers Controller
   Integrates with api.js (getOrder, finishOrder, cancelOrder, getWalletBalance)
   ══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  if (typeof requireAuth === 'function') {
    if (!requireAuth()) return;
  }

  let allOrdersList = [];
  let currentStatusFilter = 'all';
  let searchQuery = '';
  let activeCurrency = 'NGN';
  let pollIntervalTimer = null;
  let isRefreshing = false;

  document.addEventListener('DOMContentLoaded', initNumbersPage);

  async function initNumbersPage() {
    if (typeof restoreTheme === 'function') restoreTheme();
    if (typeof updateProfileUI === 'function') updateProfileUI();

    activeCurrency = (typeof getCurrency === 'function' ? getCurrency() : localStorage.getItem('primes_currency')) || 'NGN';

    setupHeaderListeners();
    setupSearchAndFilters();

    await fetchLiveHeaderBalance();
    await loadAndVerifyOrders();

    // Start background polling for active pending orders
    startAutoPolling();
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
        balEl.textContent = sym + ' ' + rawBal.toLocaleString(activeCurrency === 'USD' ? 'en-US' : 'en-NG', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
        localStorage.setItem('_walletBalance_' + activeCurrency, String(rawBal));
      }
    } catch (_) {
      const cached = localStorage.getItem('_walletBalance_' + activeCurrency) || '0';
      const sym = activeCurrency === 'USD' ? '$' : '₦';
      balEl.textContent = sym + ' ' + Number(cached).toLocaleString(undefined, { minimumFractionDigits: 2 });
    }
  }

  function setupHeaderListeners() {
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

    const refreshBtn = document.getElementById('numbersRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.classList.add('spinning');
        await fetchLiveHeaderBalance();
        await loadAndVerifyOrders(true);
        setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
      });
    }
  }

  /* ══════════════════════════════════════════
     SEARCH & STATUS FILTER
     ══════════════════════════════════════════ */
  function setupSearchAndFilters() {
    const searchInput = document.getElementById('numbersSearchInput');
    const clearBtn = document.getElementById('numbersSearchClear');
    const statusSelect = document.getElementById('statusFilterSelect');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value.trim().toLowerCase();
        if (clearBtn) {
          clearBtn.style.display = searchQuery ? 'block' : 'none';
        }
        applyFiltersAndRender();
      });
    }

    if (clearBtn && searchInput) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        clearBtn.style.display = 'none';
        searchInput.focus();
        applyFiltersAndRender();
      });
    }

    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        currentStatusFilter = statusSelect.value || 'all';
        applyFiltersAndRender();
      });
    }
  }

  /* ══════════════════════════════════════════
     FLAG HELPER
     ══════════════════════════════════════════ */
  function getCountryFlag(countryKey) {
    if (!countryKey) return { emoji: '🌍', name: 'GLOBAL' };
    const key = String(countryKey).toLowerCase().trim();

    const isoMap = {
      usa: 'US', us: 'US', unitedstates: 'US', america: 'US',
      nigeria: 'NG', ng: 'NG',
      uk: 'GB', england: 'GB', unitedkingdom: 'GB',
      canada: 'CA', ca: 'CA',
      germany: 'DE', de: 'DE',
      france: 'FR', fr: 'FR',
      ghana: 'GH', gh: 'GH',
      kenya: 'KE', ke: 'KE',
      southafrica: 'ZA', za: 'ZA',
      netherlands: 'NL', nl: 'NL',
      brazil: 'BR', br: 'BR',
      india: 'IN', in: 'IN',
      china: 'CN', cn: 'CN',
      russia: 'RU', ru: 'RU',
      ukraine: 'UA', ua: 'UA',
      poland: 'PL', pl: 'PL',
      indonesia: 'ID', id: 'ID',
      philippines: 'PH', ph: 'PH',
      colombia: 'CO', co: 'CO'
    };

    const iso = (isoMap[key] || key.slice(0, 2)).toUpperCase();
    if (iso.length === 2 && /^[A-Z]{2}$/.test(iso)) {
      const codePoints = [...iso].map(c => 127397 + c.charCodeAt(0));
      try {
        return { emoji: String.fromCodePoint(...codePoints), name: iso };
      } catch (_) {}
    }
    return { emoji: '🌍', name: key.toUpperCase().slice(0, 3) };
  }

  /* ══════════════════════════════════════════
     LOAD & VERIFY ORDERS FROM BACKEND
     ══════════════════════════════════════════ */
  async function loadAndVerifyOrders(forceRefresh = false) {
    if (isRefreshing && !forceRefresh) return;
    isRefreshing = true;

    const tbody = document.getElementById('numbersTableBody');

    // 1. Collect all local orders
    let candidateOrders = [];
    try {
      const storedAll = JSON.parse(localStorage.getItem('primes_orders') || '[]');
      if (Array.isArray(storedAll)) candidateOrders = storedAll;
    } catch (_) {}

    try {
      const storedActive = JSON.parse(localStorage.getItem('primes_active_orders') || '[]');
      if (Array.isArray(storedActive)) {
        storedActive.forEach(act => {
          const sId = String(act.id || act.orderId || act._id);
          const existing = candidateOrders.find(o => String(o.id || o.orderId) === sId);
          if (existing) {
            Object.assign(existing, act);
          } else {
            candidateOrders.unshift(act);
          }
        });
      }
    } catch (_) {}

    const curId = localStorage.getItem('currentOrderId');
    if (curId) {
      const sCur = String(curId);
      if (!candidateOrders.some(o => String(o.id || o.orderId) === sCur)) {
        candidateOrders.unshift({ id: sCur, orderId: sCur, status: 'PENDING' });
      }
    }

    // 2. Poll API /api/order/:id for any pending/active orders
    const terminalStatuses = ['FINISHED', 'CANCELED', 'CANCELLED', 'BANNED', 'TIMEOUT', 'EXPIRED'];
    const promises = candidateOrders.map(async (item) => {
      const orderId = item.orderId || item.id || item._id;
      if (!orderId) return item;

      const currentStatus = String(item.status || 'PENDING').toUpperCase();
      // If already terminal, no need to poll unless forced
      if (terminalStatuses.includes(currentStatus) && !forceRefresh) {
        return item;
      }

      try {
        if (typeof getOrder === 'function') {
          const res = await getOrder(orderId);
          const orderData = res?.order || res?.data || res || {};
          const status = (orderData?.status || item.status || 'PENDING').toUpperCase();

          // Extract SMS/OTP
          let smsList = [];
          if (Array.isArray(orderData?.sms)) {
            smsList = orderData.sms;
          } else if (orderData?.sms && typeof orderData?.sms === 'object') {
            smsList = [orderData.sms];
          } else if (typeof orderData?.sms === 'string' && orderData.sms.trim()) {
            smsList = [{ text: orderData.sms.trim() }];
          }

          let otpCode = orderData?.code || orderData?.smsCode || orderData?.otp || '';
          if (!otpCode && smsList.length > 0) {
            const first = smsList[0];
            otpCode = first.code || first.otp || first.pin || '';
            if (!otpCode && first.text) {
              const match = first.text.match(/\b\d{4,8}\b/);
              if (match) otpCode = match[0];
            }
          }

          // Trigger sound if code newly arrived
          if (otpCode && window.NuraSound && typeof window.NuraSound.playOtpChime === 'function') {
            window.NuraSound.playOtpChime(orderId, `${orderId}_${otpCode}`);
          }

          return {
            ...item,
            orderId: String(orderId),
            phone: orderData?.phone || item.phone || '—',
            country: orderData?.country || item.country || 'usa',
            service: orderData?.product || orderData?.service || item.service || item.product || 'Service',
            status: status,
            smsCode: otpCode,
            smsList: smsList,
            updatedAt: Date.now()
          };
        }
      } catch (err) {
        // Keep existing if fetch error
      }
      return item;
    });

    try {
      allOrdersList = await Promise.all(promises);
      // Persist verified state
      localStorage.setItem('primes_orders', JSON.stringify(allOrdersList));
      const stillActive = allOrdersList.filter(o => !terminalStatuses.includes(String(o.status || '').toUpperCase()));
      localStorage.setItem('primes_active_orders', JSON.stringify(stillActive));
      localStorage.setItem('primes_active_count', String(stillActive.length));
    } catch (_) {
      allOrdersList = candidateOrders;
    } finally {
      isRefreshing = false;
      applyFiltersAndRender();
    }
  }

  /* ══════════════════════════════════════════
     APPLY FILTERS & RENDER TABLE
     ══════════════════════════════════════════ */
  function applyFiltersAndRender() {
    const tbody = document.getElementById('numbersTableBody');
    if (!tbody) return;

    let filtered = allOrdersList.filter(item => {
      const status = String(item.status || 'PENDING').toUpperCase();

      if (currentStatusFilter === 'active') {
        return status === 'PENDING' || status === 'ACTIVE' || status === 'RECEIVED';
      }
      if (currentStatusFilter === 'completed') {
        return status === 'FINISHED' || status === 'COMPLETED';
      }
      if (currentStatusFilter === 'pending') {
        return status === 'PENDING' || status === 'WAITING';
      }
      if (currentStatusFilter === 'cancelled') {
        return status === 'CANCELED' || status === 'CANCELLED' || status === 'BANNED' || status === 'TIMEOUT' || status === 'EXPIRED';
      }
      return true; // all
    });

    if (searchQuery) {
      filtered = filtered.filter(item => {
        const phone = String(item.phone || '').toLowerCase();
        const service = String(item.service || item.product || '').toLowerCase();
        const country = String(item.country || '').toLowerCase();
        const id = String(item.orderId || item.id || '').toLowerCase();
        const code = String(item.smsCode || '').toLowerCase();
        const status = String(item.status || '').toLowerCase();

        return phone.includes(searchQuery) ||
               service.includes(searchQuery) ||
               country.includes(searchQuery) ||
               id.includes(searchQuery) ||
               code.includes(searchQuery) ||
               status.includes(searchQuery);
      });
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="tn-state-box">
            <div class="tn-state-icon"><i class="ph ph-sim-card"></i></div>
            <h4 class="tn-state-title">No virtual numbers found</h4>
            <p class="tn-state-desc">You have no numbers matching the selected status. Purchase a virtual number to receive instant SMS codes.</p>
            <a href="buy.html" class="tn-btn-primary" style="margin-top:8px;">
              <i class="ph ph-plus"></i> Buy a Number
            </a>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(item => {
      const orderId = item.orderId || item.id || '—';
      const phone = item.phone || '—';
      const service = item.service || item.product || 'SMS Verification';
      const flagInfo = getCountryFlag(item.country);
      const status = String(item.status || 'PENDING').toUpperCase();
      const code = item.smsCode || '';

      const isTerminal = ['FINISHED', 'COMPLETED', 'CANCELED', 'CANCELLED', 'BANNED', 'TIMEOUT', 'EXPIRED'].includes(status);
      const isFinished = status === 'FINISHED' || status === 'COMPLETED';
      const isCancelled = ['CANCELED', 'CANCELLED', 'BANNED', 'TIMEOUT', 'EXPIRED'].includes(status);

      let statusBadgeClass = 'status-pending';
      let statusLabel = 'Pending';
      if (isFinished) {
        statusBadgeClass = 'status-completed';
        statusLabel = 'Completed';
      } else if (isCancelled) {
        statusBadgeClass = 'status-cancelled';
        statusLabel = 'Cancelled';
      } else if (code) {
        statusBadgeClass = 'status-active';
        statusLabel = 'Code Received';
      }

      // OTP Column Display (Matching Image 2)
      let otpDisplay = '<span class="tn-otp-waiting">—</span>';
      if (code) {
        otpDisplay = `
          <div style="display:inline-flex; align-items:center; gap:8px;">
            <span class="tn-otp-box">${escapeHTML(code)}</span>
            <button type="button" class="tn-btn-copy" onclick="window.copyToClipboard('${escapeHTML(code)}', 'OTP Code copied!')" title="Copy OTP">
              <i class="ph ph-copy"></i>
            </button>
          </div>
        `;
      } else if (!isTerminal) {
        otpDisplay = `
          <span class="tn-otp-waiting">
            <span class="tn-pulse-dot"></span> Waiting...
          </span>
        `;
      }

      return `
        <tr class="tn-number-row" data-order-id="${orderId}">
          <td>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span style="font-weight:800; font-size:14.5px; letter-spacing:0.2px;">${escapeHTML(phone)}</span>
                ${phone !== '—' ? `
                  <button type="button" class="tn-btn-copy" onclick="window.copyToClipboard('${escapeHTML(phone)}', 'Phone number copied!')" title="Copy Number">
                    <i class="ph ph-copy"></i>
                  </button>
                ` : ''}
                <span class="tn-country-badge">${flagInfo.emoji} ${flagInfo.name}</span>
              </div>
              <span style="font-size:12px; color:var(--tn-text-muted); font-weight:700;">
                <i class="ph ph-chat-circle-dots"></i> ${escapeHTML(service)} · Order #${escapeHTML(String(orderId).slice(-6))}
              </span>
            </div>
          </td>
          <td>${otpDisplay}</td>
          <td class="tn-hide-mobile">
            <span class="tn-status-pill ${statusBadgeClass}">${statusLabel}</span>
          </td>
          <td style="text-align:right;">
            <div style="display:inline-flex; align-items:center; gap:6px;">
              ${(!isTerminal && code) ? `
                <button type="button" class="tn-btn-copy" onclick="window.handleFinishOrder('${orderId}')" title="Finish and Complete" style="color:var(--tn-success); border-color:var(--tn-success);">
                  <i class="ph ph-check"></i> Finish
                </button>
              ` : ''}
              ${(!isTerminal && !code) ? `
                <button type="button" class="tn-btn-copy" onclick="window.handleCancelOrder('${orderId}')" title="Cancel Number" style="color:var(--tn-danger); border-color:var(--tn-danger);">
                  <i class="ph ph-x"></i> Cancel
                </button>
              ` : ''}
              <button type="button" class="tn-btn-copy" onclick="window.loadSingleOrder('${orderId}')" title="Refresh this order">
                <i class="ph ph-arrows-clockwise"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  /* ══════════════════════════════════════════
     ORDER ACTIONS (FINISH, CANCEL, SINGLE REFRESH)
     ══════════════════════════════════════════ */
  window.loadSingleOrder = async function (orderId) {
    if (!orderId) return;
    try {
      if (typeof getOrder === 'function') {
        const res = await getOrder(orderId);
        const orderData = res?.order || res?.data || res;
        const target = allOrdersList.find(o => String(o.orderId || o.id) === String(orderId));
        if (target && orderData) {
          target.status = (orderData.status || target.status).toUpperCase();
          if (orderData.code) target.smsCode = orderData.code;
          applyFiltersAndRender();
        }
      }
    } catch (_) {}
  };

  window.handleFinishOrder = async function (orderId) {
    if (!confirm('Are you sure you want to complete this order?')) return;
    try {
      if (typeof finishOrder === 'function') {
        await finishOrder(orderId);
      }
      const target = allOrdersList.find(o => String(o.orderId || o.id) === String(orderId));
      if (target) target.status = 'FINISHED';
      localStorage.setItem('primes_orders', JSON.stringify(allOrdersList));
      applyFiltersAndRender();
      if (typeof showToast === 'function') showToast('Order completed successfully', 'success');
    } catch (err) {
      alert(err.message || 'Failed to complete order');
    }
  };

  window.handleCancelOrder = async function (orderId) {
    if (!confirm('Cancel this number? Any applicable refund will be credited back to your wallet.')) return;
    try {
      if (typeof cancelOrder === 'function') {
        await cancelOrder(orderId);
      }
      const target = allOrdersList.find(o => String(o.orderId || o.id) === String(orderId));
      if (target) target.status = 'CANCELED';
      localStorage.setItem('primes_orders', JSON.stringify(allOrdersList));
      applyFiltersAndRender();
      await fetchLiveHeaderBalance();
      if (typeof showToast === 'function') showToast('Order cancelled and refunded', 'info');
    } catch (err) {
      alert(err.message || 'Failed to cancel order');
    }
  };

  /* ══════════════════════════════════════════
     AUTO POLLING
     ══════════════════════════════════════════ */
  function startAutoPolling() {
    if (pollIntervalTimer) clearInterval(pollIntervalTimer);
    pollIntervalTimer = setInterval(() => {
      // Check if page is visible and there are pending orders
      if (document.hidden) return;
      const hasPending = allOrdersList.some(o => {
        const s = String(o.status || '').toUpperCase();
        return s === 'PENDING' || s === 'WAITING' || (s === 'ACTIVE' && !o.smsCode);
      });
      if (hasPending) {
        loadAndVerifyOrders();
      }
    }, 6000);
  }

  // Copy helper
  window.copyToClipboard = function (text, message = 'Copied to clipboard!') {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      if (typeof showToast === 'function') {
        showToast(message, 'success');
      } else {
        alert(message);
      }
    }).catch(() => {
      prompt('Copy manually:', text);
    });
  };

  function escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
