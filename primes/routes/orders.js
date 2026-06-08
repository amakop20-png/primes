const express = require('express');
const router = express.Router();
const { dbGet, dbRun, dbAll } = require('../database');
const { authenticateToken } = require('./user');
const axios = require('axios'); // For 5sim

const FIVESIM_API_TOKEN = process.env.FIVESIM_API_TOKEN;

// Create a new order (Purchase a number)
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { country, product, type, operator, priceUSD } = req.body;
    
    if (!country || !product || !priceUSD) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 1. Check user balance
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (user.balance < priceUSD) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // 2. Fetch config for markup/rate
    const rateRow = await dbGet("SELECT value FROM config WHERE key = 'exchangeRate'");
    const markupRow = await dbGet("SELECT value FROM config WHERE key = 'markupMultiplier'");
    const adminRate = rateRow ? parseFloat(rateRow.value) : 1500;
    const adminMarkup = markupRow ? parseFloat(markupRow.value) : 1.5;

    // 3. Request number from 5sim
    const op = operator || 'any';
    const fiveSimRes = await axios.get(`https://5sim.net/v1/user/buy/activation/${country}/${op}/${product}`, {
      headers: {
        'Authorization': `Bearer ${FIVESIM_API_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    const orderData = fiveSimRes.data;

    // 4. Deduct balance and update user stats
    const newBalance = user.balance - priceUSD;
    const amountNGN = Math.round(priceUSD * adminRate * adminMarkup);
    
    await dbRun('UPDATE users SET balance = ?, numbersPurchased = numbersPurchased + 1 WHERE id = ?', [newBalance, req.user.id]);

    // 5. Save order in database
    await dbRun(
      'INSERT INTO orders (orderId, userId, service, product, country, phone, amountNGN, amountUSD, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [orderData.id.toString(), req.user.id, product, product, country, orderData.phone, amountNGN, priceUSD, orderData.status || 'RECEIVED']
    );

    // 6. Log activity
    await dbRun(
      "INSERT INTO activity (userId, type, message) VALUES (?, 'purchase', ?)",
      [req.user.id, `Purchased ${product} number: ${orderData.phone} (${country})`]
    );

    res.json({
      success: true,
      order: orderData,
      newBalance
    });

  } catch (error) {
    console.error('Order creation error:', error.response ? error.response.data : error.message);
    res.status(500).json({ 
      error: error.response?.data || 'Purchase failed via API provider.' 
    });
  }
});

// Sync order status with 5sim (Check SMS)
router.get('/check/:orderId', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Ensure order belongs to user
    const order = await dbGet('SELECT * FROM orders WHERE orderId = ? AND userId = ?', [orderId, req.user.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const fiveSimRes = await axios.get(`https://5sim.net/v1/user/check/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${FIVESIM_API_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    // Update status in DB if changed
    if (fiveSimRes.data.status !== order.status) {
      await dbRun('UPDATE orders SET status = ? WHERE orderId = ?', [fiveSimRes.data.status, orderId]);
    }

    res.json({ success: true, data: fiveSimRes.data });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check order status' });
  }
});

// Cancel or Finish order
router.post('/action/:orderId', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { action } = req.body; // 'cancel', 'finish', 'ban'

    const order = await dbGet('SELECT * FROM orders WHERE orderId = ? AND userId = ?', [orderId, req.user.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const fiveSimRes = await axios.get(`https://5sim.net/v1/user/${action}/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${FIVESIM_API_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    // If cancelled, we should refund the user
    if (action === 'cancel') {
      await dbRun('UPDATE users SET balance = balance + ? WHERE id = ?', [order.amountUSD, req.user.id]);
      await dbRun("INSERT INTO activity (userId, type, message) VALUES (?, 'refund', ?)", [req.user.id, `Refunded for canceled order ${order.phone}`]);
    }

    await dbRun('UPDATE orders SET status = ? WHERE orderId = ?', [fiveSimRes.data.status || action.toUpperCase(), orderId]);

    res.json({ success: true, data: fiveSimRes.data });
  } catch (error) {
    res.status(500).json({ error: `Failed to ${req.body.action} order` });
  }
});

module.exports = router;
