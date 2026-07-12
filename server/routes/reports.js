const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/reports/fuel-efficiency
router.get('/fuel-efficiency', authenticateToken, (req, res) => {
  const db = getDb();
  const data = db.prepare(`
    SELECT v.id, v.reg_number, v.name, v.type,
      COALESCE(SUM(t.actual_distance), 0) as total_distance,
      COALESCE(SUM(t.fuel_consumed), 0) as total_fuel,
      CASE WHEN COALESCE(SUM(t.fuel_consumed), 0) > 0
        THEN ROUND(CAST(SUM(t.actual_distance) AS REAL) / SUM(t.fuel_consumed), 2)
        ELSE 0 END as efficiency
    FROM vehicles v
    LEFT JOIN trips t ON t.vehicle_id = v.id AND t.status = 'Completed'
    WHERE v.status != 'Retired'
    GROUP BY v.id
    ORDER BY efficiency DESC
  `).all();
  res.json(data);
});

// GET /api/reports/utilization
router.get('/utilization', authenticateToken, (req, res) => {
  const db = getDb();
  const data = db.prepare(`
    SELECT v.id, v.reg_number, v.name, v.type, v.status,
      (SELECT COUNT(*) FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'Completed') as completed_trips,
      (SELECT COUNT(*) FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'Dispatched') as active_trips,
      (SELECT COALESCE(SUM(t.actual_distance), 0) FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'Completed') as total_distance
    FROM vehicles v
    WHERE v.status != 'Retired'
    ORDER BY completed_trips DESC
  `).all();
  res.json(data);
});

// GET /api/reports/operational-cost
router.get('/operational-cost', authenticateToken, (req, res) => {
  const db = getDb();
  const data = db.prepare(`
    SELECT v.id, v.reg_number, v.name, v.type,
      COALESCE((SELECT SUM(f.cost) FROM fuel_logs f WHERE f.vehicle_id = v.id), 0) as fuel_cost,
      COALESCE((SELECT SUM(m.cost) FROM maintenance_logs m WHERE m.vehicle_id = v.id), 0) as maintenance_cost,
      COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.vehicle_id = v.id), 0) as expense_cost,
      COALESCE((SELECT SUM(f.cost) FROM fuel_logs f WHERE f.vehicle_id = v.id), 0) +
      COALESCE((SELECT SUM(m.cost) FROM maintenance_logs m WHERE m.vehicle_id = v.id), 0) +
      COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.vehicle_id = v.id), 0) as total_cost
    FROM vehicles v
    ORDER BY total_cost DESC
  `).all();
  res.json(data);
});

// GET /api/reports/roi
router.get('/roi', authenticateToken, (req, res) => {
  const db = getDb();
  const data = db.prepare(`
    SELECT v.id, v.reg_number, v.name, v.type, v.acquisition_cost,
      COALESCE((SELECT SUM(t.revenue) FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'Completed'), 0) as total_revenue,
      COALESCE((SELECT SUM(m.cost) FROM maintenance_logs m WHERE m.vehicle_id = v.id), 0) as maintenance_cost,
      COALESCE((SELECT SUM(f.cost) FROM fuel_logs f WHERE f.vehicle_id = v.id), 0) as fuel_cost,
      CASE WHEN v.acquisition_cost > 0
        THEN ROUND(
          (COALESCE((SELECT SUM(t.revenue) FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'Completed'), 0)
           - COALESCE((SELECT SUM(m.cost) FROM maintenance_logs m WHERE m.vehicle_id = v.id), 0)
           - COALESCE((SELECT SUM(f.cost) FROM fuel_logs f WHERE f.vehicle_id = v.id), 0)
          ) * 100.0 / v.acquisition_cost, 2)
        ELSE 0 END as roi_percent
    FROM vehicles v
    WHERE v.status != 'Retired'
    ORDER BY roi_percent DESC
  `).all();
  res.json(data);
});

// GET /api/reports/export.csv
router.get('/export.csv', authenticateToken, (req, res) => {
  const db = getDb();
  const { type } = req.query;

  let rows = [];
  let headers = [];

  switch (type) {
    case 'fuel-efficiency': {
      headers = ['Vehicle', 'Reg Number', 'Type', 'Total Distance (km)', 'Total Fuel (L)', 'Efficiency (km/L)'];
      const data = db.prepare(`
        SELECT v.name, v.reg_number, v.type,
          COALESCE(SUM(t.actual_distance), 0) as dist,
          COALESCE(SUM(t.fuel_consumed), 0) as fuel,
          CASE WHEN COALESCE(SUM(t.fuel_consumed), 0) > 0
            THEN ROUND(CAST(SUM(t.actual_distance) AS REAL) / SUM(t.fuel_consumed), 2) ELSE 0 END as eff
        FROM vehicles v LEFT JOIN trips t ON t.vehicle_id = v.id AND t.status = 'Completed'
        GROUP BY v.id ORDER BY eff DESC
      `).all();
      rows = data.map(r => [r.name, r.reg_number, r.type, r.dist, r.fuel, r.eff]);
      break;
    }
    case 'utilization': {
      headers = ['Vehicle', 'Reg Number', 'Type', 'Status', 'Completed Trips', 'Total Distance (km)'];
      const data = db.prepare(`
        SELECT v.name, v.reg_number, v.type, v.status,
          (SELECT COUNT(*) FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'Completed') as ct,
          (SELECT COALESCE(SUM(t.actual_distance), 0) FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'Completed') as dist
        FROM vehicles v ORDER BY ct DESC
      `).all();
      rows = data.map(r => [r.name, r.reg_number, r.type, r.status, r.ct, r.dist]);
      break;
    }
    case 'operational-cost': {
      headers = ['Vehicle', 'Reg Number', 'Fuel Cost', 'Maintenance Cost', 'Expenses', 'Total'];
      const data = db.prepare(`
        SELECT v.name, v.reg_number,
          COALESCE((SELECT SUM(f.cost) FROM fuel_logs f WHERE f.vehicle_id = v.id), 0) as fc,
          COALESCE((SELECT SUM(m.cost) FROM maintenance_logs m WHERE m.vehicle_id = v.id), 0) as mc,
          COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.vehicle_id = v.id), 0) as ec,
          COALESCE((SELECT SUM(f.cost) FROM fuel_logs f WHERE f.vehicle_id = v.id), 0) +
          COALESCE((SELECT SUM(m.cost) FROM maintenance_logs m WHERE m.vehicle_id = v.id), 0) +
          COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.vehicle_id = v.id), 0) as total
        FROM vehicles v ORDER BY total DESC
      `).all();
      rows = data.map(r => [r.name, r.reg_number, r.fc, r.mc, r.ec, r.total]);
      break;
    }
    case 'roi': {
      headers = ['Vehicle', 'Reg Number', 'Acquisition Cost', 'Revenue', 'Costs', 'ROI %'];
      const data = db.prepare(`
        SELECT v.name, v.reg_number, v.acquisition_cost,
          COALESCE((SELECT SUM(t.revenue) FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'Completed'), 0) as rev,
          COALESCE((SELECT SUM(m.cost) FROM maintenance_logs m WHERE m.vehicle_id = v.id), 0) +
          COALESCE((SELECT SUM(f.cost) FROM fuel_logs f WHERE f.vehicle_id = v.id), 0) as costs,
          CASE WHEN v.acquisition_cost > 0 THEN ROUND(
            (COALESCE((SELECT SUM(t.revenue) FROM trips t WHERE t.vehicle_id = v.id AND t.status = 'Completed'), 0)
             - COALESCE((SELECT SUM(m.cost) FROM maintenance_logs m WHERE m.vehicle_id = v.id), 0)
             - COALESCE((SELECT SUM(f.cost) FROM fuel_logs f WHERE f.vehicle_id = v.id), 0)) * 100.0 / v.acquisition_cost, 2)
          ELSE 0 END as roi
        FROM vehicles v ORDER BY roi DESC
      `).all();
      rows = data.map(r => [r.name, r.reg_number, r.acquisition_cost, r.rev, r.costs, r.roi]);
      break;
    }
    default:
      return res.status(400).json({ error: 'Invalid report type. Use: fuel-efficiency, utilization, operational-cost, roi' });
  }

  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=transitops_${type}_report.csv`);
  res.send(csv);
});

module.exports = router;
