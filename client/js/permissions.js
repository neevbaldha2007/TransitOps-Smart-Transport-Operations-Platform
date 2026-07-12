// Single source of truth for role permissions and module ownership
const permissions = {
  // Roles list & human names
  roleNames: {
    fleet_manager: 'Fleet Manager',
    dispatcher: 'Dispatcher',
    safety_officer: 'Safety Officer',
    financial_analyst: 'Financial Analyst',
    admin: 'Admin'
  },
  
  // Single source of truth module ownership matrix
  ownership: {
    dashboard: 'dispatcher',
    vehicles: 'fleet_manager',
    maintenance: 'fleet_manager',
    trips: 'dispatcher',
    drivers: 'safety_officer',
    compliance: 'safety_officer',
    fuel: 'financial_analyst',
    reports: 'financial_analyst'
  },

  // Check if a role can execute an edit/write action inside a module
  canDo: function(role, module, action) {
    if (role === 'admin') return true;
    const owner = this.ownership[module];
    if (!owner) return false;
    
    // Override: Fleet Manager can cancel trips
    if (module === 'trips' && action === 'cancel' && role === 'fleet_manager') {
      return true;
    }
    
    return role === owner;
  }
};

// Check if running in Node.js or browser environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = permissions;
} else {
  window.permissions = permissions;
}
