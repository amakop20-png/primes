// routes/referrals.js - Customer referral management router
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/adminAuth');
const db = require('../db');

// GET /api/referrals or /api/referral - Get referral code, link, and stats for the authenticated user
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.id || req.user._id;
  try {
    const user = await db.findUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const refCode = await db.ensureUserReferralCode(userId, user.username);
    const stats = await db.getReferralStats(userId);

    // Build absolute referral link using the real deployed domain or request host
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'nuraxq.com';
    const origin = req.headers.origin || `${proto}://${host}`;
    const referralLink = `${origin}/signup.html?ref=${encodeURIComponent(refCode)}`;

    return res.status(200).json({
      success: true,
      referralCode: refCode,
      referralLink,
      totalReferrals: stats.totalReferrals || 0,
      successfulReferrals: stats.successfulReferrals || 0,
      referralBalance: stats.referralBalance || 0,
      rewardsEarned: stats.rewardsEarned || 0,
      bonusPercent: 10,
      referrals: stats.referrals || []
    });
  } catch (err) {
    console.error('Referral stats error:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve referral data' });
  }
});

// GET /api/referrals/stats - Alias for /
router.get('/stats', authenticate, async (req, res) => {
  req.url = '/';
  router(req, res);
});

// GET /api/referrals/validate/:code - Validate a referral code (Public)
router.get('/validate/:code', async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) {
    return res.status(400).json({ success: false, valid: false, message: 'Referral code is required' });
  }

  try {
    const referrer = await db.findUserByReferralCode(code);
    if (!referrer) {
      return res.status(404).json({ success: false, valid: false, message: 'Invalid or expired referral code' });
    }

    return res.status(200).json({
      success: true,
      valid: true,
      referralCode: referrer.referral_code,
      referrerName: referrer.first_name ? `${referrer.first_name} ${referrer.last_name || ''}`.trim() : referrer.username
    });
  } catch (err) {
    console.error('Validate referral code error:', err);
    return res.status(500).json({ success: false, valid: false, message: 'Server error validating referral code' });
  }
});

module.exports = router;
