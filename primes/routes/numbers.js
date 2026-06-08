// routes/numbers.js
// These are the URLs your buy.html will call

const express = require('express');
const router = express.Router();
const fivesim = require('../../fivesim'); // loads your fivesim.js helper

// ─────────────────────────────────────────────────────────────
// GET /api/numbers/countries
// Called when buy.html loads — fills the country dropdown
// ─────────────────────────────────────────────────────────────
router.get('/countries', async (req, res) => {
  try {
    const data = await fivesim.getCountries();
    res.json({ success: true, countries: Object.keys(data), details: data });
  } catch (err) {
    console.error('Countries error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/numbers/products?country=nigeria
// Called when user picks a country — fills the service cards
// ─────────────────────────────────────────────────────────────
router.get('/products', async (req, res) => {
  const { country, operator } = req.query;

  if (!country) {
    return res.status(400).json({ success: false, error: 'Country is required' });
  }

  try {
    const data = await fivesim.getProducts(country, operator);
    res.json({ success: true, products: data });
  } catch (err) {
    console.error('Products error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/numbers/buy
// Called when user clicks "Buy Number" button
// Body must contain: { country, product, type }
// Example: { country: "nigeria", product: "whatsapp", type: "activation" }
// ─────────────────────────────────────────────────────────────
router.post('/buy', async (req, res) => {
  const { country, product, type, operator } = req.body;
  const op = operator || 'any';

  if (!country || !product) {
    return res.status(400).json({ 
      success: false, 
      error: 'country and product are required' 
    });
  }

  try {
    let order;

    if (type === 'hosting') {
      order = await fivesim.buyHostingNumber(country, product, op);
    } else {
      order = await fivesim.buyActivationNumber(country, product, op);
    }

    console.log(`✅ Number purchased: ${order.phone} for ${product} in ${country} using operator ${op} @ $${order.price}`);
    res.json({ success: true, order });

  } catch (err) {
    // Extract the actual 5sim error body if available
    const status  = err.response?.status;
    const body    = err.response?.data;
    const errMsg  = typeof body === 'string' ? body
                  : body?.message || body?.error || err.message;

    console.error(`Buy error [${status}]:`, errMsg);

    // Friendly messages for common 5sim errors
    let friendlyMsg = errMsg;
    if (status === 400 || errMsg?.toLowerCase().includes('not enough')) {
      console.warn("[ADMIN ALERT] Your 5sim.net account balance is empty! Please top up your 5sim.net account immediately to resume virtual number sales.");
      friendlyMsg = 'Service temporarily unavailable due to maintenance. Please try again shortly.';
    } else if (status === 401) {
      friendlyMsg = 'API token rejected. Please check your FIVESIM_API_TOKEN in buy.env.';
    } else if (status === 404 || errMsg?.toLowerCase().includes('no free phones')) {
      friendlyMsg = 'No numbers available for this service/country right now. Try a different option.';
    }

    res.status(500).json({ success: false, error: friendlyMsg });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/numbers/check/:orderId
// Called every 5 seconds to check if SMS has arrived
// Example: /api/numbers/check/11631253
// ─────────────────────────────────────────────────────────────
router.get('/check/:orderId', async (req, res) => {
  try {
    const data = await fivesim.checkOrder(req.params.orderId);
    // data is the full order object from 5sim: { id, phone, status, sms: [...], ... }
    res.json({ success: true, data });
  } catch (err) {
    const errMsg = err.response?.data || err.message;
    console.error('Check order error:', errMsg);
    res.status(500).json({ success: false, error: typeof errMsg === 'string' ? errMsg : err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/numbers/5simbalance
// Returns the 5sim account balance so the UI can display it
// ─────────────────────────────────────────────────────────────
router.get('/5simbalance', async (req, res) => {
  try {
    const profile = await fivesim.getBalance();
    res.json({ success: true, balance: profile.balance, frozen: profile.frozen_balance });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/numbers/inbox/:orderId
// For hosted/rental numbers — gets all received SMS messages
// ─────────────────────────────────────────────────────────────
router.get('/inbox/:orderId', async (req, res) => {
  try {
    const data = await fivesim.getSmsInbox(req.params.orderId);
    res.json({ 
      success: true, 
      sms: data,          // array of SMS messages (5sim returns an array directly)
      total: data.length  // total count
    });
  } catch (err) {
    console.error('Inbox error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/numbers/finish/:orderId
// Called when user clicks "Done" — tells 5sim the number was used
// ─────────────────────────────────────────────────────────────
router.post('/finish/:orderId', async (req, res) => {
  try {
    const data = await fivesim.finishOrder(req.params.orderId);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Finish error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/numbers/cancel/:orderId
// Called when user clicks "Cancel" — cancels and refunds to 5sim balance
// ─────────────────────────────────────────────────────────────
router.post('/cancel/:orderId', async (req, res) => {
  try {
    const data = await fivesim.cancelOrder(req.params.orderId);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Cancel error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/numbers/ban/:orderId
// Called when user reports a banned number — flags as banned and refunds
// ─────────────────────────────────────────────────────────────
router.post('/ban/:orderId', async (req, res) => {
  try {
    const data = await fivesim.banOrder(req.params.orderId);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Ban error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;