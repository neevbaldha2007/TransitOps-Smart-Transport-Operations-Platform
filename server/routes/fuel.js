const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');

// ========== FUEL LOGS ==========

// GET /api/fuel-logs
router.get('/fuel-logs', authenticateToken, (req, res) => {
  const db = getDb();
  const { vehicle_id } = req.query;
  let sql = `
    SELECT f.*, v.reg_number as vehicle_reg, v.name as vehicle_name
    FROM fuel_logs f LEFT JOIN vehicles v ON f.vehicle_id = v.id WHERE 1=1
  `;
  const params = [];
  if (vehicle_id) { sql += ' AND f.vehicle_id = ?'; params.push(vehicle_id); }
  sql += ' ORDER BY f.date DESC, f.id DESC';

  res.json(db.prepare(sql).all(...params));
});

// POST /api/fuel-logs
router.post('/fuel-logs', authenticateToken, requirePermission('fuel', 'create'), (req, res) => {
  const db = getDb();
  const { vehicle_id, liters, cost, date } = req.body;

  if (!vehicle_id || !liters || !cost) {
    return res.status(400).json({ error: 'vehicle_id, liters, and cost are required' });
  }

  try {
    const result = db.prepare(
      'INSERT INTO fuel_logs (vehicle_id, liters, cost, date) VALUES (?, ?, ?, ?)'
    ).run(vehicle_id, liters, cost, date || new Date().toISOString().split('T')[0]);

    const log = db.prepare(`
      SELECT f.*, v.reg_number as vehicle_reg FROM fuel_logs f
      LEFT JOIN vehicles v ON f.vehicle_id = v.id WHERE f.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========== EXPENSES ==========

// GET /api/expenses
router.get('/expenses', authenticateToken, (req, res) => {
  const db = getDb();
  const { vehicle_id, type } = req.query;
  let sql = `
    SELECT e.*, v.reg_number as vehicle_reg, v.name as vehicle_name
    FROM expenses e LEFT JOIN vehicles v ON e.vehicle_id = v.id WHERE 1=1
  `;
  const params = [];
  if (vehicle_id) { sql += ' AND e.vehicle_id = ?'; params.push(vehicle_id); }
  if (type) { sql += ' AND e.type = ?'; params.push(type); }
  sql += ' ORDER BY e.date DESC, e.id DESC';

  res.json(db.prepare(sql).all(...params));
});

// POST /api/expenses
router.post('/expenses', authenticateToken, requirePermission('fuel', 'create'), (req, res) => {
  const db = getDb();
  const { vehicle_id, type, amount, date, description } = req.body;

  if (!vehicle_id || !amount) {
    return res.status(400).json({ error: 'vehicle_id and amount are required' });
  }

  try {
    const result = db.prepare(
      'INSERT INTO expenses (vehicle_id, type, amount, date, description) VALUES (?, ?, ?, ?, ?)'
    ).run(vehicle_id, type || 'other', amount, date || new Date().toISOString().split('T')[0], description || '');

    const expense = db.prepare(`
      SELECT e.*, v.reg_number as vehicle_reg FROM expenses e
      LEFT JOIN vehicles v ON e.vehicle_id = v.id WHERE e.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(expense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
