/* ============================================
   TransitOps — Trips Page
   ============================================ */

async function renderTrips() {
  const content = document.getElementById('page-content');

  try {
    const trips = await api('/trips');

    const draft = trips.filter(t => t.status === 'Draft');
    const dispatched = trips.filter(t => t.status === 'Dispatched');
    const completed = trips.filter(t => t.status === 'Completed');
    const cancelled = trips.filter(t => t.status === 'Cancelled');

    content.innerHTML = `
      <div class="card-header" style="margin-bottom:16px;">
        <div class="filter-bar" style="margin-bottom:0;">
          <select id="trip-filter-status" onchange="filterTrips()">
            <option value="">All Status</option>
            <option value="Draft">Draft</option>
            <option value="Dispatched">Dispatched</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
        ${permGate('trips', 'create', `
          <button class="btn btn-primary" onclick="openTripModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            New Trip
          </button>
        `)}
      </div>

      <!-- Status Summary -->
      <div class="kpi-grid" style="margin-bottom:20px;">
        <div class="kpi-card" style="padding:14px 18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:0.8rem;color:var(--text-muted);">Draft</span>
            <span class="badge badge-draft">${draft.length}</span>
          </div>
        </div>
        <div class="kpi-card" style="padding:14px 18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:0.8rem;color:var(--text-muted);">Dispatched</span>
            <span class="badge badge-dispatched">${dispatched.length}</span>
          </div>
        </div>
        <div class="kpi-card" style="padding:14px 18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:0.8rem;color:var(--text-muted);">Completed</span>
            <span class="badge badge-completed">${completed.length}</span>
          </div>
        </div>
        <div class="kpi-card" style="padding:14px 18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:0.8rem;color:var(--text-muted);">Cancelled</span>
            <span class="badge badge-cancelled">${cancelled.length}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="table-wrapper">
          <table id="trips-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Route</th>
                <th>Vehicle</th>
                <th>Driver</th>
                <th>Cargo (kg)</th>
                <th>Distance (km)</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${trips.length === 0 ? `
                <tr><td colspan="9" class="text-center" style="padding:40px;color:var(--text-muted);">No trips found</td></tr>
              ` : trips.map(t => `
                <tr>
                  <td><strong>#${t.id}</strong></td>
                  <td>${t.source} → ${t.destination}</td>
                  <td>${t.vehicle_reg || '—'}</td>
                  <td>${t.driver_name || '—'}</td>
                  <td>${formatNumber(t.cargo_weight)}</td>
                  <td>${t.actual_distance ? formatNumber(t.actual_distance) : formatNumber(t.planned_distance) + ' (plan)'}</td>
                  <td>${statusBadge(t.status)}</td>
                  <td>${formatDateTime(t.created_at)}</td>
                    <td>
                      <div class="hover-actions-wrapper">
                        ${t.status === 'Draft' ? permGate('trips', 'dispatch', `<button class="btn btn-primary btn-sm" onclick="dispatchTrip(${t.id})" aria-label="Dispatch trip">Dispatch</button>`) : ''}
                        ${t.status === 'Dispatched' ? permGate('trips', 'complete', `<button class="btn btn-success btn-sm" onclick="openCompleteTrip(${t.id})" aria-label="Complete trip">Complete</button>`) : ''}
                        ${t.status === 'Dispatched' ? permGate('trips', 'cancel', `<button class="btn btn-danger btn-sm" onclick="cancelTrip(${t.id})" aria-label="Cancel trip">Cancel</button>`) : ''}
                      </div>
                    </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><h3>Failed to load trips</h3><p>${err.error || ''}</p></div>`;
  }
}

async function filterTrips() {
  const status = document.getElementById('trip-filter-status').value;
  try {
    const trips = await api('/trips' + (status ? `?status=${status}` : ''));
    const tbody = document.querySelector('#trips-table tbody');
    tbody.innerHTML = trips.length === 0 ? `
      <tr><td colspan="9" class="text-center" style="padding:40px;color:var(--text-muted);">No trips found</td></tr>
    ` : trips.map(t => `
      <tr>
        <td><strong>#${t.id}</strong></td>
        <td>${t.source} → ${t.destination}</td>
        <td>${t.vehicle_reg || '—'}</td>
        <td>${t.driver_name || '—'}</td>
        <td>${formatNumber(t.cargo_weight)}</td>
        <td>${t.actual_distance ? formatNumber(t.actual_distance) : formatNumber(t.planned_distance) + ' (plan)'}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${formatDateTime(t.created_at)}</td>
          <td>
            <div class="hover-actions-wrapper">
              ${t.status === 'Draft' ? permGate('trips', 'dispatch', `<button class="btn btn-primary btn-sm" onclick="dispatchTrip(${t.id})" aria-label="Dispatch trip">Dispatch</button>`) : ''}
              ${t.status === 'Dispatched' ? permGate('trips', 'complete', `<button class="btn btn-success btn-sm" onclick="openCompleteTrip(${t.id})" aria-label="Complete trip">Complete</button>`) : ''}
              ${t.status === 'Dispatched' ? permGate('trips', 'cancel', `<button class="btn btn-danger btn-sm" onclick="cancelTrip(${t.id})" aria-label="Cancel trip">Cancel</button>`) : ''}
            </div>
          </td>
      </tr>
    `).join('');
  } catch (err) { showToast(err.error || 'Filter failed', 'error'); }
}

async function openTripModal() {
  try {
    const [vehicles, drivers] = await Promise.all([
      api('/vehicles/available'),
      api('/drivers/available')
    ]);

    if (vehicles.length === 0) {
      showToast('No available vehicles for dispatch', 'warning');
      return;
    }
    if (drivers.length === 0) {
      showToast('No available drivers for dispatch', 'warning');
      return;
    }

    openModal('Create New Trip', `
      <form id="trip-form">
        <div class="form-row">
          <div class="form-group">
            <label>Source *</label>
            <input type="text" id="tf-source" required placeholder="e.g. Mumbai">
          </div>
          <div class="form-group">
            <label>Destination *</label>
            <input type="text" id="tf-dest" required placeholder="e.g. Pune">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Vehicle *</label>
            <select id="tf-vehicle" required>
              <option value="">Select Vehicle</option>
              ${vehicles.map(v => `<option value="${v.id}">${v.reg_number} — ${v.name} (${v.max_load_capacity}kg)</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Driver *</label>
            <select id="tf-driver" required>
              <option value="">Select Driver</option>
              ${drivers.map(d => `<option value="${d.id}">${d.name} (${d.license_category})</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Cargo Weight (kg)</label>
            <input type="number" id="tf-cargo" min="0" value="0" placeholder="e.g. 450">
          </div>
          <div class="form-group">
            <label>Planned Distance (km)</label>
            <input type="number" id="tf-distance" min="0" value="0" placeholder="e.g. 150">
          </div>
        </div>
        <div class="btn-group">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Draft Trip</button>
        </div>
      </form>
    `);

    document.getElementById('trip-form').onsubmit = async (e) => {
      e.preventDefault();
      clearFieldErrors();

      const source = document.getElementById('tf-source').value.trim();
      const destination = document.getElementById('tf-dest').value.trim();
      const vehicle_id = parseInt(document.getElementById('tf-vehicle').value);
      const driver_id = parseInt(document.getElementById('tf-driver').value);
      const cargo_weight = parseFloat(document.getElementById('tf-cargo').value) || 0;
      const planned_distance = parseFloat(document.getElementById('tf-distance').value) || 0;

      // Client validations
      if (!source) { showFieldError('tf-source', 'Source city/location is required'); return; }
      if (!destination) { showFieldError('tf-dest', 'Destination city/location is required'); return; }
      if (!vehicle_id) { showFieldError('tf-vehicle', 'Please select an available vehicle'); return; }
      if (!driver_id) { showFieldError('tf-driver', 'Please select an available driver'); return; }
      if (cargo_weight <= 0) { showFieldError('tf-cargo', 'Cargo weight must be greater than 0 kg'); return; }
      if (planned_distance <= 0) { showFieldError('tf-distance', 'Planned distance must be greater than 0 km'); return; }

      const body = { source, destination, vehicle_id, driver_id, cargo_weight, planned_distance };

      try {
        await api('/trips', { method: 'POST', body: JSON.stringify(body) });
        showToast('Trip created as Draft', 'success');
        closeModal();
        renderTrips();
      } catch (err) {
        if (err.field) {
          showFieldError(`tf-${err.field}`, err.error);
        } else {
          showToast(err.error || 'Failed to create trip', 'error');
        }
      }
    };
  } catch (err) {
    showToast(err.error || 'Failed to load form data', 'error');
  }
}

async function dispatchTrip(id) {
  try {
    await api(`/trips/${id}/dispatch`, { method: 'POST' });
    showToast('Trip dispatched! Vehicle & driver set to On Trip.', 'success');
    renderTrips();
  } catch (err) {
    // Show specific validation error
    showToast(err.error || 'Dispatch failed', 'error');
  }
}

async function openCompleteTrip(id) {
  openModal('Complete Trip', `
    <form id="complete-trip-form">
      <p style="color:var(--text-muted);margin-bottom:16px;font-size:0.85rem;">
        Enter the actual trip data. Vehicle & driver will be restored to Available.
      </p>
      <div class="form-row">
        <div class="form-group">
          <label>Actual Distance (km) *</label>
          <input type="number" id="ct-distance" min="0" required placeholder="e.g. 155">
        </div>
        <div class="form-group">
          <label>Fuel Consumed (liters) *</label>
          <input type="number" id="ct-fuel" min="0" step="0.1" required placeholder="e.g. 18">
        </div>
      </div>
      <div class="form-group">
        <label>Revenue (₹)</label>
        <input type="number" id="ct-revenue" min="0" value="0" placeholder="e.g. 12000">
        <small style="color:var(--text-muted);font-size:0.7rem;">
          Note: Revenue is a user-entered field, not defined in the original spec. Flagged per blueprint assumption.
        </small>
      </div>
      <div class="btn-group">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-success">Complete Trip</button>
      </div>
    </form>
  `);

  document.getElementById('complete-trip-form').onsubmit = async (e) => {
    e.preventDefault();
    clearFieldErrors();

    const actual_distance = parseFloat(document.getElementById('ct-distance').value) || 0;
    const fuel_consumed = parseFloat(document.getElementById('ct-fuel').value) || 0;
    const revenue = parseFloat(document.getElementById('ct-revenue').value) || 0;

    if (actual_distance <= 0) { showFieldError('ct-distance', 'Actual distance must be greater than 0 km'); return; }
    if (fuel_consumed <= 0) { showFieldError('ct-fuel', 'Fuel consumed must be greater than 0 liters'); return; }
    if (revenue < 0) { showFieldError('ct-revenue', 'Revenue cannot be negative'); return; }

    try {
      await api(`/trips/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ actual_distance, fuel_consumed, revenue })
      });
      showToast('Trip completed successfully!', 'success');
      closeModal();
      renderTrips();
    } catch (err) {
      if (err.field) {
        showFieldError(`ct-${err.field}`, err.error);
      } else {
        showToast(err.error || 'Failed to complete trip', 'error');
      }
    }
  };
}

async function cancelTrip(id) {
  if (!confirm('Cancel this dispatched trip? Vehicle & driver will be restored to Available.')) return;
  try {
    await api(`/trips/${id}/cancel`, { method: 'POST' });
    showToast('Trip cancelled. Resources restored.', 'warning');
    renderTrips();
  } catch (err) {
    showToast(err.error || 'Failed to cancel trip', 'error');
  }
}
