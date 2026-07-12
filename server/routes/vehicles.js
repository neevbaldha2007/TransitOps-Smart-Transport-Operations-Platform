const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { canTransitionVehicle } = require('../services/stateMachine');

// GET /api/vehicles — list with filters
router.get('/', authenticateToken, (req, res) => {
  const db = getDb();
  const { status, type, region, search } = req.query;
  let sql = 'SELECT * FROM vehicles WHERE 1=1';
  const params = [];

  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (region) { sql += ' AND region = ?'; params.push(region); }
  if (search) { sql += ' AND (reg_number LIKE ? OR name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  sql += ' ORDER BY id DESC';
  const vehicles = db.prepare(sql).all(...params);
  res.json(vehicles);
});

// GET /api/vehicles/available — for trip creation dropdown
router.get('/available', authenticateToken, (req, res) => {
  const db = getDb();
  const vehicles = db.prepare("SELECT * FROM vehicles WHERE status = 'Available' ORDER BY reg_number").all();
  res.json(vehicles);
});

// GET /api/vehicles/:id
router.get('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
  res.json(vehicle);
});

// POST /api/vehicles — create
router.post('/', authenticateToken, requirePermission('vehicles', 'create'), (req, res) => {
  const db = getDb();
  const { reg_number, name, type, max_load_capacity, odometer, acquisition_cost, region } = req.body;

  if (!reg_number || !name || !type) {
    return res.status(400).json({ error: 'reg_number, name, and type are required' });
  }

  // Check unique reg_number
  const existing = db.prepare('SELECT id FROM vehicles WHERE reg_number = ?').get(reg_number);
  if (existing) {
    return res.status(409).json({ error: `Vehicle with reg_number "${reg_number}" already exists` });
  }

  try {
    const result = db.prepare(
      'INSERT INTO vehicles (reg_number, name, type, max_load_capacity, odometer, acquisition_cost, region) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(reg_number, name, type, max_load_capacity || 0, odometer || 0, acquisition_cost || 0, region || '');

    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(vehicle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/vehicles/:id — update
router.patch('/:id', authenticateToken, requirePermission('vehicles', 'edit'), (req, res) => {
  const db = getDb();
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

  const { reg_number, name, type, max_load_capacity, odometer, acquisition_cost, status, region } = req.body;

  // If status change requested, validate transition
  if (status && status !== vehicle.status) {
    if (!canTransitionVehicle(vehicle.status, status)) {
      return res.status(409).json({
        error: `Cannot transition vehicle from "${vehicle.status}" to "${status}"`
      });
    }
  }

  // Check unique reg_number if changed
  if (reg_number && reg_number !== vehicle.reg_number) {
    const existing = db.prepare('SELECT id FROM vehicles WHERE reg_number = ? AND id != ?').get(reg_number, req.params.id);
    if (existing) {
      return res.status(409).json({ error: `Vehicle with reg_number "${reg_number}" already exists` });
    }
  }

  try {
    db.prepare(`
      UPDATE vehicles SET
        reg_number = COALESCE(?, reg_number),
        name = COALESCE(?, name),
        type = COALESCE(?, type),
        max_load_capacity = COALESCE(?, max_load_capacity),
        odometer = COALESCE(?, odometer),
        acquisition_cost = COALESCE(?, acquisition_cost),
        status = COALESCE(?, status),
        region = COALESCE(?, region)
      WHERE id = ?
    `).run(
      reg_number || null, name || null, type || null,
      max_load_capacity ?? null, odometer ?? null, acquisition_cost ?? null,
      status || null, region ?? null, req.params.id
    );

    const updated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
