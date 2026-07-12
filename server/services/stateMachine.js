/**
 * TransitOps State Machine
 * Single source of truth for all status transitions.
 * Encodes rules from Section 4 of the blueprint.
 */

const VEHICLE_TRANSITIONS = {
  'Available': ['On Trip', 'In Shop', 'Retired'],
  'On Trip': ['Available', 'Retired'],
  'In Shop': ['Available', 'Retired'],
  'Retired': [] // terminal state — irreversible in MVP
};

const DRIVER_TRANSITIONS = {
  'Available': ['On Trip', 'Off Duty', 'Suspended'],
  'On Trip': ['Available', 'Suspended'],
  'Off Duty': ['Available', 'Suspended'],
  'Suspended': ['Available'] // safety officer can unsuspend
};

const TRIP_TRANSITIONS = {
  'Draft': ['Dispatched'],
  'Dispatched': ['Completed', 'Cancelled'],
  'Completed': [],
  'Cancelled': []
};

function canTransitionVehicle(currentStatus, newStatus) {
  // Retired is reachable from any state
  if (newStatus === 'Retired') return true;
  const allowed = VEHICLE_TRANSITIONS[currentStatus];
  return allowed && allowed.includes(newStatus);
}

function canTransitionDriver(currentStatus, newStatus) {
  // Suspended is reachable from any state
  if (newStatus === 'Suspended') return true;
  const allowed = DRIVER_TRANSITIONS[currentStatus];
  return allowed && allowed.includes(newStatus);
}

function canTransitionTrip(currentStatus, newStatus) {
  const allowed = TRIP_TRANSITIONS[currentStatus];
  return allowed && allowed.includes(newStatus);
}

/**
 * Validates all dispatch conditions.
 * Returns { valid: true } or { valid: false, code: string, message: string }
 */
function validateDispatch(vehicle, driver, trip) {
  // 1. Vehicle must be Available
  if (vehicle.status !== 'Available') {
    return {
      valid: false,
      code: 'VEHICLE_NOT_AVAILABLE',
      message: `Vehicle ${vehicle.reg_number} is currently "${vehicle.status}" — must be "Available" to dispatch.`
    };
  }

  // 2. Driver must be Available
  if (driver.status !== 'Available') {
    return {
      valid: false,
      code: 'DRIVER_NOT_AVAILABLE',
      message: `Driver ${driver.name} is currently "${driver.status}" — must be "Available" to dispatch.`
    };
  }

  // 3. Driver license must not be expired
  const today = new Date().toISOString().split('T')[0];
  if (driver.license_expiry_date < today) {
    return {
      valid: false,
      code: 'DRIVER_LICENSE_EXPIRED',
      message: `Driver ${driver.name}'s license expired on ${driver.license_expiry_date}.`
    };
  }

  // 4. Driver must not be suspended (redundant with check 2, but explicit per spec)
  if (driver.status === 'Suspended') {
    return {
      valid: false,
      code: 'DRIVER_SUSPENDED',
      message: `Driver ${driver.name} is suspended and cannot be assigned to trips.`
    };
  }

  // 5. Cargo weight must not exceed vehicle capacity
  if (trip.cargo_weight > vehicle.max_load_capacity) {
    return {
      valid: false,
      code: 'CARGO_EXCEEDS_CAPACITY',
      message: `Cargo weight (${trip.cargo_weight} kg) exceeds vehicle capacity (${vehicle.max_load_capacity} kg).`
    };
  }

  return { valid: true };
}

module.exports = {
  VEHICLE_TRANSITIONS,
  DRIVER_TRANSITIONS,
  TRIP_TRANSITIONS,
  canTransitionVehicle,
  canTransitionDriver,
  canTransitionTrip,
  validateDispatch
};
