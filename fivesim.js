// fivesim.js
// This file handles ALL communication with 5sim's API

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'primes/buy.env') });

const BASE_URL = 'ttps://nurasms-api.onrender.com';
const TOKEN = process.env.FIVESIM_API_TOKEN || process.env.FIVESIM_API_KEY; // reads from your .env file or Vercel variables

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 6000, // 6-second timeout to prevent server hang-ups
});

// These headers are sent with every request to 5sim
const authHeaders = {
  Authorization: `Bearer ${TOKEN}`,  // your secret token
  Accept: 'application/json',
};

// Some 5sim endpoints don't need a token (public data)
const guestHeaders = {
  Accept: 'application/json',
};

// ── Get list of all countries ──
async function getCountries() {
  const res = await client.get('/guest/countries', { headers: guestHeaders });
  return res.data;
}

// ── Get all products/services for a country ──
// Example: getProducts('nigeria', 'any')
async function getProducts(country, operator = 'any') {
  const res = await client.get(
    `/guest/products/${country}/${operator}`,
    { headers: guestHeaders }
  );
  return res.data;
}

// ── Buy a one-time OTP number ──
// Example: buyActivationNumber('nigeria', 'whatsapp')
async function buyActivationNumber(country, product, operator = 'any') {
  const res = await client.get(
    `/user/buy/activation/${country}/${operator}/${product}`,
    { headers: authHeaders }
  );
  return res.data;
  // Returns: { id, phone, status: 'PENDING', expires, price }
}

// ── Buy a long-term rental number ──
async function buyHostingNumber(country, product, operator = 'any') {
  const res = await client.get(
    `/user/buy/hosting/${country}/${operator}/${product}`,
    { headers: authHeaders }
  );
  return res.data;
}

// ── Check if an SMS has arrived on a number ──
// Call this repeatedly until status becomes 'RECEIVED'
async function checkOrder(orderId) {
  const res = await client.get(
    `/user/check/${orderId}`,
    { headers: authHeaders }
  );
  return res.data;
  // Returns: { status, sms: [{ text, code, sender }] }
}

// ── Mark an order as finished (you got the SMS) ──
async function finishOrder(orderId) {
  const res = await client.get(
    `/user/finish/${orderId}`,
    { headers: authHeaders }
  );
  return res.data;
}

// ── Cancel an order (no SMS received, get refund from 5sim) ──
async function cancelOrder(orderId) {
  const res = await client.get(
    `/user/cancel/${orderId}`,
    { headers: authHeaders }
  );
  return res.data;
}

// ── Ban an order (number already used/blocked, get refund from 5sim) ──
async function banOrder(orderId) {
  const res = await client.get(
    `/user/ban/${orderId}`,
    { headers: authHeaders }
  );
  return res.data;
}

// ── Get all SMS messages for a hosted/rented number ──
async function getSmsInbox(orderId) {
  const res = await client.get(
    `/user/sms/inbox/${orderId}`,
    { headers: authHeaders }
  );
  return res.data;
}

// ── Check your 5sim account balance ──
async function getBalance() {
  const res = await client.get(
    `/user/profile`,
    { headers: authHeaders }
  );
  return res.data;
}

// Export all functions so other files can use them
module.exports = {
  getCountries,
  getProducts,
  buyActivationNumber,
  buyHostingNumber,
  checkOrder,
  finishOrder,
  cancelOrder,
  banOrder,
  getSmsInbox,
  getBalance,
};