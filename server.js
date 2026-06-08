const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ✅ Your HTML files are in the ROOT folder, not a subfolder
app.use(express.static(__dirname));

// API Routes
const numberRoutes = require('./routes/numbers');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user').router;
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');

app.use('/api/numbers', numberRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

module.exports = app;