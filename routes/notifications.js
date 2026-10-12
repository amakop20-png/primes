// routes/notifications.js - Customer and system notifications router
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/adminAuth');
const db = require('../db');

// In-memory notifications store (fallback if no database is connected or for testing)
const inMemoryNotifications = [];

// GET /api/notifications - Get notifications for the authenticated user
router.get('/', authenticate, async (req, res) => {
  const userId = String(req.user.id || req.user._id || '').trim();
  const userEmail = (req.user.email || '').toLowerCase().trim();

  try {
    const pool = db.getPool();
    if (pool) {
      const result = await pool.query(
        `SELECT id, notification_id, user_id, user_email, title, message, type, read, created_at
         FROM notifications
         WHERE user_id = $1 OR LOWER(user_email) = $2
         ORDER BY created_at DESC
         LIMIT 100`,
        [userId, userEmail]
      );

      const notifications = result.rows.map(row => ({
        id: row.notification_id || String(row.id),
        userId: row.user_id,
        userEmail: row.user_email,
        title: row.title,
        message: row.message,
        type: row.type || 'system',
        read: Boolean(row.read),
        createdAt: row.created_at
      }));

      return res.status(200).json({
        success: true,
        notifications,
        data: notifications
      });
    }

    const mongoose = db.getMongoose();
    if (db.dbType === 'mongo' && mongoose) {
      const Notification = mongoose.models.Notification || mongoose.model('Notification', new mongoose.Schema({
        notification_id: String,
        user_id: String,
        user_email: String,
        title: String,
        message: String,
        type: { type: String, default: 'system' },
        read: { type: Boolean, default: false },
        created_at: { type: Date, default: Date.now }
      }, { strict: false }));

      const query = {
        $or: [
          { user_id: userId },
          { userEmail: userEmail },
          { user_email: userEmail }
        ]
      };

      const docs = await Notification.find(query).sort({ created_at: -1 }).limit(100).lean();
      const notifications = docs.map(doc => ({
        id: doc.notification_id || String(doc._id),
        userId: doc.user_id || doc.userId,
        userEmail: doc.user_email || doc.userEmail,
        title: doc.title,
        message: doc.message,
        type: doc.type || 'system',
        read: Boolean(doc.read),
        createdAt: doc.created_at || doc.createdAt
      }));

      return res.status(200).json({
        success: true,
        notifications,
        data: notifications
      });
    }

    // In-memory fallback
    const userNotifs = inMemoryNotifications.filter(n =>
      (n.userId && String(n.userId) === userId) ||
      (n.userEmail && n.userEmail.toLowerCase() === userEmail)
    );

    return res.status(200).json({
      success: true,
      notifications: userNotifs,
      data: userNotifs
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve notifications.'
    });
  }
});

// POST /api/notifications - Create a new notification for a user
router.post('/', authenticate, async (req, res) => {
  const { title, message, type } = req.body;
  const userId = String(req.user.id || req.user._id || '').trim();
  const userEmail = (req.user.email || '').toLowerCase().trim();

  if (!title && !message) {
    return res.status(400).json({
      success: false,
      error: 'Title or message is required.'
    });
  }

  const notificationId = req.body.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const notifType = type || 'system';

  try {
    const pool = db.getPool();
    if (pool) {
      const result = await pool.query(
        `INSERT INTO notifications (notification_id, user_id, user_email, title, message, type, read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE, CURRENT_TIMESTAMP)
         RETURNING id, notification_id, user_id, user_email, title, message, type, read, created_at`,
        [notificationId, userId, userEmail, title || 'Notification', message || '', notifType]
      );

      const row = result.rows[0];
      const created = {
        id: row.notification_id || String(row.id),
        userId: row.user_id,
        userEmail: row.user_email,
        title: row.title,
        message: row.message,
        type: row.type,
        read: Boolean(row.read),
        createdAt: row.created_at
      };

      return res.status(201).json({
        success: true,
        notification: created,
        data: created
      });
    }

    const mongoose = db.getMongoose();
    if (db.dbType === 'mongo' && mongoose) {
      const Notification = mongoose.models.Notification || mongoose.model('Notification', new mongoose.Schema({
        notification_id: String,
        user_id: String,
        user_email: String,
        title: String,
        message: String,
        type: { type: String, default: 'system' },
        read: { type: Boolean, default: false },
        created_at: { type: Date, default: Date.now }
      }, { strict: false }));

      const doc = await Notification.create({
        notification_id: notificationId,
        user_id: userId,
        user_email: userEmail,
        title: title || 'Notification',
        message: message || '',
        type: notifType,
        read: false,
        created_at: new Date()
      });

      const created = {
        id: doc.notification_id || String(doc._id),
        userId: doc.user_id,
        userEmail: doc.user_email,
        title: doc.title,
        message: doc.message,
        type: doc.type,
        read: doc.read,
        createdAt: doc.created_at
      };

      return res.status(201).json({
        success: true,
        notification: created,
        data: created
      });
    }

    // In-memory fallback
    const newNotif = {
      id: notificationId,
      userId,
      userEmail,
      title: title || 'Notification',
      message: message || '',
      type: notifType,
      read: false,
      createdAt: new Date().toISOString()
    };
    inMemoryNotifications.unshift(newNotif);

    return res.status(201).json({
      success: true,
      notification: newNotif,
      data: newNotif
    });
  } catch (err) {
    console.error('Error creating notification:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to create notification.'
    });
  }
});

// POST /api/notifications/read-all - Mark all notifications as read for current user
router.post('/read-all', authenticate, async (req, res) => {
  const userId = String(req.user.id || req.user._id || '').trim();
  const userEmail = (req.user.email || '').toLowerCase().trim();

  try {
    const pool = db.getPool();
    if (pool) {
      await pool.query(
        `UPDATE notifications SET read = TRUE
         WHERE user_id = $1 OR LOWER(user_email) = $2`,
        [userId, userEmail]
      );
      return res.status(200).json({ success: true, message: 'All notifications marked as read.' });
    }

    const mongoose = db.getMongoose();
    if (db.dbType === 'mongo' && mongoose) {
      const Notification = mongoose.models.Notification;
      if (Notification) {
        await Notification.updateMany(
          { $or: [{ user_id: userId }, { userEmail: userEmail }, { user_email: userEmail }] },
          { $set: { read: true } }
        );
      }
      return res.status(200).json({ success: true, message: 'All notifications marked as read.' });
    }

    // In-memory fallback
    inMemoryNotifications.forEach(n => {
      if ((n.userId && String(n.userId) === userId) || (n.userEmail && n.userEmail.toLowerCase() === userEmail)) {
        n.read = true;
      }
    });

    return res.status(200).json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('Error marking notifications read:', err);
    return res.status(500).json({ success: false, error: 'Failed to mark notifications as read.' });
  }
});

// POST /api/notifications/mark-read - Alias for mark-read as used in old_buy.js
router.post('/mark-read', authenticate, async (req, res) => {
  const userId = String(req.user.id || req.user._id || '').trim();
  const userEmail = (req.user.email || '').toLowerCase().trim();

  try {
    const pool = db.getPool();
    if (pool) {
      await pool.query(
        `UPDATE notifications SET read = TRUE
         WHERE user_id = $1 OR LOWER(user_email) = $2`,
        [userId, userEmail]
      );
      return res.status(200).json({ success: true, message: 'Notifications marked as read.' });
    }

    inMemoryNotifications.forEach(n => {
      if ((n.userId && String(n.userId) === userId) || (n.userEmail && n.userEmail.toLowerCase() === userEmail)) {
        n.read = true;
      }
    });

    return res.status(200).json({ success: true, message: 'Notifications marked as read.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to mark notifications as read.' });
  }
});

module.exports = router;
