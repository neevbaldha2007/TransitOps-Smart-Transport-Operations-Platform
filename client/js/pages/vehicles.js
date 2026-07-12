/* ============================================
   TransitOps — Vehicles Page
   ============================================ */

async function renderVehicles(searchQuery) {
  const content = document.getElementById('page-content');

  try {
    let endpoint = '/vehicles';
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (params.toString()) endpoint += '?' + params;

    const vehicles = await api(endpoint);

    content.innerHTML = `
      <div class="card-header" style="margin-bottom:16px;">
        <div class="filter-bar" style="margin-bottom:0;">
          <select id="vehicle-filter-status" onchange="filterVehicles()">
            <option value="">All Status</option>
            <option value="Available">Available</option>
            <option value="On Trip">On Trip</option>
            <option value="In Shop">In Shop</option>
            <option value="Retired">Retired</option>
          </select>
          <select id="vehicle-filter-type" onchange="filterVehicles()">
            <option value="">All Types</option>
            <option value="Van">Van</option>
            <option value="Truck">Truck</option>
            <option value="Bus">Bus</option>
          </select>
        </div>
        ${permGate('vehicles', 'create', `
          <button class="btn btn-primary" onclick="openVehicleModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            Add Vehicle
          </button>
        `)}
      </div>

      <div class="card">
        <div class="table-wrapper">
          <table id="vehicles-table">
            <thead>
              <tr>
                <th>Reg Number</th>
                <th>Name</th>
                <th>Type</th>
                <th>Max Load (kg)</th>
                <th>Odometer (km)</th>
                <th>Region</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${vehicles.length === 0 ? `
                <tr><td colspan="8" class="text-center" style="padding:40px;color:var(--text-muted);">No vehicles found</td></tr>
              ` : vehicles.map(v => `
                <tr>
                  <td><strong>${v.reg_number}</strong></td>
                  <td>${v.name}</td>
                  <td>${v.type}</td>
                  <td>${formatNumber(v.max_load_capacity)}</td>
                  <td>${formatNumber(v.odometer)}</td>
                  <td>${v.region || '—'}</td>
                  <td>${statusBadge(v.status)}</td>
                  <td>
                    <div class="hover-actions-wrapper">
                      ${permGate('vehicles', 'edit', `<button class="btn btn-ghost btn-sm" onclick="openVehicleModal(${v.id})" aria-label="Edit vehicle">Edit</button>`)}
                      ${v.status !== 'Retired' ? permGate('vehicles', 'edit', `<button class="btn btn-danger btn-sm" onclick="retireVehicle(${v.id}, '${v.reg_number}')" aria-label="Retire vehicle">Retire</button>`) : ''}
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
    content.innerHTML = `<div class="empty-state"><h3>Failed to load vehicles</h3><p>${err.error || ''}</p></div>`;
  }
}

async function filterVehicles() {
  const status = document.getElementById('vehicle-filter-status').value;
  const type = document.getElementById('vehicle-filter-type').value;
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (type) params.set('type', type);

  try {
    const vehicles = await api('/vehicles' + (params.toString() ? '?' + params : ''));
    const tbody = document.querySelector('#vehicles-table tbody');
    tbody.innerHTML = vehicles.length === 0 ? `
      <tr><td colspan="8" class="text-center" style="padding:40px;color:var(--text-muted);">No vehicles found</td></tr>
    ` : vehicles.map(v => `
      <tr>
        <td><strong>${v.reg_number}</strong></td>
        <td>${v.name}</td>
        <td>${v.type}</td>
        <td>${formatNumber(v.max_load_capacity)}</td>
        <td>${formatNumber(v.odometer)}</td>
        <td>${v.region || '—'}</td>
        <td>${statusBadge(v.status)}</td>
          <td>
            <div class="hover-actions-wrapper">
              ${permGate('vehicles', 'edit', `<button class="btn btn-ghost btn-sm" onclick="openVehicleModal(${v.id})" aria-label="Edit vehicle">Edit</button>`)}
              ${v.status !== 'Retired' ? permGate('vehicles', 'edit', `<button class="btn btn-danger btn-sm" onclick="retireVehicle(${v.id}, '${v.reg_number}')" aria-label="Retire vehicle">Retire</button>`) : ''}
            </div>
          </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast(err.error || 'Filter failed', 'error');
  }
}

async function openVehicleModal(id) {
  let vehicle = null;
  if (id) {
    try { vehicle = await api(`/vehicles/${id}`); } catch { showToast('Failed to load vehicle', 'error'); return; }
  }

  const title = vehicle ? 'Edit Vehicle' : 'Add Vehicle';
  openModal(title, `
    <form id="vehicle-form">
      <div class="form-row">
        <div class="form-group">
          <label>Registration Number *</label>
          <input type="text" id="vf-reg" value="${vehicle?.reg_number || ''}" required placeholder="e.g. VAN-05">
        </div>
        <div class="form-group">
          <label>Vehicle Name *</label>
          <input type="text" id="vf-name" value="${vehicle?.name || ''}" required placeholder="e.g. City Runner">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Type *</label>
          <select id="vf-type" required>
            <option value="Van" ${vehicle?.type === 'Van' ? 'selected' : ''}>Van</option>
            <option value="Truck" ${vehicle?.type === 'Truck' ? 'selected' : ''}>Truck</option>
            <option value="Bus" ${vehicle?.type === 'Bus' ? 'selected' : ''}>Bus</option>
          </select>
        </div>
        <div class="form-group">
          <label>Max Load Capacity (kg)</label>
          <input type="number" id="vf-capacity" value="${vehicle?.max_load_capacity || 0}" min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Odometer (km)</label>
          <input type="number" id="vf-odometer" value="${vehicle?.odometer || 0}" min="0">
        </div>
        <div class="form-group">
          <label>Acquisition Cost (₹)</label>
          <input type="number" id="vf-cost" value="${vehicle?.acquisition_cost || 0}" min="0">
        </div>
      </div>
      <div class="form-group">
        <label>Region</label>
        <select id="vf-region">
          <option value="" ${!vehicle?.region ? 'selected' : ''}>Select Region</option>
          <option value="North" ${vehicle?.region === 'North' ? 'selected' : ''}>North</option>
          <option value="South" ${vehicle?.region === 'South' ? 'selected' : ''}>South</option>
          <option value="East" ${vehicle?.region === 'East' ? 'selected' : ''}>East</option>
          <option value="West" ${vehicle?.region === 'West' ? 'selected' : ''}>West</option>
        </select>
      </div>
      <div class="btn-group">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${vehicle ? 'Update' : 'Create'} Vehicle</button>
      </div>
    </form>
  `);

  document.getElementById('vehicle-form').onsubmit = async (e) => {
    e.preventDefault();
    clearFieldErrors();

    const reg = document.getElementById('vf-reg').value.trim();
    const name = document.getElementById('vf-name').value.trim();
    const type = document.getElementById('vf-type').value;
    const max_load = parseFloat(document.getElementById('vf-capacity').value) || 0;
    const odometer = parseFloat(document.getElementById('vf-odometer').value) || 0;
    const cost = parseFloat(document.getElementById('vf-cost').value) || 0;
    const region = document.getElementById('vf-region').value;

    // Client-side validations
    if (!reg) { showFieldError('vf-reg', 'Registration number is required'); return; }
    if (!name) { showFieldError('vf-name', 'Vehicle name is required'); return; }
    if (max_load <= 0) { showFieldError('vf-capacity', 'Max load capacity must be greater than 0 kg'); return; }
    if (odometer < 0) { showFieldError('vf-odometer', 'Odometer reading cannot be negative'); return; }
    if (cost < 0) { showFieldError('vf-cost', 'Acquisition cost cannot be negative'); return; }

    const body = { reg_number: reg, name, type, max_load_capacity: max_load, odometer, acquisition_cost: cost, region };

    try {
      if (vehicle) {
        await api(`/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
        showToast('Vehicle updated successfully', 'success');
      } else {
        await api('/vehicles', { method: 'POST', body: JSON.stringify(body) });
        showToast('Vehicle created successfully', 'success');
      }
      closeModal();
      renderVehicles();
    } catch (err) {
      if (err.field) {
        showFieldError(`vf-${err.field}`, err.error);
      } else {
        showToast(err.error || 'Failed to save vehicle', 'error');
      }
    }
  };
}

async function retireVehicle(id, regNumber) {
  if (!confirm(`Are you sure you want to retire vehicle ${regNumber}? This action is irreversible.`)) return;

  try {
    await api(`/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Retired' }) });
    showToast(`Vehicle ${regNumber} retired`, 'warning');
    renderVehicles();
  } catch (err) {
    showToast(err.error || 'Failed to retire vehicle', 'error');
  }
}
