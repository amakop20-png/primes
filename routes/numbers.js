const express = require('express');
const router = express.Router();
const fivesim = require('../fivesim');

// GET /api/numbers/countries
router.get('/countries', async (req, res) => {
  try {
    const data = await fivesim.getCountries();
    res.json({ success: true, details: data });
  } catch (err) {
    console.error('Countries error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch countries' });
  }
});

// GET /api/numbers/products?country=xxx
router.get('/products', async (req, res) => {
  const { country } = req.query;
  if (!country) {
    return res.status(400).json({ success: false, error: 'country query param is required' });
  }

  try {
    const data = await fivesim.getProducts(country);
    res.json({ success: true, products: data });
  } catch (err) {
    console.error('Products error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
});

// GET /api/numbers/5simbalance
router.get('/5simbalance', async (req, res) => {
  try {
    const data = await fivesim.getBalance();
    res.json({ success: true, balance: data.balance });
  } catch (err) {
    console.error('5sim balance error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch 5sim balance' });
  }
});

module.exports = router;
