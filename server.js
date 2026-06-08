const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'primes/buy.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ✅ Your HTML files are in the ROOT folder, not a subfolder
app.use(express.static(__dirname));

// API Routes
const numberRoutes = require(path.join(__dirname, 'primes', 'routes', 'numbers'));
const authRoutes = require(path.join(__dirname, 'primes', 'routes', 'auth'));
const userRoutes = require(path.join(__dirname, 'primes', 'routes', 'user')).router;
const orderRoutes = require(path.join(__dirname, 'primes', 'routes', 'orders'));
const adminRoutes = require(path.join(__dirname, 'primes', 'routes', 'admin'));

app.use('/api/numbers', numberRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

module.exports = app;