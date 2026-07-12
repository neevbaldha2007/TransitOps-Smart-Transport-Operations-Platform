/* ============================================
   TransitOps — Fuel & Expenses Page
   ============================================ */

async function renderFuel() {
  const content = document.getElementById('page-content');

  try {
    const [fuelLogs, expenses, vehicles] = await Promise.all([
      api('/fuel-logs'),
      api('/expenses'),
      api('/vehicles')
    ]);

    const totalFuel = fuelLogs.reduce((s, f) => s + f.cost, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

    content.innerHTML = `
      <!-- Summary Cards -->
      <div class="kpi-grid" style="margin-bottom:24px;">
        <div class="kpi-card cyan">
          <div class="kpi-header">
            <span class="kpi-label">Total Fuel Cost</span>
            <div class="kpi-icon cyan">⛽</div>
          </div>
          <div class="kpi-value">${formatCurrency(totalFuel)}</div>
          <div class="kpi-sub">${fuelLogs.length} entries</div>
        </div>
        <div class="kpi-card purple">
          <div class="kpi-header">
            <span class="kpi-label">Total Expenses</span>
            <div class="kpi-icon purple">💳</div>
          </div>
          <div class="kpi-value">${formatCurrency(totalExpenses)}</div>
          <div class="kpi-sub">${expenses.length} entries</div>
        </div>
        <div class="kpi-card amber">
          <div class="kpi-header">
            <span class="kpi-label">Combined Total</span>
            <div class="kpi-icon amber">📊</div>
          </div>
          <div class="kpi-value">${formatCurrency(totalFuel + totalExpenses)}</div>
          <div class="kpi-sub">All operational costs</div>
        </div>
      </div>

      <!-- Two-column layout -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <!-- Fuel Logs -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Fuel Logs</h3>
            ${permGate('fuel', 'create', `
              <button class="btn btn-primary btn-sm" onclick="openFuelLogModal()">+ Add Fuel Log</button>
            `)}
          </div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Liters</th>
                  <th>Cost</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${fuelLogs.length === 0 ? `
                  <tr><td colspan="4" class="text-center" style="padding:30px;color:var(--text-muted);">No fuel logs</td></tr>
                ` : fuelLogs.map(f => `
                  <tr>
                    <td>${f.vehicle_reg || '—'}</td>
                    <td>${f.liters}L</td>
                    <td>${formatCurrency(f.cost)}</td>
                    <td>${formatDate(f.date)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Expenses -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Expenses</h3>
            ${permGate('fuel', 'create', `
              <button class="btn btn-primary btn-sm" onclick="openExpenseModal()">+ Add Expense</button>
            `)}
          </div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                ${expenses.length === 0 ? `
                  <tr><td colspan="5" class="text-center" style="padding:30px;color:var(--text-muted);">No expenses</td></tr>
                ` : expenses.map(e => `
                  <tr>
                    <td>${e.vehicle_reg || '—'}</td>
                    <td><span class="badge ${e.type === 'toll' ? 'badge-dispatched' : 'badge-draft'}">${e.type}</span></td>
                    <td>${formatCurrency(e.amount)}</td>
                    <td>${formatDate(e.date)}</td>
                    <td style="white-space:normal;max-width:200px;">${e.description || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Store vehicles for modals
    window._fuelVehicles = vehicles;
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><h3>Failed to load data</h3><p>${err.error || ''}</p></div>`;
  }
}

function openFuelLogModal() {
  const vehicles = window._fuelVehicles || [];
  openModal('Add Fuel Log', `
    <form id="fuel-form">
      <div class="form-group">
        <label>Vehicle *</label>
        <select id="ff-vehicle" required>
          <option value="">Select Vehicle</option>
          ${vehicles.map(v => `<option value="${v.id}">${v.reg_number} — ${v.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Liters *</label>
          <input type="number" id="ff-liters" min="0" step="0.1" required placeholder="e.g. 45">
        </div>
        <div class="form-group">
          <label>Cost (₹) *</label>
          <input type="number" id="ff-cost" min="0" required placeholder="e.g. 4500">
        </div>
      </div>
      <div class="form-group">
        <label>Date</label>
        <input type="date" id="ff-date" value="${new Date().toISOString().split('T')[0]}">
      </div>
      <div class="btn-group">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Add Fuel Log</button>
      </div>
    </form>
  `);

  document.getElementById('fuel-form').onsubmit = async (e) => {
    e.preventDefault();
    clearFieldErrors();

    const vehicle_id = parseInt(document.getElementById('ff-vehicle').value);
    const liters = parseFloat(document.getElementById('ff-liters').value);
    const cost = parseFloat(document.getElementById('ff-cost').value);
    const date = document.getElementById('ff-date').value;

    if (!vehicle_id) { showFieldError('ff-vehicle', 'Please select a vehicle'); return; }
    if (isNaN(liters) || liters <= 0) { showFieldError('ff-liters', 'Liters filled must be greater than 0'); return; }
    if (isNaN(cost) || cost <= 0) { showFieldError('ff-cost', 'Cost must be greater than 0'); return; }

    try {
      await api('/fuel-logs', {
        method: 'POST',
        body: JSON.stringify({ vehicle_id, liters, cost, date })
      });
      showToast('Fuel log added successfully', 'success');
      closeModal();
      renderFuel();
    } catch (err) {
      if (err.field) {
        showFieldError(`ff-${err.field}`, err.error);
      } else {
        showToast(err.error || 'Failed to save fuel log', 'error');
      }
    }
  };
}

function openExpenseModal() {
  const vehicles = window._fuelVehicles || [];
  openModal('Add Expense', `
    <form id="expense-form">
      <div class="form-group">
        <label>Vehicle *</label>
        <select id="ef-vehicle" required>
          <option value="">Select Vehicle</option>
          ${vehicles.map(v => `<option value="${v.id}">${v.reg_number} — ${v.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Type</label>
          <select id="ef-type">
            <option value="toll">Toll</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Amount (₹) *</label>
          <input type="number" id="ef-amount" min="0" required placeholder="e.g. 350">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Date</label>
          <input type="date" id="ef-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" id="ef-desc" placeholder="e.g. Highway toll">
        </div>
      </div>
      <div class="btn-group">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Add Expense</button>
      </div>
    </form>
  `);

  document.getElementById('expense-form').onsubmit = async (e) => {
    e.preventDefault();
    clearFieldErrors();

    const vehicle_id = parseInt(document.getElementById('ef-vehicle').value);
    const type = document.getElementById('ef-type').value;
    const amount = parseFloat(document.getElementById('ef-amount').value);
    const date = document.getElementById('ef-date').value;
    const description = document.getElementById('ef-desc').value.trim();

    if (!vehicle_id) { showFieldError('ef-vehicle', 'Please select a vehicle'); return; }
    if (isNaN(amount) || amount <= 0) { showFieldError('ef-amount', 'Expense amount must be greater than 0'); return; }
    if (!description) { showFieldError('ef-desc', 'Description is required'); return; }

    try {
      await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({ vehicle_id, type, amount, date, description })
      });
      showToast('Expense added successfully', 'success');
      closeModal();
      renderFuel();
    } catch (err) {
      if (err.field) {
        showFieldError(`ef-${err.field}`, err.error);
      } else {
        showToast(err.error || 'Failed to save expense', 'error');
      }
    }
  };
}
