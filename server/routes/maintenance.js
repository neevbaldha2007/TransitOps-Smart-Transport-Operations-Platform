const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');

// GET /api/maintenance — list all
router.get('/', authenticateToken, (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let sql = `
    SELECT m.*, v.reg_number as vehicle_reg, v.name as vehicle_name
    FROM maintenance_logs m
    LEFT JOIN vehicles v ON m.vehicle_id = v.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND m.status = ?'; params.push(status); }
  sql += ' ORDER BY m.id DESC';

  const logs = db.prepare(sql).all(...params);
  res.json(logs);
});

// POST /api/maintenance — open new maintenance (sets vehicle In Shop)
router.post('/', authenticateToken, requirePermission('maintenance', 'open'), (req, res) => {
  const db = getDb();
  const { vehicle_id, description, cost } = req.body;

  if (!vehicle_id || !description) {
    return res.status(400).json({ error: 'vehicle_id and description are required' });
  }

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

  if (vehicle.status === 'Retired') {
    return res.status(409).json({ error: 'Cannot open maintenance for a retired vehicle' });
  }
  if (vehicle.status === 'On Trip') {
    return res.status(409).json({ error: 'Cannot open maintenance for a vehicle currently on trip' });
  }

  const openTransaction = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO maintenance_logs (vehicle_id, description, cost, status) VALUES (?, ?, ?, ?)'
    ).run(vehicle_id, description, cost || 0, 'Open');

    // Set vehicle to In Shop
    db.prepare("UPDATE vehicles SET status = 'In Shop' WHERE id = ?").run(vehicle_id);

    return db.prepare(`
      SELECT m.*, v.reg_number as vehicle_reg, v.name as vehicle_name
      FROM maintenance_logs m LEFT JOIN vehicles v ON m.vehicle_id = v.id
      WHERE m.id = ?
    `).get(result.lastInsertRowid);
  });

  try {
    const result = openTransaction();
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/maintenance/:id/close — close maintenance (restore vehicle unless Retired)
router.post('/:id/close', authenticateToken, requirePermission('maintenance', 'close'), (req, res) => {
  const db = getDb();
  const log = db.prepare('SELECT * FROM maintenance_logs WHERE id = ?').get(req.params.id);
  if (!log) return res.status(404).json({ error: 'Maintenance log not found' });

  if (log.status === 'Closed') {
    return res.status(409).json({ error: 'Maintenance log is already closed' });
  }

  const { cost } = req.body;

  const closeTransaction = db.transaction(() => {
    const now = new Date().toISOString();
    db.prepare("UPDATE maintenance_logs SET status = 'Closed', closed_at = ?, cost = COALESCE(?, cost) WHERE id = ?")
      .run(now, cost ?? null, log.id);

    // Check if vehicle was separately retired — don't restore if so
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(log.vehicle_id);
    if (vehicle && vehicle.status === 'In Shop') {
      // Only restore to Available if currently In Shop (not Retired)
      db.prepare("UPDATE vehicles SET status = 'Available' WHERE id = ?").run(log.vehicle_id);
    }

    return db.prepare(`
      SELECT m.*, v.reg_number as vehicle_reg, v.name as vehicle_name
      FROM maintenance_logs m LEFT JOIN vehicles v ON m.vehicle_id = v.id
      WHERE m.id = ?
    `).get(log.id);
  });

  try {
    const result = closeTransaction();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
