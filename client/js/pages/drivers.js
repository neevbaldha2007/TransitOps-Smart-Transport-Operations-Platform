/* ============================================
   TransitOps — Drivers Page
   ============================================ */

async function renderDrivers(searchQuery) {
  const content = document.getElementById('page-content');

  try {
    let endpoint = '/drivers';
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (params.toString()) endpoint += '?' + params;

    const drivers = await api(endpoint);

    content.innerHTML = `
      <div class="card-header" style="margin-bottom:16px;">
        <div class="filter-bar" style="margin-bottom:0;">
          <select id="driver-filter-status" onchange="filterDrivers()">
            <option value="">All Status</option>
            <option value="Available">Available</option>
            <option value="On Trip">On Trip</option>
            <option value="Off Duty">Off Duty</option>
            <option value="Suspended">Suspended</option>
          </select>
        </div>
        ${permGate('drivers', 'create', `
          <button class="btn btn-primary" onclick="openDriverModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            Add Driver
          </button>
        `)}
      </div>

      <div class="card">
        <div class="table-wrapper">
          <table id="drivers-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>License No.</th>
                <th>Category</th>
                <th>License Expiry</th>
                <th>Contact</th>
                <th>Safety Score</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${drivers.length === 0 ? `
                <tr><td colspan="8" class="text-center" style="padding:40px;color:var(--text-muted);">No drivers found</td></tr>
              ` : drivers.map(d => {
                const days = daysUntil(d.license_expiry_date);
                let expiryClass = '';
                if (days < 0) expiryClass = 'license-danger';
                else if (days <= 30) expiryClass = 'license-warning';

                return `
                <tr>
                  <td><strong>${d.name}</strong></td>
                  <td>${d.license_number}</td>
                  <td>${d.license_category}</td>
                  <td class="${expiryClass}">
                    ${formatDate(d.license_expiry_date)}
                    ${days < 0 ? ' (Expired!)' : days <= 30 ? ` (${days}d left)` : ''}
                  </td>
                  <td>${d.contact_number || '—'}</td>
                  <td>
                    <span style="color: ${d.safety_score >= 80 ? 'var(--green)' : d.safety_score >= 60 ? 'var(--amber)' : 'var(--red)'}; font-weight: 600;">
                      ${d.safety_score}
                    </span>
                  </td>
                  <td>${statusBadge(d.status)}</td>
                    <td>
                      <div class="hover-actions-wrapper">
                        ${permGate('drivers', 'edit', `<button class="btn btn-ghost btn-sm" onclick="openDriverModal(${d.id})" aria-label="Edit driver">Edit</button>`)}
                        ${d.status !== 'Suspended' ? permGate('drivers', 'edit', `<button class="btn btn-danger btn-sm" onclick="suspendDriver(${d.id}, '${d.name}')" aria-label="Suspend driver">Suspend</button>`) : ''}
                        ${d.status === 'Suspended' ? permGate('drivers', 'edit', `<button class="btn btn-success btn-sm" onclick="unsuspendDriver(${d.id}, '${d.name}')" aria-label="Unsuspend driver">Unsuspend</button>`) : ''}
                        ${d.status === 'Available' ? permGate('drivers', 'edit', `<button class="btn btn-ghost btn-sm" onclick="toggleOffDuty(${d.id}, '${d.status}')" aria-label="Set driver off duty">Off Duty</button>`) : ''}
                        ${d.status === 'Off Duty' ? permGate('drivers', 'edit', `<button class="btn btn-ghost btn-sm" onclick="toggleOffDuty(${d.id}, '${d.status}')" aria-label="Set driver on duty">On Duty</button>`) : ''}
                      </div>
                    </td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><h3>Failed to load drivers</h3><p>${err.error || ''}</p></div>`;
  }
}

async function filterDrivers() {
  const status = document.getElementById('driver-filter-status').value;
  const params = new URLSearchParams();
  if (status) params.set('status', status);

  try {
    const drivers = await api('/drivers' + (params.toString() ? '?' + params : ''));
    const tbody = document.querySelector('#drivers-table tbody');
    tbody.innerHTML = drivers.map(d => {
      const days = daysUntil(d.license_expiry_date);
      let expiryClass = '';
      if (days < 0) expiryClass = 'license-danger';
      else if (days <= 30) expiryClass = 'license-warning';

      return `
        <tr>
          <td><strong>${d.name}</strong></td>
          <td>${d.license_number}</td>
          <td>${d.license_category}</td>
          <td class="${expiryClass}">${formatDate(d.license_expiry_date)} ${days < 0 ? '(Expired!)' : days <= 30 ? `(${days}d)` : ''}</td>
          <td>${d.contact_number || '—'}</td>
          <td><span style="color: ${d.safety_score >= 80 ? 'var(--green)' : d.safety_score >= 60 ? 'var(--amber)' : 'var(--red)'}; font-weight:600;">${d.safety_score}</span></td>
          <td>${statusBadge(d.status)}</td>
            <td>
              <div class="hover-actions-wrapper">
                ${permGate('drivers', 'edit', `<button class="btn btn-ghost btn-sm" onclick="openDriverModal(${d.id})" aria-label="Edit driver">Edit</button>`)}
                ${d.status !== 'Suspended' ? permGate('drivers', 'edit', `<button class="btn btn-danger btn-sm" onclick="suspendDriver(${d.id}, '${d.name}')" aria-label="Suspend driver">Suspend</button>`) : ''}
                ${d.status === 'Suspended' ? permGate('drivers', 'edit', `<button class="btn btn-success btn-sm" onclick="unsuspendDriver(${d.id}, '${d.name}')" aria-label="Unsuspend driver">Unsuspend</button>`) : ''}
                ${d.status === 'Available' ? permGate('drivers', 'edit', `<button class="btn btn-ghost btn-sm" onclick="toggleOffDuty(${d.id}, '${d.status}')" aria-label="Set driver off duty">Off Duty</button>`) : ''}
                ${d.status === 'Off Duty' ? permGate('drivers', 'edit', `<button class="btn btn-ghost btn-sm" onclick="toggleOffDuty(${d.id}, '${d.status}')" aria-label="Set driver on duty">On Duty</button>`) : ''}
              </div>
            </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="8" class="text-center" style="padding:40px;color:var(--text-muted);">No drivers found</td></tr>';
  } catch (err) {
    showToast(err.error || 'Filter failed', 'error');
  }
}

async function openDriverModal(id) {
  let driver = null;
  if (id) {
    try { driver = await api(`/drivers/${id}`); } catch { showToast('Failed to load driver', 'error'); return; }
  }

  openModal(driver ? 'Edit Driver' : 'Add Driver', `
    <form id="driver-form">
      <div class="form-row">
        <div class="form-group">
          <label>Full Name *</label>
          <input type="text" id="df-name" value="${driver?.name || ''}" required placeholder="e.g. Alex Driver">
        </div>
        <div class="form-group">
          <label>License Number *</label>
          <input type="text" id="df-license" value="${driver?.license_number || ''}" required placeholder="e.g. DL-2024-006">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>License Category</label>
          <select id="df-category">
            <option value="LMV" ${driver?.license_category === 'LMV' ? 'selected' : ''}>LMV</option>
            <option value="HMV" ${driver?.license_category === 'HMV' ? 'selected' : ''}>HMV</option>
          </select>
        </div>
        <div class="form-group">
          <label>License Expiry *</label>
          <input type="date" id="df-expiry" value="${driver?.license_expiry_date || ''}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Contact Number</label>
          <input type="text" id="df-contact" value="${driver?.contact_number || ''}" placeholder="e.g. 9876543210">
        </div>
        <div class="form-group">
          <label>Safety Score (0-100)</label>
          <input type="number" id="df-score" value="${driver?.safety_score ?? 100}" min="0" max="100">
        </div>
      </div>
      <div class="btn-group">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${driver ? 'Update' : 'Create'} Driver</button>
      </div>
    </form>
  `);

  document.getElementById('driver-form').onsubmit = async (e) => {
    e.preventDefault();
    clearFieldErrors();

    const name = document.getElementById('df-name').value.trim();
    const license = document.getElementById('df-license').value.trim();
    const category = document.getElementById('df-category').value;
    const expiry = document.getElementById('df-expiry').value;
    const contact = document.getElementById('df-contact').value.trim();
    const score = parseFloat(document.getElementById('df-score').value);

    // Client-side validations
    if (!name) { showFieldError('df-name', 'Full name is required'); return; }
    if (!license) { showFieldError('df-license', 'License number is required'); return; }
    if (!expiry) { showFieldError('df-expiry', 'License expiry date is required'); return; }
    if (isNaN(score) || score < 0 || score > 100) { showFieldError('df-score', 'Safety score must be between 0 and 100'); return; }

    const body = { name, license_number: license, license_category: category, license_expiry_date: expiry, contact_number: contact, safety_score: score };

    try {
      if (driver) {
        await api(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
        showToast('Driver updated successfully', 'success');
      } else {
        await api('/drivers', { method: 'POST', body: JSON.stringify(body) });
        showToast('Driver created successfully', 'success');
      }
      closeModal();
      renderDrivers();
    } catch (err) {
      if (err.field) {
        showFieldError(`df-${err.field}`, err.error);
      } else {
        showToast(err.error || 'Failed to save driver', 'error');
      }
    }
  };
}

async function suspendDriver(id, name) {
  if (!confirm(`Suspend driver ${name}? They will be blocked from trip assignments.`)) return;
  try {
    await api(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Suspended' }) });
    showToast(`${name} suspended`, 'warning');
    renderDrivers();
  } catch (err) { showToast(err.error || 'Failed', 'error'); }
}

async function unsuspendDriver(id, name) {
  try {
    await api(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Available' }) });
    showToast(`${name} unsuspended`, 'success');
    renderDrivers();
  } catch (err) { showToast(err.error || 'Failed', 'error'); }
}

async function toggleOffDuty(id, currentStatus) {
  const newStatus = currentStatus === 'Available' ? 'Off Duty' : 'Available';
  try {
    await api(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
    showToast(`Driver set to ${newStatus}`, 'info');
    renderDrivers();
  } catch (err) { showToast(err.error || 'Failed', 'error'); }
}
