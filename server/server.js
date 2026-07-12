const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'client')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/trips', require('./routes/trips'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api', require('./routes/fuel'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reports', require('./routes/reports'));

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
  }
});

// Initialize DB (async) then start server
async function start() {
  try {
    await initDb();
    console.log('Database initialized with seed data.');

    app.listen(PORT, () => {
      console.log(`
  ╔══════════════════════════════════════════════╗
  ║        TransitOps Platform Started           ║
  ║   http://localhost:${PORT}                      ║
  ╠══════════════════════════════════════════════╣
  ║  Demo Accounts:                              ║
  ║  fleet.manager@demo.com  (Fleet Manager)     ║
  ║  dispatcher@demo.com     (Dispatcher)        ║
  ║  safety@demo.com         (Safety Officer)    ║
  ║  finance@demo.com        (Financial Analyst) ║
  ║  Password: password123                       ║
  ╚══════════════════════════════════════════════╝
      `);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
