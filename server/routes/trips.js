const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { validateDispatch, canTransitionTrip } = require('../services/stateMachine');

// GET /api/trips — list with filters
router.get('/', authenticateToken, (req, res) => {
  const db = getDb();
  const { status, driver_id, vehicle_id } = req.query;
  let sql = `
    SELECT t.*, v.reg_number as vehicle_reg, v.name as vehicle_name, d.name as driver_name
    FROM trips t
    LEFT JOIN vehicles v ON t.vehicle_id = v.id
    LEFT JOIN drivers d ON t.driver_id = d.id
    WHERE 1=1
  `;
  const params = [];

  if (status) { sql += ' AND t.status = ?'; params.push(status); }
  if (driver_id) { sql += ' AND t.driver_id = ?'; params.push(driver_id); }
  if (vehicle_id) { sql += ' AND t.vehicle_id = ?'; params.push(vehicle_id); }

  sql += ' ORDER BY t.id DESC';
  const trips = db.prepare(sql).all(...params);
  res.json(trips);
});

// GET /api/trips/:id
router.get('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const trip = db.prepare(`
    SELECT t.*, v.reg_number as vehicle_reg, v.name as vehicle_name, v.max_load_capacity,
           d.name as driver_name, d.license_expiry_date
    FROM trips t
    LEFT JOIN vehicles v ON t.vehicle_id = v.id
    LEFT JOIN drivers d ON t.driver_id = d.id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(trip);
});

// POST /api/trips — create Draft
router.post('/', authenticateToken, requirePermission('trips', 'create'), (req, res) => {
  const db = getDb();
  const { source, destination, vehicle_id, driver_id, cargo_weight, planned_distance } = req.body;

  if (!source || !destination || !vehicle_id || !driver_id) {
    return res.status(400).json({ error: 'source, destination, vehicle_id, and driver_id are required' });
  }

  try {
    const result = db.prepare(
      'INSERT INTO trips (source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(source, destination, vehicle_id, driver_id, cargo_weight || 0, planned_distance || 0, 'Draft');

    const trip = db.prepare(`
      SELECT t.*, v.reg_number as vehicle_reg, v.name as vehicle_name, d.name as driver_name
      FROM trips t
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN drivers d ON t.driver_id = d.id
      WHERE t.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(trip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips/:id/dispatch — runs full validation gate
router.post('/:id/dispatch', authenticateToken, requirePermission('trips', 'dispatch'), (req, res) => {
  const db = getDb();
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  if (!canTransitionTrip(trip.status, 'Dispatched')) {
    return res.status(409).json({ error: `Cannot dispatch a trip with status "${trip.status}"` });
  }

  // Re-fetch vehicle and driver inside transaction for race-condition safety
  const dispatchTransaction = db.transaction(() => {
    const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(trip.vehicle_id);
    const driver = db.prepare('SELECT * FROM drivers WHERE id = ?').get(trip.driver_id);

    if (!vehicle) throw { status: 404, error: 'Vehicle not found' };
    if (!driver) throw { status: 404, error: 'Driver not found' };

    // Run all 5 validation checks
    const validation = validateDispatch(vehicle, driver, trip);
    if (!validation.valid) {
      throw { status: 409, code: validation.code, error: validation.message };
    }

    // All checks pass — update statuses atomically
    const now = new Date().toISOString();
    db.prepare("UPDATE trips SET status = 'Dispatched', dispatched_at = ? WHERE id = ?").run(now, trip.id);
    db.prepare("UPDATE vehicles SET status = 'On Trip' WHERE id = ?").run(vehicle.id);
    db.prepare("UPDATE drivers SET status = 'On Trip' WHERE id = ?").run(driver.id);

    return db.prepare(`
      SELECT t.*, v.reg_number as vehicle_reg, v.name as vehicle_name, d.name as driver_name
      FROM trips t
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN drivers d ON t.driver_id = d.id
      WHERE t.id = ?
    `).get(trip.id);
  });

  try {
    const result = dispatchTransaction();
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.error || err.message, code: err.code });
  }
});

// POST /api/trips/:id/complete
router.post('/:id/complete', authenticateToken, requirePermission('trips', 'complete'), (req, res) => {
  const db = getDb();
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  if (!canTransitionTrip(trip.status, 'Completed')) {
    return res.status(409).json({ error: `Cannot complete a trip with status "${trip.status}"` });
  }

  const { actual_distance, fuel_consumed, revenue } = req.body;

  const completeTransaction = db.transaction(() => {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE trips SET status = 'Completed', completed_at = ?,
        actual_distance = ?, fuel_consumed = ?, revenue = ?
      WHERE id = ?
    `).run(now, actual_distance || 0, fuel_consumed || 0, revenue || 0, trip.id);

    // Restore vehicle and driver to Available
    db.prepare("UPDATE vehicles SET status = 'Available' WHERE id = ?").run(trip.vehicle_id);
    db.prepare("UPDATE drivers SET status = 'Available' WHERE id = ?").run(trip.driver_id);

    // Update vehicle odometer
    if (actual_distance) {
      db.prepare('UPDATE vehicles SET odometer = odometer + ? WHERE id = ?').run(actual_distance, trip.vehicle_id);
    }

    // Auto-create fuel log if fuel data provided
    if (fuel_consumed && fuel_consumed > 0) {
      const fuelCost = fuel_consumed * 100; // ~₹100/liter estimate
      db.prepare('INSERT INTO fuel_logs (vehicle_id, liters, cost, date) VALUES (?, ?, ?, date(?))').run(
        trip.vehicle_id, fuel_consumed, fuelCost, now
      );
    }

    return db.prepare(`
      SELECT t.*, v.reg_number as vehicle_reg, v.name as vehicle_name, d.name as driver_name
      FROM trips t LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN drivers d ON t.driver_id = d.id WHERE t.id = ?
    `).get(trip.id);
  });

  try {
    const result = completeTransaction();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips/:id/cancel
router.post('/:id/cancel', authenticateToken, requirePermission('trips', 'cancel'), (req, res) => {
  const db = getDb();
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });

  if (!canTransitionTrip(trip.status, 'Cancelled')) {
    return res.status(409).json({ error: `Cannot cancel a trip with status "${trip.status}"` });
  }

  const cancelTransaction = db.transaction(() => {
    const now = new Date().toISOString();
    db.prepare("UPDATE trips SET status = 'Cancelled', cancelled_at = ? WHERE id = ?").run(now, trip.id);

    // Restore vehicle and driver to Available (only if they were On Trip from this trip)
    db.prepare("UPDATE vehicles SET status = 'Available' WHERE id = ? AND status = 'On Trip'").run(trip.vehicle_id);
    db.prepare("UPDATE drivers SET status = 'Available' WHERE id = ? AND status = 'On Trip'").run(trip.driver_id);

    return db.prepare(`
      SELECT t.*, v.reg_number as vehicle_reg, v.name as vehicle_name, d.name as driver_name
      FROM trips t LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN drivers d ON t.driver_id = d.id WHERE t.id = ?
    `).get(trip.id);
  });

  try {
    const result = cancelTransaction();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
