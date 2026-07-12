/* ============================================
   TransitOps — Reports & Analytics Page
   ============================================ */

let reportCharts = {};

async function renderReports() {
  const content = document.getElementById('page-content');

  content.innerHTML = `
    <!-- Report Tabs -->
    <div class="filter-bar" style="margin-bottom:24px;">
      <button class="btn btn-primary btn-sm" id="tab-fuel-eff" onclick="loadReport('fuel-efficiency')">Fuel Efficiency</button>
      <button class="btn btn-ghost btn-sm" id="tab-utilization" onclick="loadReport('utilization')">Utilization</button>
      <button class="btn btn-ghost btn-sm" id="tab-op-cost" onclick="loadReport('operational-cost')">Operational Cost</button>
      <button class="btn btn-ghost btn-sm" id="tab-roi" onclick="loadReport('roi')">Vehicle ROI</button>
    </div>

    <div id="report-content">
      <div class="spinner"></div>
    </div>
  `;

  loadReport('fuel-efficiency');
}

async function loadReport(type) {
  // Update tab styles
  document.querySelectorAll('.filter-bar .btn').forEach(b => {
    b.className = 'btn btn-ghost btn-sm';
  });
  const activeTab = document.getElementById(`tab-${type === 'fuel-efficiency' ? 'fuel-eff' : type === 'operational-cost' ? 'op-cost' : type}`);
  if (activeTab) activeTab.className = 'btn btn-primary btn-sm';

  const container = document.getElementById('report-content');
  container.innerHTML = '<div class="spinner"></div>';

  try {
    const data = await api(`/reports/${type}`);

    switch (type) {
      case 'fuel-efficiency': renderFuelEfficiencyReport(container, data); break;
      case 'utilization': renderUtilizationReport(container, data); break;
      case 'operational-cost': renderOperationalCostReport(container, data); break;
      case 'roi': renderROIReport(container, data); break;
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h3>Failed to load report</h3><p>${err.error || ''}</p></div>`;
  }
}

function renderFuelEfficiencyReport(container, data) {
  Object.values(reportCharts).forEach(c => c.destroy());
  reportCharts = {};

  container.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
      <button class="btn btn-ghost btn-sm" onclick="exportCSV('fuel-efficiency')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Export CSV
      </button>
    </div>
    <div class="chart-grid">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Fuel Efficiency by Vehicle (km/L)</h3></div>
        <div class="chart-container"><canvas id="chart-fuel-eff"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Data Table</h3></div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>Vehicle</th><th>Type</th><th>Distance (km)</th><th>Fuel (L)</th><th>Efficiency (km/L)</th></tr>
            </thead>
            <tbody>
              ${data.map(r => `
                <tr>
                  <td><strong>${r.reg_number}</strong> ${r.name}</td>
                  <td>${r.type}</td>
                  <td>${formatNumber(r.total_distance)}</td>
                  <td>${formatNumber(r.total_fuel)}</td>
                  <td><span style="color:${r.efficiency >= 8 ? 'var(--green)' : r.efficiency >= 5 ? 'var(--amber)' : 'var(--red)'}; font-weight:700;">${r.efficiency}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const ctx = document.getElementById('chart-fuel-eff');
  if (ctx) {
    reportCharts.fuelEff = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(r => r.reg_number),
        datasets: [{
          label: 'km/L',
          data: data.map(r => r.efficiency),
          backgroundColor: data.map(r => r.efficiency >= 8 ? '#10b981' : r.efficiency >= 5 ? '#f59e0b' : '#ef4444'),
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: '#6B7280' } },
          y: { grid: { color: '#E5E7EB' }, ticks: { color: '#6B7280' } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }
}

function renderUtilizationReport(container, data) {
  Object.values(reportCharts).forEach(c => c.destroy());
  reportCharts = {};

  container.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
      <button class="btn btn-ghost btn-sm" onclick="exportCSV('utilization')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Export CSV
      </button>
    </div>
    <div class="chart-grid">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Completed Trips by Vehicle</h3></div>
        <div class="chart-container"><canvas id="chart-utilization"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Utilization Data</h3></div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>Vehicle</th><th>Type</th><th>Status</th><th>Completed Trips</th><th>Active Trips</th><th>Total Distance</th></tr>
            </thead>
            <tbody>
              ${data.map(r => `
                <tr>
                  <td><strong>${r.reg_number}</strong> ${r.name}</td>
                  <td>${r.type}</td>
                  <td>${statusBadge(r.status)}</td>
                  <td><strong>${r.completed_trips}</strong></td>
                  <td>${r.active_trips}</td>
                  <td>${formatNumber(r.total_distance)} km</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const ctx = document.getElementById('chart-utilization');
  if (ctx) {
    reportCharts.util = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(r => r.reg_number),
        datasets: [{
          label: 'Completed Trips',
          data: data.map(r => r.completed_trips),
          backgroundColor: '#06b6d4',
          borderRadius: 8, borderSkipped: false
        }, {
          label: 'Active Trips',
          data: data.map(r => r.active_trips),
          backgroundColor: '#8b5cf6',
          borderRadius: 8, borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: '#6B7280' } },
          y: { grid: { color: '#E5E7EB' }, ticks: { color: '#6B7280', stepSize: 1 } }
        },
        plugins: { legend: { labels: { color: '#374151', font: { family: 'system-ui' } } } }
      }
    });
  }
}

function renderOperationalCostReport(container, data) {
  Object.values(reportCharts).forEach(c => c.destroy());
  reportCharts = {};

  container.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
      <button class="btn btn-ghost btn-sm" onclick="exportCSV('operational-cost')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Export CSV
      </button>
    </div>
    <div class="chart-grid">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Cost Breakdown by Vehicle</h3></div>
        <div class="chart-container"><canvas id="chart-op-cost"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Cost Data</h3></div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>Vehicle</th><th>Fuel</th><th>Maintenance</th><th>Expenses</th><th>Total</th></tr>
            </thead>
            <tbody>
              ${data.map(r => `
                <tr>
                  <td><strong>${r.reg_number}</strong> ${r.name}</td>
                  <td>${formatCurrency(r.fuel_cost)}</td>
                  <td>${formatCurrency(r.maintenance_cost)}</td>
                  <td>${formatCurrency(r.expense_cost)}</td>
                  <td><strong style="color:var(--cyan);">${formatCurrency(r.total_cost)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const ctx = document.getElementById('chart-op-cost');
  if (ctx) {
    reportCharts.opCost = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(r => r.reg_number),
        datasets: [
          { label: 'Fuel', data: data.map(r => r.fuel_cost), backgroundColor: '#06b6d4', borderRadius: 4, borderSkipped: false },
          { label: 'Maintenance', data: data.map(r => r.maintenance_cost), backgroundColor: '#8b5cf6', borderRadius: 4, borderSkipped: false },
          { label: 'Expenses', data: data.map(r => r.expense_cost), backgroundColor: '#f59e0b', borderRadius: 4, borderSkipped: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: '#6B7280' } },
          y: { stacked: true, grid: { color: '#E5E7EB' }, ticks: { color: '#6B7280' } }
        },
        plugins: { legend: { labels: { color: '#374151', font: { family: 'system-ui' } } } }
      }
    });
  }
}

function renderROIReport(container, data) {
  Object.values(reportCharts).forEach(c => c.destroy());
  reportCharts = {};

  container.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px;">
      <button class="btn btn-ghost btn-sm" onclick="exportCSV('roi')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Export CSV
      </button>
    </div>
    <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:var(--radius-sm);padding:12px 16px;margin-bottom:16px;font-size:0.8rem;color:var(--blue);">
      ℹ️ <strong>Note:</strong> Revenue is user-entered at trip completion. The original spec does not define a revenue entity — this is flagged as an assumption per the blueprint.
      ROI = (Revenue − Maintenance − Fuel) / Acquisition Cost × 100
    </div>
    <div class="chart-grid">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Vehicle ROI (%)</h3></div>
        <div class="chart-container"><canvas id="chart-roi"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">ROI Data</h3></div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>Vehicle</th><th>Acquisition</th><th>Revenue</th><th>Costs</th><th>ROI %</th></tr>
            </thead>
            <tbody>
              ${data.map(r => `
                <tr>
                  <td><strong>${r.reg_number}</strong> ${r.name}</td>
                  <td>${formatCurrency(r.acquisition_cost)}</td>
                  <td>${formatCurrency(r.total_revenue)}</td>
                  <td>${formatCurrency(r.maintenance_cost + r.fuel_cost)}</td>
                  <td><strong style="color:${r.roi_percent > 0 ? 'var(--green)' : r.roi_percent < 0 ? 'var(--red)' : 'var(--text-muted)'};">${r.roi_percent}%</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const ctx = document.getElementById('chart-roi');
  if (ctx) {
    reportCharts.roi = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(r => r.reg_number),
        datasets: [{
          label: 'ROI %',
          data: data.map(r => r.roi_percent),
          backgroundColor: data.map(r => r.roi_percent > 0 ? '#10b981' : '#ef4444'),
          borderRadius: 8, borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: '#6B7280' } },
          y: { grid: { color: '#E5E7EB' }, ticks: { color: '#6B7280' } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }
}

async function exportCSV(type) {
  try {
    await api(`/reports/export.csv?type=${type}`);
    showToast(`${type} report exported as CSV`, 'success');
  } catch (err) {
    showToast(err.error || 'Export failed', 'error');
  }
}
