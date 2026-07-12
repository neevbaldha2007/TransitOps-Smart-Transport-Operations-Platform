/* ============================================
   TransitOps — Maintenance Page
   ============================================ */

async function renderMaintenance() {
  const content = document.getElementById('page-content');

  try {
    const logs = await api('/maintenance');

    content.innerHTML = `
      <div class="card-header" style="margin-bottom:16px;">
        <div class="filter-bar" style="margin-bottom:0;">
          <select id="maint-filter-status" onchange="filterMaintenance()">
            <option value="">All Status</option>
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        ${permGate('maintenance', 'open', `
          <button class="btn btn-primary" onclick="openMaintenanceModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            Open Maintenance
          </button>
        `)}
      </div>

      <div class="card">
        <div class="table-wrapper">
          <table id="maintenance-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Vehicle</th>
                <th>Description</th>
                <th>Cost (₹)</th>
                <th>Status</th>
                <th>Opened</th>
                <th>Closed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${logs.length === 0 ? `
                <tr><td colspan="8" class="text-center" style="padding:40px;color:var(--text-muted);">No maintenance records</td></tr>
              ` : logs.map(m => `
                <tr>
                  <td><strong>#${m.id}</strong></td>
                  <td>${m.vehicle_reg || '—'} ${m.vehicle_name ? `(${m.vehicle_name})` : ''}</td>
                  <td style="white-space:normal;max-width:300px;">${m.description}</td>
                  <td>${formatCurrency(m.cost)}</td>
                  <td>${statusBadge(m.status)}</td>
                  <td>${formatDateTime(m.opened_at)}</td>
                  <td>${m.closed_at ? formatDateTime(m.closed_at) : '—'}</td>
                    <td>
                      <div class="hover-actions-wrapper">
                        ${m.status === 'Open' ? permGate('maintenance', 'close', `<button class="btn btn-success btn-sm" onclick="closeMaintenance(${m.id})" aria-label="Close maintenance">Close</button>`) : ''}
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
    content.innerHTML = `<div class="empty-state"><h3>Failed to load maintenance logs</h3><p>${err.error || ''}</p></div>`;
  }
}

async function filterMaintenance() {
  const status = document.getElementById('maint-filter-status').value;
  try {
    const logs = await api('/maintenance' + (status ? `?status=${status}` : ''));
    const tbody = document.querySelector('#maintenance-table tbody');
    tbody.innerHTML = logs.length === 0 ? `
      <tr><td colspan="8" class="text-center" style="padding:40px;color:var(--text-muted);">No records</td></tr>
    ` : logs.map(m => `
      <tr>
        <td><strong>#${m.id}</strong></td>
        <td>${m.vehicle_reg || '—'}</td>
        <td style="white-space:normal;max-width:300px;">${m.description}</td>
        <td>${formatCurrency(m.cost)}</td>
        <td>${statusBadge(m.status)}</td>
        <td>${formatDateTime(m.opened_at)}</td>
        <td>${m.closed_at ? formatDateTime(m.closed_at) : '—'}</td>
        <td><div class="hover-actions-wrapper">${m.status === 'Open' ? permGate('maintenance', 'close', `<button class="btn btn-success btn-sm" onclick="closeMaintenance(${m.id})" aria-label="Close maintenance">Close</button>`) : ''}</div></td>
      </tr>
    `).join('');
  } catch (err) { showToast(err.error || 'Filter failed', 'error'); }
}

async function openMaintenanceModal() {
  try {
    const vehicles = await api('/vehicles/available');

    openModal('Open Maintenance', `
      <form id="maint-form">
        <p style="color:var(--text-muted);margin-bottom:16px;font-size:0.85rem;">
          Opening maintenance will set the vehicle status to <strong>"In Shop"</strong> and remove it from trip dispatch.
        </p>
        <div class="form-group">
          <label>Vehicle *</label>
          <select id="mf-vehicle" required>
            <option value="">Select Vehicle</option>
            ${vehicles.map(v => `<option value="${v.id}">${v.reg_number} — ${v.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Description *</label>
          <textarea id="mf-desc" required rows="3" placeholder="e.g. Engine overhaul and brake replacement"></textarea>
        </div>
        <div class="form-group">
          <label>Estimated Cost (₹)</label>
          <input type="number" id="mf-cost" min="0" value="0">
        </div>
        <div class="btn-group">
          <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-warning">Open Maintenance</button>
        </div>
      </form>
    `);

    document.getElementById('maint-form').onsubmit = async (e) => {
      e.preventDefault();
      clearFieldErrors();

      const vehicle_id = parseInt(document.getElementById('mf-vehicle').value);
      const description = document.getElementById('mf-desc').value.trim();
      const cost = parseFloat(document.getElementById('mf-cost').value) || 0;

      if (!vehicle_id) { showFieldError('mf-vehicle', 'Please select a vehicle'); return; }
      if (!description) { showFieldError('mf-desc', 'Maintenance description is required'); return; }
      if (cost < 0) { showFieldError('mf-cost', 'Estimated cost cannot be negative'); return; }

      try {
        await api('/maintenance', {
          method: 'POST',
          body: JSON.stringify({ vehicle_id, description, cost })
        });
        showToast('Maintenance opened. Vehicle set to In Shop.', 'success');
        closeModal();
        renderMaintenance();
      } catch (err) {
        if (err.field) {
          showFieldError(`mf-${err.field}`, err.error);
        } else {
          showToast(err.error || 'Failed to open maintenance', 'error');
        }
      }
    };
  } catch (err) {
    showToast(err.error || 'Failed to load vehicles', 'error');
  }
}

async function closeMaintenance(id) {
  if (!confirm('Close this maintenance record? Vehicle will be restored to Available (unless retired).')) return;
  try {
    await api(`/maintenance/${id}/close`, { method: 'POST' });
    showToast('Maintenance closed. Vehicle restored.', 'success');
    renderMaintenance();
  } catch (err) {
    showToast(err.error || 'Failed to close maintenance', 'error');
  }
}
