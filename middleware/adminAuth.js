// middleware/adminAuth.js - Server-side admin authorization middleware
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || process.env.primes_secret_key_123 || 'nuraxq_admin_jwt_secret_key_2026';

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Authentication token is required.'
    });
  }

  const token = authHeader.slice(7).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if role is admin or superadmin
    const role = String(decoded.role || '').toLowerCase();
    const isAdmin = role === 'admin' || role === 'superadmin' || decoded.is_admin === true || decoded.isAdmin === true;

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Administrator privileges required.'
      });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Session expired. Please log in again.'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid or malformed authentication token.'
    });
  }
}

module.exports = {
  adminAuth,
  JWT_SECRET
};
