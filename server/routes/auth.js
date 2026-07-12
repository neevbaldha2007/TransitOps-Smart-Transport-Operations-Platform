const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // 1. Check if locked_until is set and is in the future
  if (user.locked_until) {
    const lockedUntilDate = new Date(user.locked_until);
    if (lockedUntilDate > new Date()) {
      return res.status(423).json({ error: 'ACCOUNT_LOCKED', locked_until: user.locked_until });
    } else {
      // Lock has expired, reset attempts so they start fresh
      db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
      user.failed_login_attempts = 0;
      user.locked_until = null;
    }
  }

  // 2. Verify password
  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    const newAttempts = (user.failed_login_attempts || 0) + 1;
    let lockedUntil = null;

    if (newAttempts >= 5) {
      const durationMinutes = parseInt(process.env.LOCKOUT_DURATION_MINUTES) || 1;
      lockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

      // Log lockout event to the audit table (user_id, IP, timestamp)
      const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      db.prepare('INSERT INTO lockout_events (user_id, ip) VALUES (?, ?)').run(user.id, ip);
    }

    db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(newAttempts, lockedUntil, user.id);

    // Always return generic error message on wrong password attempt, even on the one that locks the account
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // 3. Reset failed login attempts and locked_until on success
  db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
