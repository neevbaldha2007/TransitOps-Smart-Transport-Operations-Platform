const jwt = require('jsonwebtoken');
const permissions = require('../../client/js/permissions');

const JWT_SECRET = process.env.JWT_SECRET || 'transitops-secret-key-2026';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: `Access denied. Required roles: ${roles.join(', ')}` });
    }
    next();
  };
}

function requirePermission(moduleName, action) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!permissions.canDo(req.user.role, moduleName, action)) {
      const ownerRoleKey = permissions.ownership[moduleName];
      const ownerRoleLabel = permissions.roleNames[ownerRoleKey] || 'authorized role';
      return res.status(403).json({ error: `Access denied. Only ${ownerRoleLabel} can edit this.` });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole, requirePermission, JWT_SECRET };
