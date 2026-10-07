// server.js - NuraXQ / Primes Main Backend Server Entry
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and body parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets from root folder
app.use(express.static(__dirname));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Server is working' });
});

// Import Routers
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');

// ✅ Mount Official Admin Router at /api/admin
// This exposes:
// - POST /api/admin/auth/login
// - GET  /api/admin/auth/me
// - POST /api/admin/auth/logout
// - POST /api/admin/auth/register
// - GET  /api/admin/dashboard/stats
// - GET  /api/admin/users
// - etc.
app.use('/api/admin', adminRoutes);

// Mount Customer Auth Routers
app.use('/api/auth', authRoutes);

// Aliases for frontend direct calls
app.post('/api/login', (req, res) => {
  req.url = '/login';
  authRoutes(req, res);
});

app.post('/api/signup', (req, res) => {
  req.url = '/signup';
  authRoutes(req, res);
});

// 5sim proxy integration if fivesim.js exists
try {
  const fivesim = require('./fivesim');
  app.get('/api/countries', async (req, res) => {
    try {
      const data = await fivesim.getCountries();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch countries' });
    }
  });

  app.get('/guest/countries', async (req, res) => {
    try {
      const data = await fivesim.getCountries();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch countries' });
    }
  });

  app.get('/api/profile', async (req, res) => {
    try {
      const data = await fivesim.getBalance();
      res.json({ profile: data });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  });

  app.get('/api/balance', async (req, res) => {
    try {
      const data = await fivesim.getBalance();
      res.json({ balance: data });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch balance' });
    }
  });
} catch (_) {}

// Fallback for unmatched API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Endpoint ${req.method} ${req.originalUrl} not found.`
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`✅ Admin routes mounted at /api/admin`);
});

module.exports = app;
