const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { canTransitionDriver } = require('../services/stateMachine');

// GET /api/drivers — list with filters
router.get('/', authenticateToken, (req, res) => {
  const db = getDb();
  const { status, search } = req.query;
  let sql = 'SELECT * FROM drivers WHERE 1=1';
  const params = [];

  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (search) { sql += ' AND (name LIKE ? OR license_number LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  sql += ' ORDER BY id DESC';
  const drivers = db.prepare(sql).all(...params);
  res.json(drivers);
});

// GET /api/drivers/available — for trip creation (Available + license valid + not suspended)
router.get('/available', authenticateToken, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const drivers = db.prepare(
    "SELECT * FROM drivers WHERE status = 'Available' AND license_expiry_date >= ? AND status != 'Suspended' ORDER BY name"
  ).all(today);
  res.json(drivers);
});

// GET /api/drivers/:id
router.get('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });
  res.json(driver);
});

// POST /api/drivers — create
router.post('/', authenticateToken, requirePermission('drivers', 'create'), (req, res) => {
  const db = getDb();
  const { name, license_number, license_category, license_expiry_date, contact_number, safety_score } = req.body;

  if (!name || !license_number || !license_expiry_date) {
    return res.status(400).json({ error: 'name, license_number, and license_expiry_date are required' });
  }

  const existing = db.prepare('SELECT id FROM drivers WHERE license_number = ?').get(license_number);
  if (existing) {
    return res.status(409).json({ error: `Driver with license "${license_number}" already exists` });
  }

  try {
    const result = db.prepare(
      'INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, safety_score) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, license_number, license_category || 'B', license_expiry_date, contact_number || '', safety_score ?? 100);

    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(driver);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/drivers/:id — update
router.patch('/:id', authenticateToken, requirePermission('drivers', 'edit'), (req, res) => {
  const db = getDb();
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id);
  if (!driver) return res.status(404).json({ error: 'Driver not found' });

  const { name, license_number, license_category, license_expiry_date, contact_number, safety_score, status } = req.body;

  // Validate status transition
  if (status && status !== driver.status) {
    if (!canTransitionDriver(driver.status, status)) {
      return res.status(409).json({
        error: `Cannot transition driver from "${driver.status}" to "${status}"`
      });
    }
  }

  if (license_number && license_number !== driver.license_number) {
    const existing = db.prepare('SELECT id FROM drivers WHERE license_number = ? AND id != ?').get(license_number, req.params.id);
    if (existing) {
      return res.status(409).json({ error: `Driver with license "${license_number}" already exists` });
    }
  }

  try {
    db.prepare(`
      UPDATE drivers SET
        name = COALESCE(?, name),
        license_number = COALESCE(?, license_number),
        license_category = COALESCE(?, license_category),
        license_expiry_date = COALESCE(?, license_expiry_date),
        contact_number = COALESCE(?, contact_number),
        safety_score = COALESCE(?, safety_score),
        status = COALESCE(?, status)
      WHERE id = ?
    `).run(
      name || null, license_number || null, license_category || null,
      license_expiry_date || null, contact_number ?? null,
      safety_score ?? null, status || null, req.params.id
    );

    const updated = db.prepare('SELECT * FROM drivers WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
