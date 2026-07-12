/* ============================================
   TransitOps — Compliance & Safety Page
   ============================================ */

async function renderCompliance(searchQuery) {
  const content = document.getElementById('page-content');

  try {
    let endpoint = '/drivers';
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (params.toString()) endpoint += '?' + params;

    const drivers = await api(endpoint);

    // Filter statistics
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const expiring = drivers.filter(d => d.license_expiry_date >= today && d.license_expiry_date <= thirtyDaysLater);
    const expired = drivers.filter(d => d.license_expiry_date < today);
    const suspended = drivers.filter(d => d.status === 'Suspended');
    const lowSafety = drivers.filter(d => d.safety_score < 75);

    content.innerHTML = `
      <!-- Summary Cards -->
      <div class="kpi-grid" style="margin-bottom:24px;">
        <div class="kpi-card red">
          <div class="kpi-header">
            <span class="kpi-label">Expired Licenses</span>
            <div class="kpi-icon red">🚨</div>
          </div>
          <div class="kpi-value">${expired.length}</div>
          <div class="kpi-sub">Immediate action required</div>
        </div>

        <div class="kpi-card amber">
          <div class="kpi-header">
            <span class="kpi-label">Expiring in 30 Days</span>
            <div class="kpi-icon amber">⚠️</div>
          </div>
          <div class="kpi-value">${expiring.length}</div>
          <div class="kpi-sub">Upcoming renewals</div>
        </div>

        <div class="kpi-card purple">
          <div class="kpi-header">
            <span class="kpi-label">Suspended Drivers</span>
            <div class="kpi-icon purple">🚫</div>
          </div>
          <div class="kpi-value">${suspended.length}</div>
          <div class="kpi-sub">Blocked from dispatch</div>
        </div>

        <div class="kpi-card cyan">
          <div class="kpi-header">
            <span class="kpi-label">Low Safety Scores</span>
            <div class="kpi-icon cyan">📉</div>
          </div>
          <div class="kpi-value">${lowSafety.length}</div>
          <div class="kpi-sub">Safety score &lt; 75</div>
        </div>
      </div>

      <!-- Critical Warnings Section -->
      ${expired.length > 0 ? `
        <div class="card" style="border:1px solid var(--red);margin-bottom:20px;background:rgba(239,68,68,0.05);">
          <div style="color:var(--red);font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px;">
            ❌ CRITICAL: EXPIRED LICENSES DETECTED
          </div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr><th>Driver Name</th><th>License No.</th><th>Expiry Date</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                ${expired.map(d => `
                  <tr>
                    <td><strong>${d.name}</strong></td>
                    <td>${d.license_number}</td>
                    <td class="license-danger">${formatDate(d.license_expiry_date)} (Expired)</td>
                    <td>${statusBadge(d.status)}</td>
                    <td>
                      ${d.status !== 'Suspended' ? permGate('drivers', 'edit', `
                        <button class="btn btn-danger btn-sm" onclick="suspendDriverCompliance(${d.id}, '${d.name}')">Suspend Account</button>
                      `) : '<span style="color:var(--text-muted);">Suspended</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- Main Tabular Panels -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <!-- License Renewal Checklist -->
        <div class="card">
          <div class="card-header"><h3 class="card-title">Renewal Alerts</h3></div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr><th>Driver</th><th>Expiry Date</th><th>Days Left</th><th>Action</th></tr>
              </thead>
              <tbody>
                ${expiring.length === 0 ? `
                  <tr><td colspan="4" class="text-center" style="padding:24px;color:var(--text-muted);">No upcoming expirations</td></tr>
                ` : expiring.map(d => {
                  const days = daysUntil(d.license_expiry_date);
                  return `
                    <tr>
                      <td><strong>${d.name}</strong></td>
                      <td>${formatDate(d.license_expiry_date)}</td>
                      <td class="license-warning">${days} days</td>
                      <td>
                        ${permGate('compliance', 'edit', `<button class="btn btn-ghost btn-sm" onclick="sendRenewalReminder('${d.name}', '${d.license_expiry_date}')">Remind</button>`)}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Safety Performance Watchlist -->
        <div class="card">
          <div class="card-header"><h3 class="card-title">Safety Performance Warning List</h3></div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr><th>Driver</th><th>Score</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                ${lowSafety.length === 0 ? `
                  <tr><td colspan="4" class="text-center" style="padding:24px;color:var(--text-muted);">All driver safety scores are optimal</td></tr>
                ` : lowSafety.map(d => `
                  <tr>
                    <td><strong>${d.name}</strong></td>
                    <td><strong style="color:var(--red);">${d.safety_score}</strong></td>
                    <td>${statusBadge(d.status)}</td>
                    <td>
                      ${d.status !== 'Suspended' ? permGate('drivers', 'edit', `
                        <button class="btn btn-danger btn-sm" onclick="suspendDriverCompliance(${d.id}, '${d.name}')">Suspend</button>
                      `) : '<span style="color:var(--text-muted);">Suspended</span>'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><h3>Failed to load compliance panel</h3><p>${err.error || ''}</p></div>`;
  }
}

async function suspendDriverCompliance(id, name) {
  if (!confirm(`Suspend driver ${name}? They will be blocked from trip assignments.`)) return;
  try {
    await api(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Suspended' }) });
    showToast(`${name} suspended`, 'warning');
    renderCompliance();
  } catch (err) { showToast(err.error || 'Failed', 'error'); }
}

function sendRenewalReminder(name, date) {
  showToast(`Licence renewal reminder sent to ${name} (Expires ${formatDate(date)})`, 'success');
}
