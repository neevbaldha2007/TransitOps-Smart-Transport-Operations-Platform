const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/dashboard/filters
router.get('/filters', authenticateToken, (req, res) => {
  const db = getDb();
  try {
    const types = db.prepare("SELECT DISTINCT type FROM vehicles WHERE type IS NOT NULL AND type != '' ORDER BY type").all().map(r => r.type);
    const regions = db.prepare("SELECT DISTINCT region FROM vehicles WHERE region IS NOT NULL AND region != '' ORDER BY region").all().map(r => r.region);
    res.json({ types, regions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/kpis
router.get('/kpis', authenticateToken, (req, res) => {
  const db = getDb();
  const { vehicle_type, status, region } = req.query;

  // 1. Vehicles Filter builder
  let vehicleFilter = "WHERE 1=1";
  const vParams = [];
  if (vehicle_type) { vehicleFilter += ' AND type = ?'; vParams.push(vehicle_type); }
  if (region) { vehicleFilter += ' AND region = ?'; vParams.push(region); }
  if (status) { vehicleFilter += ' AND status = ?'; vParams.push(status); }

  const getVehicleCount = (extraCond) => {
    let sql = `SELECT COUNT(*) as count FROM vehicles ${vehicleFilter}`;
    if (extraCond) sql += ` AND ${extraCond}`;
    return db.prepare(sql).get(...vParams).count;
  };

  const totalActive = getVehicleCount("status != 'Retired'");
  const available = getVehicleCount("status = 'Available'");
  const onTrip = getVehicleCount("status = 'On Trip'");
  const inShop = getVehicleCount("status = 'In Shop'");
  const retired = getVehicleCount("status = 'Retired'");

  // Fleet Utilization based on filtered subset
  const utilization = totalActive > 0 ? Math.round((onTrip / totalActive) * 100) : 0;

  // 2. Trips Filter builder (Trips using vehicles matching the filter)
  let tripFilter = "WHERE 1=1";
  const tParams = [];
  if (vehicle_type || region || status) {
    tripFilter += " AND vehicle_id IN (SELECT id FROM vehicles WHERE 1=1";
    if (vehicle_type) { tripFilter += " AND type = ?"; tParams.push(vehicle_type); }
    if (region) { tripFilter += " AND region = ?"; tParams.push(region); }
    if (status) { tripFilter += " AND status = ?"; tParams.push(status); }
    tripFilter += ")";
  }

  const getTripCount = (extraCond) => {
    let sql = `SELECT COUNT(*) as count FROM trips ${tripFilter}`;
    if (extraCond) sql += ` AND ${extraCond}`;
    return db.prepare(sql).get(...tParams).count;
  };

  const activeTrips = getTripCount("status = 'Dispatched'");
  const pendingTrips = getTripCount("status = 'Draft'");
  const completedTrips = getTripCount("status = 'Completed'");
  const totalTrips = getTripCount();

  // 3. Drivers Filter builder
  // Drivers on duty are filtered to those driving vehicles matching the filter.
  // Other driver counts are global as they aren't bound to vehicles in the schema.
  let driversOnDutySql = `SELECT COUNT(DISTINCT driver_id) as count FROM trips WHERE status = 'Dispatched'`;
  const dParams = [];
  if (vehicle_type || region || status) {
    driversOnDutySql += " AND vehicle_id IN (SELECT id FROM vehicles WHERE 1=1";
    if (vehicle_type) { driversOnDutySql += " AND type = ?"; dParams.push(vehicle_type); }
    if (region) { driversOnDutySql += " AND region = ?"; dParams.push(region); }
    if (status) { driversOnDutySql += " AND status = ?"; dParams.push(status); }
    driversOnDutySql += ")";
  }

  const driversOnDuty = db.prepare(driversOnDutySql).get(...dParams).count;
  const totalDrivers = db.prepare('SELECT COUNT(*) as count FROM drivers').get().count;
  const availableDrivers = db.prepare("SELECT COUNT(*) as count FROM drivers WHERE status = 'Available'").get().count;
  const suspendedDrivers = db.prepare("SELECT COUNT(*) as count FROM drivers WHERE status = 'Suspended'").get().count;

  // 4. Financial KPIs Filter builder
  let fFilter = "WHERE 1=1";
  const fParams = [];
  if (vehicle_type || region || status) {
    fFilter += " AND vehicle_id IN (SELECT id FROM vehicles WHERE 1=1";
    if (vehicle_type) { fFilter += " AND type = ?"; fParams.push(vehicle_type); }
    if (region) { fFilter += " AND region = ?"; fParams.push(region); }
    if (status) { fFilter += " AND status = ?"; fParams.push(status); }
    fFilter += ")";
  }

  const totalFuelCost = db.prepare(`SELECT COALESCE(SUM(cost), 0) as total FROM fuel_logs ${fFilter}`).get(...fParams).total;
  const totalMaintenanceCost = db.prepare(`SELECT COALESCE(SUM(cost), 0) as total FROM maintenance_logs ${fFilter}`).get(...fParams).total;
  const totalExpenses = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses ${fFilter}`).get(...fParams).total;

  let completedTripsFilter = "WHERE status = 'Completed'";
  const ctParams = [];
  if (vehicle_type || region || status) {
    completedTripsFilter += " AND vehicle_id IN (SELECT id FROM vehicles WHERE 1=1";
    if (vehicle_type) { completedTripsFilter += " AND type = ?"; ctParams.push(vehicle_type); }
    if (region) { completedTripsFilter += " AND region = ?"; ctParams.push(region); }
    if (status) { completedTripsFilter += " AND status = ?"; ctParams.push(status); }
    completedTripsFilter += ")";
  }

  const totalRevenue = db.prepare(`SELECT COALESCE(SUM(revenue), 0) as total FROM trips ${completedTripsFilter}`).get(...ctParams).total;
  const totalDistance = db.prepare(`SELECT COALESCE(SUM(actual_distance), 0) as total FROM trips ${completedTripsFilter}`).get(...ctParams).total;
  const totalFuelConsumed = db.prepare(`SELECT COALESCE(SUM(fuel_consumed), 0) as total FROM trips ${completedTripsFilter}`).get(...ctParams).total;

  const fuelEfficiency = totalFuelConsumed > 0 ? (totalDistance / totalFuelConsumed).toFixed(2) : 0;

  // License expiry is global
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const expiringLicenses = db.prepare(
    'SELECT COUNT(*) as count FROM drivers WHERE license_expiry_date BETWEEN ? AND ?'
  ).get(today, thirtyDaysLater).count;

  // Cost breakdown
  const costBreakdown = {
    fuel: totalFuelCost,
    maintenance: totalMaintenanceCost,
    tolls: db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses ${fFilter} AND type = 'toll'`).get(...fParams).total,
    other: db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses ${fFilter} AND type = 'other'`).get(...fParams).total
  };

  // Distributions
  let distFilter = "WHERE status != 'Retired'";
  const dDistParams = [];
  if (vehicle_type) { distFilter += ' AND type = ?'; dDistParams.push(vehicle_type); }
  if (region) { distFilter += ' AND region = ?'; dDistParams.push(region); }
  if (status) { distFilter += ' AND status = ?'; dDistParams.push(status); }

  const vehicleTypes = db.prepare(`SELECT type, COUNT(*) as count FROM vehicles ${distFilter} GROUP BY type`).all(...dDistParams);
  const regionDist = db.prepare(`SELECT region, COUNT(*) as count FROM vehicles ${distFilter} AND region != '' GROUP BY region`).all(...dDistParams);

  res.json({
    vehicles: { totalActive, available, onTrip, inShop, retired },
    utilization,
    trips: { active: activeTrips, pending: pendingTrips, completed: completedTrips, total: totalTrips },
    drivers: { total: totalDrivers, onDuty: driversOnDuty, available: availableDrivers, suspended: suspendedDrivers },
    financial: {
      totalRevenue, totalFuelCost, totalMaintenanceCost, totalExpenses,
      operationalCost: totalFuelCost + totalMaintenanceCost + totalExpenses,
      fuelEfficiency
    },
    expiringLicenses,
    costBreakdown,
    vehicleTypes,
    regionDistribution: regionDist
  });
});

module.exports = router;
