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
const numberRoutes = require('./primes/routes/numbers');
app.use('/api/numbers', numberRoutes);
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});