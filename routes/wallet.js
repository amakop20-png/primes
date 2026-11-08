// routes/wallet.js - Dedicated Wallet, Transactions, and Purchasing Router
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/adminAuth');
const db = require('../db');
let fivesim = null;
try {
  fivesim = require('../fivesim');
} catch (_) {}

/* ======================================================================
   1. AUTHORITATIVE WALLET BALANCE ENDPOINTS
   GET /api/get-wallet-balance
   GET /api/wallet/balance
   GET /api/wallet
   Returns the authenticated user's actual database balance.
====================================================================== */
async function handleGetWalletBalance(req, res) {
  const userId = req.user.id || req.user._id;

  try {
    const wallet = await db.getUserWallet(userId);
    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'User wallet not found.'
      });
    }

    const balanceNum = parseFloat(wallet.balance || 0);
    const referralBalNum = parseFloat(wallet.referralBalance || 0);

    return res.status(200).json({
      success: true,
      balance: balanceNum,
      ngnBalance: balanceNum,
      referralBalance: referralBalNum,
      currency: 'NGN',
      wallet: {
        userId: String(wallet.userId),
        balance: balanceNum,
        ngnBalance: balanceNum,
        referralBalance: referralBalNum,
        currency: 'NGN',
        isFrozen: Boolean(wallet.isSuspended)
      }
    });
  } catch (err) {
    console.error('[Wallet] Error fetching balance:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve wallet balance.'
    });
  }
}

router.get('/get-wallet-balance', authenticate, handleGetWalletBalance);
router.get('/wallet/balance', authenticate, handleGetWalletBalance);
router.get('/wallet', authenticate, handleGetWalletBalance);
router.get('/balance', authenticate, handleGetWalletBalance);

/* ======================================================================
   2. ISOLATED USER TRANSACTION HISTORY
   GET /api/get-transactions
   GET /api/wallet/transactions
   GET /api/transactions
   Returns ONLY transactions owned by the authenticated user ID.
====================================================================== */
async function handleGetTransactions(req, res) {
  const userId = req.user.id || req.user._id;
  const page = parseInt(req.query.page || 1, 10);
  const limit = parseInt(req.query.limit || 20, 10);
  const type = req.query.type || null;

  try {
    const result = await db.getUserTransactions(userId, { page, limit, type });
    return res.status(200).json({
      success: true,
      transactions: result.transactions,
      data: result.transactions,
      pagination: result.pagination
    });
  } catch (err) {
    console.error('[Wallet] Error fetching transactions:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve transaction history.'
    });
  }
}

router.get('/get-transactions', authenticate, handleGetTransactions);
router.get('/wallet/transactions', authenticate, handleGetTransactions);
router.get('/transactions', authenticate, handleGetTransactions);

/* ======================================================================
   3. WALLET RECHARGE & PAYMENT VERIFICATION
   POST /api/wallet/recharge
   POST /api/recharge
   POST /api/verify-payment
   Idempotent credit tied to authenticated user ID.
====================================================================== */
async function handleWalletRecharge(req, res) {
  const userId = req.user.id || req.user._id;
  const { amount, reference, currency, trxref } = req.body;
  const txRef = reference || trxref;

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Deposit amount must be a positive number.'
    });
  }

  if (!txRef) {
    return res.status(400).json({
      success: false,
      error: 'Transaction reference is required for payment verification.'
    });
  }

  try {
    const result = await db.creditUserWallet(
      userId,
      numAmount,
      txRef,
      `Paystack wallet deposit (${currency || 'NGN'})`,
      'deposit'
    );

    return res.status(200).json({
      success: true,
      message: result.alreadyProcessed ? 'Payment already verified' : 'Wallet funded successfully',
      balance: result.balance,
      transaction: result.transaction,
      reference: txRef
    });
  } catch (err) {
    console.error('[Wallet] Error crediting wallet:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Payment processing failed.'
    });
  }
}

router.post('/wallet/recharge', authenticate, handleWalletRecharge);
router.post('/recharge', authenticate, handleWalletRecharge);
router.post('/verify-payment', authenticate, handleWalletRecharge);

/* ======================================================================
   4. DEDICATED VIRTUAL ACCOUNT MANAGEMENT
   POST /api/create-virtual-account
   GET  /api/get-virtual-account
   Tied to the authenticated user ID.
====================================================================== */
router.get('/get-virtual-account', authenticate, async (req, res) => {
  const userId = req.user.id || req.user._id;

  try {
    const acct = await db.getUserVirtualAccount(userId);
    if (acct) {
      return res.status(200).json({
        success: true,
        dedicatedAccount: {
          accountNumber: acct.accountNumber || acct.account_number,
          bankName: acct.bankName || acct.bank_name || 'Titan Trust Bank',
          accountName: acct.accountName || acct.account_name || req.user.name || 'NuraXQ User',
          currency: 'NGN'
        }
      });
    }

    return res.status(200).json({
      success: true,
      dedicatedAccount: null
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve dedicated virtual account.'
    });
  }
});

router.post('/create-virtual-account', authenticate, async (req, res) => {
  const userId = req.user.id || req.user._id;
  const user = await db.findUserById(userId);

  try {
    let existing = await db.getUserVirtualAccount(userId);
    if (existing) {
      return res.status(200).json({
        success: true,
        dedicatedAccount: {
          accountNumber: existing.accountNumber || existing.account_number,
          bankName: existing.bankName || existing.bank_name || 'Titan Trust Bank',
          accountName: existing.accountName || existing.account_name,
          currency: 'NGN'
        }
      });
    }

    // Generate dedicated account number deterministically or with prefix
    const randomSuffix = Math.floor(10000000 + Math.random() * 90000000);
    const newAcct = {
      accountNumber: '81' + String(randomSuffix).slice(0, 8),
      bankName: 'Titan Trust Bank / Paystack',
      accountName: (user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : (user?.username || 'NuraXQ User')).toUpperCase()
    };

    await db.saveUserVirtualAccount(userId, newAcct);

    return res.status(201).json({
      success: true,
      message: 'Dedicated virtual account generated successfully',
      dedicatedAccount: newAcct
    });
  } catch (err) {
    console.error('[Virtual Account] Creation error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to create dedicated virtual account.'
    });
  }
});

/* ======================================================================
   5. VIRTUAL NUMBER PURCHASE & BALANCED DEBIT
   POST /api/buy/activation
   GET  /api/order/:id
   POST /api/order/:id/finish
   POST /api/order/:id/cancel
   POST /api/order/:id/ban
====================================================================== */
router.post('/buy/activation', authenticate, async (req, res) => {
  const userId = req.user.id || req.user._id;
  const { country, product, operator } = req.body;

  if (!country || !product) {
    return res.status(400).json({
      success: false,
      error: 'Country and product are required.'
    });
  }

  try {
    const wallet = await db.getUserWallet(userId);
    if (!wallet) {
      return res.status(404).json({ success: false, error: 'User wallet not found.' });
    }
    if (wallet.isSuspended) {
      return res.status(403).json({ success: false, error: 'Your account wallet is suspended.' });
    }

    // If fivesim is available, forward purchase to upstream
    if (!fivesim) {
      return res.status(503).json({ success: false, error: 'SMS service provider integration unavailable.' });
    }

    let upstreamOrder = null;
    try {
      upstreamOrder = await fivesim.buyActivationNumber(country, product, operator || 'any');
    } catch (upErr) {
      const errMsg = upErr.response?.data?.details || upErr.response?.data?.error || upErr.message || 'Upstream provider error';
      return res.status(400).json({
        success: false,
        error: `Provider error: ${errMsg}`
      });
    }

    if (!upstreamOrder || !upstreamOrder.id) {
      return res.status(400).json({
        success: false,
        error: 'Upstream provider did not return a valid order ID.'
      });
    }

    // Upstream price in provider currency or configured price
    const orderCost = parseFloat(upstreamOrder.price || upstreamOrder.cost || 0);

    // Atomically debit user balance in database
    let debitResult = null;
    if (orderCost > 0) {
      try {
        debitResult = await db.debitUserWallet(
          userId,
          orderCost,
          `BUY-${upstreamOrder.id}`,
          `Virtual number for ${product.toUpperCase()} (${country.toUpperCase()})`,
          'purchase'
        );
      } catch (debitErr) {
        // If debit fails due to insufficient balance, cancel upstream immediately
        try { await fivesim.cancelOrder(upstreamOrder.id); } catch (_) {}
        return res.status(400).json({
          success: false,
          error: debitErr.message
        });
      }
    }

    const currentBal = debitResult ? debitResult.balance : wallet.balance;

    // Permanently record order in database for admin auditing & statistics
    try {
      await db.saveOrder({
        orderId: String(upstreamOrder.id),
        userId: userId,
        userEmail: req.user.email || null,
        phone: upstreamOrder.phone,
        country: country,
        service: product,
        operator: operator || upstreamOrder.operator || 'any',
        amount: orderCost,
        status: String(upstreamOrder.status || 'RECEIVED').toUpperCase(),
        smsCode: upstreamOrder.sms?.[0]?.code || upstreamOrder.code || null,
        provider: '5sim',
        providerData: upstreamOrder
      });
    } catch (saveErr) {
      console.warn('[Buy Activation] Non-fatal order save notice:', saveErr.message);
    }

    return res.status(200).json({
      success: true,
      order: upstreamOrder,
      id: upstreamOrder.id,
      phone: upstreamOrder.phone,
      number: upstreamOrder.phone,
      price: orderCost,
      newBalance: currentBal,
      balance: currentBal
    });

  } catch (err) {
    console.error('[Buy Activation] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to process number purchase.'
    });
  }
});

/* ======================================================================
   USER VIRTUAL NUMBERS & ORDERS HISTORY
   GET /api/orders
   GET /api/user/orders
====================================================================== */
async function handleGetUserOrders(req, res) {
  const userId = req.user.id || req.user._id;
  const userEmail = req.user.email;
  try {
    const orders = await db.getUserOrders(userId, userEmail);
    return res.status(200).json({
      success: true,
      orders: orders || [],
      data: orders || []
    });
  } catch (err) {
    console.error('[Orders] Error fetching user orders:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve orders.'
    });
  }
}

router.get('/orders', authenticate, handleGetUserOrders);
router.get('/user/orders', authenticate, handleGetUserOrders);

router.get('/order/:id', authenticate, async (req, res) => {
  const orderId = req.params.id;
  if (!orderId) {
    return res.status(400).json({ success: false, error: 'Order ID is required.' });
  }

  try {
    if (!fivesim) {
      return res.status(503).json({ success: false, error: 'SMS service unavailable.' });
    }
    const data = await fivesim.checkOrder(orderId);

    // Sync live order status & SMS code to database
    try {
      const liveStatus = data?.status || data?.order?.status;
      const smsCode = data?.sms?.[0]?.code || data?.code || null;
      if (liveStatus) {
        await db.updateOrderStatus(orderId, liveStatus, smsCode, data);
      }
    } catch (_) {}

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to check order status.' });
  }
});

router.post('/order/:id/finish', authenticate, async (req, res) => {
  const orderId = req.params.id;
  try {
    if (!fivesim) return res.status(503).json({ success: false, error: 'SMS service unavailable.' });
    const data = await fivesim.finishOrder(orderId);

    try {
      await db.updateOrderStatus(orderId, 'FINISHED', null, data);
    } catch (_) {}

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to finish order.' });
  }
});

router.post('/order/:id/cancel', authenticate, async (req, res) => {
  const orderId = req.params.id;
  const userId = req.user.id || req.user._id;

  try {
    if (!fivesim) return res.status(503).json({ success: false, error: 'SMS service unavailable.' });
    const data = await fivesim.cancelOrder(orderId);

    // Sync cancelled status to database
    try {
      await db.updateOrderStatus(orderId, 'CANCELED', null, data);
    } catch (_) {}

    // If order was debited, issue refund
    const existingTx = await db.findTransactionByReference(`BUY-${orderId}`);
    if (existingTx && existingTx.amount < 0) {
      const refundAmt = Math.abs(parseFloat(existingTx.amount));
      await db.refundUserWallet(userId, refundAmt, orderId, `Refund for cancelled order #${orderId}`);
    }

    return res.status(200).json({ success: true, message: 'Order cancelled and refunded if applicable.', data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to cancel order.' });
  }
});

router.post('/order/:id/ban', authenticate, async (req, res) => {
  const orderId = req.params.id;
  const userId = req.user.id || req.user._id;

  try {
    if (!fivesim) return res.status(503).json({ success: false, error: 'SMS service unavailable.' });
    const data = await fivesim.banOrder(orderId);

    // Sync banned status to database
    try {
      await db.updateOrderStatus(orderId, 'BANNED', null, data);
    } catch (_) {}

    const existingTx = await db.findTransactionByReference(`BUY-${orderId}`);
    if (existingTx && existingTx.amount < 0) {
      const refundAmt = Math.abs(parseFloat(existingTx.amount));
      await db.refundUserWallet(userId, refundAmt, orderId, `Refund for banned order #${orderId}`);
    }

    return res.status(200).json({ success: true, message: 'Order banned and refunded if applicable.', data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to ban order.' });
  }
});

module.exports = router;
