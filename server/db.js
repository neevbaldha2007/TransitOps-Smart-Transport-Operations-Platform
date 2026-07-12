/**
 * TransitOps — Database Module
 * Uses sql.js (pure JS/WASM SQLite) with a compatibility wrapper
 * that mimics the better-sqlite3 API so all route files work unchanged.
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'transitops.db');

let wrappedDb = null;

/**
 * Compatibility wrapper: makes sql.js look like better-sqlite3
 * so all route code using db.prepare().run/get/all works unchanged.
 */
class SqliteCompat {
  constructor(sqlJsDb) {
    this._db = sqlJsDb;
    this._inTransaction = false;
  }

  prepare(sql) {
    const db = this._db;
    const self = this;
    return {
      run(...params) {
        db.run(sql, params);
        const lastId = db.exec("SELECT last_insert_rowid() as id");
        const lastInsertRowid = lastId.length > 0 ? lastId[0].values[0][0] : 0;
        const changes = db.getRowsModified();
        if (!self._inTransaction) {
          self._save();
        }
        return { lastInsertRowid, changes };
      },
      get(...params) {
        let stmt;
        try {
          stmt = db.prepare(sql);
          stmt.bind(params);
          if (stmt.step()) {
            return stmt.getAsObject();
          }
          return undefined;
        } finally {
          if (stmt) stmt.free();
        }
      },
      all(...params) {
        let stmt;
        try {
          stmt = db.prepare(sql);
          stmt.bind(params);
          const results = [];
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          return results;
        } finally {
          if (stmt) stmt.free();
        }
      }
    };
  }

  exec(sql) {
    this._db.exec(sql);
    if (!this._inTransaction) {
      this._save();
    }
  }

  pragma(str) {
    try {
      this._db.exec(`PRAGMA ${str}`);
    } catch (e) {
      // Some pragmas may not be supported in sql.js
    }
  }

  transaction(fn) {
    const self = this;
    return (...args) => {
      self._inTransaction = true;
      self._db.exec("BEGIN TRANSACTION");
      try {
        const result = fn(...args);
        self._db.exec("COMMIT");
        self._inTransaction = false;
        self._save();
        return result;
      } catch (err) {
        try {
          self._db.exec("ROLLBACK");
        } catch (e) {
          // Ignore rollback error if database already rolled back
        }
        self._inTransaction = false;
        throw err;
      }
    };
  }

  _save() {
    try {
      const data = this._db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (e) {
      console.error('DB save error:', e.message);
    }
  }
}

/**
 * Initialize the database (async — must be called before routes are used)
 */
async function initDb() {
  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  wrappedDb = new SqliteCompat(db);
  wrappedDb.pragma('foreign_keys = ON');
  initSchema();
  seedData();
  return wrappedDb;
}

/**
 * Get the database instance (synchronous — only call after initDb resolves)
 */
function getDb() {
  if (!wrappedDb) throw new Error('Database not initialized. Call initDb() first.');
  return wrappedDb;
}

function initSchema() {
  wrappedDb._db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('fleet_manager', 'dispatcher', 'safety_officer', 'financial_analyst', 'admin')),
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lockout_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ip TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reg_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      max_load_capacity REAL NOT NULL DEFAULT 0,
      odometer REAL NOT NULL DEFAULT 0,
      acquisition_cost REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Available' CHECK(status IN ('Available', 'On Trip', 'In Shop', 'Retired')),
      region TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      license_number TEXT UNIQUE NOT NULL,
      license_category TEXT NOT NULL DEFAULT 'B',
      license_expiry_date TEXT NOT NULL,
      contact_number TEXT DEFAULT '',
      safety_score REAL NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'Available' CHECK(status IN ('Available', 'On Trip', 'Off Duty', 'Suspended')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      destination TEXT NOT NULL,
      vehicle_id INTEGER NOT NULL,
      driver_id INTEGER NOT NULL,
      cargo_weight REAL NOT NULL DEFAULT 0,
      planned_distance REAL NOT NULL DEFAULT 0,
      actual_distance REAL DEFAULT NULL,
      fuel_consumed REAL DEFAULT NULL,
      revenue REAL DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft', 'Dispatched', 'Completed', 'Cancelled')),
      created_at TEXT DEFAULT (datetime('now')),
      dispatched_at TEXT DEFAULT NULL,
      completed_at TEXT DEFAULT NULL,
      cancelled_at TEXT DEFAULT NULL,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY (driver_id) REFERENCES drivers(id)
    );

    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open', 'Closed')),
      opened_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT DEFAULT NULL,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    );

    CREATE TABLE IF NOT EXISTS fuel_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      liters REAL NOT NULL,
      cost REAL NOT NULL,
      date TEXT NOT NULL DEFAULT (date('now')),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'other' CHECK(type IN ('toll', 'other')),
      amount REAL NOT NULL,
      date TEXT NOT NULL DEFAULT (date('now')),
      description TEXT DEFAULT '',
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    );
  `);

  // Migrate existing db if columns do not exist
  try {
    wrappedDb._db.exec("ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0");
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    wrappedDb._db.exec("ALTER TABLE users ADD COLUMN locked_until TEXT DEFAULT NULL");
  } catch (e) {
    // Column already exists, ignore
  }
}

function seedData() {
  const count = wrappedDb.prepare('SELECT COUNT(*) as count FROM users').get();
  if (count && count.count > 0) return;

  const hash = bcrypt.hashSync('password123', 10);

  const insertUser = wrappedDb.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
  insertUser.run('Rajesh Kumar', 'fleet.manager@demo.com', hash, 'fleet_manager');
  insertUser.run('Rahul Dispatcher', 'dispatcher@demo.com', hash, 'dispatcher');
  insertUser.run('Priya Safety', 'safety@demo.com', hash, 'safety_officer');
  insertUser.run('Meera Finance', 'finance@demo.com', hash, 'financial_analyst');

  const insertVehicle = wrappedDb.prepare('INSERT INTO vehicles (reg_number, name, type, max_load_capacity, odometer, acquisition_cost, status, region) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insertVehicle.run('VAN-01', 'City Runner', 'Van', 800, 45200, 2500000, 'Available', 'North');
  insertVehicle.run('VAN-02', 'Express Cargo', 'Van', 1000, 32100, 2800000, 'Available', 'South');
  insertVehicle.run('TRK-01', 'Highway King', 'Truck', 5000, 120500, 5500000, 'Available', 'East');
  insertVehicle.run('TRK-02', 'Heavy Hauler', 'Truck', 8000, 89000, 7200000, 'On Trip', 'West');
  insertVehicle.run('BUS-01', 'Metro Connect', 'Bus', 2000, 67300, 4500000, 'In Shop', 'North');
  insertVehicle.run('VAN-03', 'Swift Mover', 'Van', 600, 15800, 2200000, 'Available', 'South');

  const insertDriver = wrappedDb.prepare('INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, safety_score, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insertDriver.run('Amit Sharma', 'DL-2024-001', 'HMV', '2027-06-15', '9876543210', 95, 'Available');
  insertDriver.run('Rahul Verma', 'DL-2024-002', 'HMV', '2026-08-20', '9876543211', 88, 'Available');
  insertDriver.run('Suresh Patel', 'DL-2024-003', 'LMV', '2026-07-25', '9876543212', 72, 'On Trip');
  insertDriver.run('Deepak Singh', 'DL-2024-004', 'HMV', '2027-01-10', '9876543213', 91, 'Available');
  insertDriver.run('Vikram Rao', 'DL-2024-005', 'LMV', '2026-07-15', '9876543214', 65, 'Off Duty');

  // Seed trips
  const insertTrip = wrappedDb.prepare('INSERT INTO trips (source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, actual_distance, fuel_consumed, revenue, status, dispatched_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertTrip.run('Mumbai', 'Pune', 1, 1, 450, 150, 155, 18, 12000, 'Completed', '2026-07-01 08:00:00', '2026-07-01 14:00:00');
  insertTrip.run('Delhi', 'Jaipur', 2, 2, 700, 280, 290, 35, 22000, 'Completed', '2026-07-03 06:00:00', '2026-07-03 16:00:00');
  insertTrip.run('Chennai', 'Bangalore', 4, 3, 3500, 350, null, null, null, 'Dispatched', '2026-07-10 07:00:00', null);
  insertTrip.run('Kolkata', 'Patna', 3, 4, 2000, 600, null, null, null, 'Draft', null, null);

  // Seed maintenance
  const insertMaint = wrappedDb.prepare('INSERT INTO maintenance_logs (vehicle_id, description, cost, status, opened_at) VALUES (?, ?, ?, ?, ?)');
  insertMaint.run(5, 'Engine overhaul and brake replacement', 75000, 'Open', '2026-07-08 10:00:00');

  // Seed fuel logs
  const insertFuel = wrappedDb.prepare('INSERT INTO fuel_logs (vehicle_id, liters, cost, date) VALUES (?, ?, ?, ?)');
  insertFuel.run(1, 18, 1800, '2026-07-01');
  insertFuel.run(2, 35, 3500, '2026-07-03');
  insertFuel.run(4, 45, 4500, '2026-07-10');

  // Seed expenses
  const insertExpense = wrappedDb.prepare('INSERT INTO expenses (vehicle_id, type, amount, date, description) VALUES (?, ?, ?, ?, ?)');
  insertExpense.run(1, 'toll', 350, '2026-07-01', 'Mumbai-Pune Expressway toll');
  insertExpense.run(2, 'toll', 500, '2026-07-03', 'Delhi-Jaipur highway toll');
  insertExpense.run(1, 'other', 1200, '2026-07-02', 'Tyre repair');
}

module.exports = { initDb, getDb };
