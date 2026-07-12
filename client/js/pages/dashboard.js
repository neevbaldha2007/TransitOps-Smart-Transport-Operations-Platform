/* ============================================
   TransitOps — Dashboard Page (Dispatcher-Focused & Role-Specific)
   ============================================ */

let activeFilters = {
  vehicle_type: null,
  region: null,
  status: null
};

let dashboardCharts = {};
let dashboardRefreshInterval = null;
let dashboardRelativeTimer = null;
let lastUpdatedTime = null;

// Clean up timer logic when switching pages
function cleanupDashboardTimers() {
  if (dashboardRefreshInterval) {
    clearInterval(dashboardRefreshInterval);
    dashboardRefreshInterval = null;
  }
  if (dashboardRelativeTimer) {
    clearInterval(dashboardRelativeTimer);
    dashboardRelativeTimer = null;
  }
}

async function renderDashboard() {
  const content = document.getElementById('page-content');

  // Ensure timers are clean before setting new ones
  cleanupDashboardTimers();

  // Render Page Layout with Filter Controls & Skeletons
  content.innerHTML = `
    <!-- Dashboard Controls Header -->
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
      <div class="filter-bar" style="margin-bottom:0; display:flex; gap:8px; flex-wrap:wrap;">
        <select id="dash-filter-type" onchange="handleFilterChange('vehicle_type', this.value)">
          <option value="">Loading types...</option>
        </select>
        <select id="dash-filter-region" onchange="handleFilterChange('region', this.value)">
          <option value="">Loading regions...</option>
        </select>
        <select id="dash-filter-status" onchange="handleFilterChange('status', this.value)">
          <option value="">All Statuses</option>
          <option value="Available" ${activeFilters.status === 'Available' ? 'selected' : ''}>Available</option>
          <option value="On Trip" ${activeFilters.status === 'On Trip' ? 'selected' : ''}>On Trip</option>
          <option value="In Shop" ${activeFilters.status === 'In Shop' ? 'selected' : ''}>In Shop</option>
          <option value="Retired" ${activeFilters.status === 'Retired' ? 'selected' : ''}>Retired</option>
        </select>
      </div>

      <div class="last-updated-container">
        <span id="last-updated-text">Updating...</span>
        <button class="btn-refresh" onclick="fetchDashboardData()" title="Refresh Dashboard">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 11-.57-8.38l5.67-5.67"/></svg>
          Refresh
        </button>
      </div>
    </div>

    <!-- Active Filter Chips -->
    <div id="filter-chips" class="filter-chips-container"></div>

    <!-- Main Dashboard Metrics Area -->
    <div id="dashboard-data-container">
      <!-- Skeletons loaded initially -->
      <div class="skeleton-grid" style="display:grid; grid-template-columns: repeat(4, 1fr); gap:20px; margin-bottom:24px;">
        <div class="card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-value"></div></div>
        <div class="card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-value"></div></div>
        <div class="card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-value"></div></div>
        <div class="card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-value"></div></div>
      </div>
      <div class="card" style="height:200px;"><div class="skeleton skeleton-block" style="height:100%;"></div></div>
    </div>
  `;

  // Start loaders and fetch options
  await loadFilterOptions();
  renderFilterChips();
  await fetchDashboardData();

  // Establish Auto-refresh Interval every 30s
  dashboardRefreshInterval = setInterval(() => {
    if (currentPage === 'dashboard') {
      fetchDashboardData();
    } else {
      cleanupDashboardTimers();
    }
  }, 30000);

  // Establish Relative Time Tick every 1s
  dashboardRelativeTimer = setInterval(() => {
    if (currentPage === 'dashboard') {
      updateRelativeTime();
    } else {
      cleanupDashboardTimers();
    }
  }, 1000);
}

// 1. Dynamic Dropdown Options population
async function loadFilterOptions() {
  try {
    const opts = await api('/dashboard/filters');
    
    const typeSelect = document.getElementById('dash-filter-type');
    const typeHtml = ['<option value="">All Types</option>'];
    opts.types.forEach(t => {
      typeHtml.push(`<option value="${t}" ${activeFilters.vehicle_type === t ? 'selected' : ''}>${t}</option>`);
    });
    typeSelect.innerHTML = typeHtml.join('');

    const regionSelect = document.getElementById('dash-filter-region');
    const regionHtml = ['<option value="">All Regions</option>'];
    opts.regions.forEach(r => {
      regionHtml.push(`<option value="${r}" ${activeFilters.region === r ? 'selected' : ''}>${r}</option>`);
    });
    regionSelect.innerHTML = regionHtml.join('');
  } catch (err) {
    console.error('Failed to load filters options:', err);
  }
}

// 2. Filter changes & Combined API query trigger
function handleFilterChange(key, value) {
  activeFilters[key] = value || null;
  renderFilterChips();
  fetchDashboardData();
}

function removeFilter(key) {
  activeFilters[key] = null;
  
  // Sync the DOM selector
  const elId = {
    vehicle_type: 'dash-filter-type',
    region: 'dash-filter-region',
    status: 'dash-filter-status'
  }[key];
  const selectEl = document.getElementById(elId);
  if (selectEl) selectEl.value = '';

  renderFilterChips();
  fetchDashboardData();
}

function clearAllFilters() {
  activeFilters = { vehicle_type: null, region: null, status: null };
  
  ['dash-filter-type', 'dash-filter-region', 'dash-filter-status'].forEach(id => {
    const selectEl = document.getElementById(id);
    if (selectEl) selectEl.value = '';
  });

  renderFilterChips();
  fetchDashboardData();
}

function renderFilterChips() {
  const container = document.getElementById('filter-chips');
  if (!container) return;

  const chips = [];
  if (activeFilters.vehicle_type) {
    chips.push(`<span class="filter-chip">Type: ${activeFilters.vehicle_type} <button class="filter-chip-remove" onclick="removeFilter('vehicle_type')">✕</button></span>`);
  }
  if (activeFilters.region) {
    chips.push(`<span class="filter-chip">Region: ${activeFilters.region} <button class="filter-chip-remove" onclick="removeFilter('region')">✕</button></span>`);
  }
  if (activeFilters.status) {
    chips.push(`<span class="filter-chip">Status: ${activeFilters.status} <button class="filter-chip-remove" onclick="removeFilter('status')">✕</button></span>`);
  }

  if (chips.length > 0) {
    container.innerHTML = `${chips.join('')} <button class="btn-clear-filters" onclick="clearAllFilters()">Clear all</button>`;
  } else {
    container.innerHTML = '';
  }
}

// 3. Skeleton UI loaders
function renderDashboardSkeletons() {
  const container = document.getElementById('dashboard-data-container');
  if (!container) return;

  // Dispatcher gets a slightly different skeleton structure
  if (currentUser.role === 'dispatcher') {
    container.innerHTML = `
      <div class="card" style="margin-bottom:24px; height:80px;"><div class="skeleton skeleton-block" style="height:100%;"></div></div>
      <div class="skeleton-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:24px; height:120px;">
        <div class="card" style="height:100%;"><div class="skeleton skeleton-block" style="height:100%;"></div></div>
        <div class="card" style="height:100%;"><div class="skeleton skeleton-block" style="height:100%;"></div></div>
      </div>
      <div class="card" style="margin-bottom:24px; height:200px;"><div class="skeleton skeleton-block" style="height:100%;"></div></div>
    `;
  } else {
    container.innerHTML = `
      <div class="skeleton-grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:20px; margin-bottom:24px;">
        <div class="card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-value"></div></div>
        <div class="card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-value"></div></div>
        <div class="card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-value"></div></div>
      </div>
      <div class="card" style="height:250px;"><div class="skeleton skeleton-block" style="height:100%;"></div></div>
    `;
  }
}

// 4. Fetch logic
async function fetchDashboardData() {
  const container = document.getElementById('dashboard-data-container');
  if (!container) return;

  renderDashboardSkeletons();

  const params = new URLSearchParams();
  if (activeFilters.vehicle_type) params.set('vehicle_type', activeFilters.vehicle_type);
  if (activeFilters.region) params.set('region', activeFilters.region);
  if (activeFilters.status) params.set('status', activeFilters.status);

  try {
    // If roles is dispatcher, fetch draft and dispatched trips in parallel to feed dispatcher widgets
    if (currentUser.role === 'dispatcher') {
      const [kpis, draftTrips, activeTrips] = await Promise.all([
        api('/dashboard/kpis?' + params.toString()),
        api('/trips?status=Draft'),
        api('/trips?status=Dispatched')
      ]);

      renderDispatcherDashboard(container, kpis, draftTrips, activeTrips);
    } else {
      const kpis = await api('/dashboard/kpis?' + params.toString());
      renderRoleDashboard(container, kpis);
    }

    lastUpdatedTime = new Date();
    updateRelativeTime();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h3>Failed to load dashboard data</h3><p>${err.error || err.message}</p></div>`;
  }
}

// Last updated display updates
function updateRelativeTime() {
  const label = document.getElementById('last-updated-text');
  if (!label || !lastUpdatedTime) return;

  const seconds = Math.floor((new Date() - lastUpdatedTime) / 1000);
  if (seconds < 5) {
    label.textContent = 'Just updated';
  } else {
    label.textContent = `Last updated ${seconds}s ago`;
  }
}

// 5. Dispatcher Dashboard Render
function renderDispatcherDashboard(container, kpis, draftTrips, activeTrips) {
  // Check empty state
  if (kpis.vehicles.totalActive === 0) {
    container.innerHTML = `<div class="empty-state"><h3>No vehicles match these filters</h3><p>Try resetting or choosing a different combination.</p></div>`;
    return;
  }

  // Filter draftTrips and activeTrips locally if filters apply
  let filteredDrafts = draftTrips;
  let filteredActive = activeTrips;

  // Render Top-to-bottom layout
  container.innerHTML = `
    <!-- 1. Needs Action Now Strip -->
    <div class="needs-action-strip">
      <div class="needs-action-header">
        <h4>🚨 Needs Action Now: ${filteredDrafts.length} Pending (Draft) Trips</h4>
      </div>
      <div class="needs-action-cards">
        ${filteredDrafts.length === 0 
          ? '<p style="color:#78350F; font-size:0.9rem; margin:0;">All dispatch queues are clear. Great job!</p>'
          : filteredDrafts.slice(0, 3).map(t => `
            <div class="action-card">
              <span><strong>#${t.id}</strong>: ${t.source} → ${t.destination} · Vehicle ${t.vehicle_reg || '—'} · Cargo ${formatNumber(t.cargo_weight)}kg</span>
              <button class="btn btn-primary btn-sm" onclick="dispatchTripFromDashboard(${t.id})">Dispatch Inline</button>
            </div>
          `).join('')
        }
        ${filteredDrafts.length > 3 ? `<p style="color:#78350F; font-size:0.85rem; margin: 4px 0 0 0; text-align:right;">And ${filteredDrafts.length - 3} more pending trips...</p>` : ''}
      </div>
    </div>

    <!-- 2. Real-time availability -->
    <div class="availability-row">
      <div class="availability-card" style="border-left: 5px solid var(--green, #10B981);">
        <div class="availability-details">
          <span class="availability-label">Available Vehicles</span>
          <span class="availability-number">${kpis.vehicles.available}</span>
        </div>
        <span class="availability-icon">🚛</span>
      </div>
      <div class="availability-card" style="border-left: 5px solid var(--primary-accent, #1D4ED8);">
        <div class="availability-details">
          <span class="availability-label">Available Drivers</span>
          <span class="availability-number">${kpis.drivers.available}</span>
        </div>
        <span class="availability-icon">👤</span>
      </div>
    </div>

    <!-- 3. Active Trips Dispatched List -->
    <div class="card" style="margin-bottom:24px;">
      <div class="card-header" style="padding-bottom:12px; margin-bottom:12px; border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between;">
        <h3 class="card-title" style="margin-bottom:0;">Live Active Trips (${filteredActive.length})</h3>
        <a href="#" onclick="navigateTo('trips')" style="font-size:0.85rem; color:var(--primary-accent); font-weight:600;">View Trips Screen →</a>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Route</th>
              <th>Vehicle</th>
              <th>Driver</th>
              <th>Distance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filteredActive.length === 0 
              ? '<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">No active dispatched trips.</td></tr>'
              : filteredActive.map(t => `
                <tr>
                  <td><strong>#${t.id}</strong></td>
                  <td>${t.source} → ${t.destination}</td>
                  <td>${t.vehicle_reg || '—'}</td>
                  <td>${t.driver_name || '—'}</td>
                  <td>${t.actual_distance ? formatNumber(t.actual_distance) : formatNumber(t.planned_distance) + ' km'}</td>
                  <td>
                    <div class="hover-actions-wrapper" style="opacity: 1; display: flex; gap: 8px;">
                      ${permGate('trips', 'complete', `<button class="btn btn-success btn-sm" onclick="completeTripFromDashboard(${t.id})">Complete</button>`)}
                      ${permGate('trips', 'cancel', `<button class="btn btn-danger btn-sm" onclick="cancelTripFromDashboard(${t.id})">Cancel</button>`)}
                    </div>
                  </td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- 4. Secondary KPI row below fold -->
    <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr); gap:20px; margin-bottom:24px;">
      <div class="kpi-card green">
        <span class="kpi-label">Fleet Utilization</span>
        <div class="kpi-value">${kpis.utilization}%</div>
        <span class="kpi-sub">${kpis.vehicles.onTrip} on trip · ${kpis.vehicles.inShop} in shop</span>
      </div>
      <div class="kpi-card red">
        <span class="kpi-label">Vehicles In Shop</span>
        <div class="kpi-value">${kpis.vehicles.inShop}</div>
        <span class="kpi-sub">Out of service for maintenance</span>
      </div>
      <div class="kpi-card amber">
        <span class="kpi-label">Drivers On Duty</span>
        <div class="kpi-value">${kpis.drivers.onDuty}</div>
        <span class="kpi-sub">Active on dispatched runs</span>
      </div>
    </div>

    <!-- 5. Max 2 charts for Dispatcher -->
    <div class="chart-grid" style="grid-template-columns: 1fr 1fr;">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Fleet Status Distribution</h3></div>
        <div class="chart-container"><canvas id="chart-fleet-status"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Regional Distribution</h3></div>
        <div class="chart-container"><canvas id="chart-regions"></canvas></div>
      </div>
    </div>
  `;

  renderDispatcherCharts(kpis);
}

// 6. Other Roles Dashboard Render
function renderRoleDashboard(container, kpis) {
  if (kpis.vehicles.totalActive === 0) {
    container.innerHTML = `<div class="empty-state"><h3>No vehicles match these filters</h3><p>Try resetting or choosing a different combination.</p></div>`;
    return;
  }

  const role = currentUser.role;

  if (role === 'fleet_manager') {
    // Fleet Manager: Fleet & Maintenance Focus
    container.innerHTML = `
      <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
        <div class="kpi-card cyan">
          <span class="kpi-label">Active Vehicles</span>
          <div class="kpi-value">${kpis.vehicles.totalActive}</div>
          <span class="kpi-sub">${kpis.vehicles.available} available · ${kpis.vehicles.retired} retired</span>
        </div>
        <div class="kpi-card green">
          <span class="kpi-label">Fleet Utilization</span>
          <div class="kpi-value">${kpis.utilization}%</div>
          <span class="kpi-sub">${kpis.vehicles.onTrip} on trip · ${kpis.vehicles.inShop} in shop</span>
        </div>
        <div class="kpi-card red">
          <span class="kpi-label">Vehicles in Shop</span>
          <div class="kpi-value">${kpis.vehicles.inShop}</div>
          <span class="kpi-sub">Maintenance logs open</span>
        </div>
      </div>

      <div class="chart-grid" style="grid-template-columns: 1fr 1fr;">
        <div class="card">
          <div class="card-header"><h3 class="card-title">Vehicle Type Distribution</h3></div>
          <div class="chart-container"><canvas id="chart-vehicle-types"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header"><h3 class="card-title">Fleet Status Overview</h3></div>
          <div class="chart-container"><canvas id="chart-fleet-status"></canvas></div>
        </div>
      </div>
    `;
    renderFleetManagerCharts(kpis);

  } else if (role === 'safety_officer') {
    // Safety Officer: Driver Safety Focus
    container.innerHTML = `
      <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
        <div class="kpi-card amber">
          <span class="kpi-label">Drivers On Duty</span>
          <div class="kpi-value">${kpis.drivers.onDuty}</div>
          <span class="kpi-sub">${kpis.drivers.available} available · ${kpis.drivers.suspended} suspended</span>
        </div>
        <div class="kpi-card red">
          <span class="kpi-label">Suspended Accounts</span>
          <div class="kpi-value">${kpis.drivers.suspended}</div>
          <span class="kpi-sub">Safety score lockout active</span>
        </div>
        <div class="kpi-card purple">
          <span class="kpi-label">Expiring Driver Licenses</span>
          <div class="kpi-value">${kpis.expiringLicenses}</div>
          <span class="kpi-sub">License renewal required in &lt;30 days</span>
        </div>
      </div>

      ${kpis.expiringLicenses > 0 ? `
        <div style="background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: var(--radius-sm); padding: 12px 16px; margin-bottom: 20px; display:flex; align-items:center; gap:10px; font-size:0.85rem; color: var(--amber);">
          ⚠️ <strong>${kpis.expiringLicenses} driver license(s)</strong> expiring within 30 days. Review records in Drivers screen or Compliance panel.
        </div>
      ` : ''}

      <div class="chart-grid" style="grid-template-columns: 1fr;">
        <div class="card">
          <div class="card-header"><h3 class="card-title">Regional Fleet Coverage</h3></div>
          <div class="chart-container"><canvas id="chart-regions"></canvas></div>
        </div>
      </div>
    `;
    renderSafetyOfficerCharts(kpis);

  } else {
    // Financial Analyst or Admin: Financial Analytics Focus
    container.innerHTML = `
      <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
        <div class="kpi-card green">
          <span class="kpi-label">Total Revenue</span>
          <div class="kpi-value">${formatCurrency(kpis.financial.totalRevenue)}</div>
          <span class="kpi-sub">From completed trips</span>
        </div>
        <div class="kpi-card red">
          <span class="kpi-label">Operational Cost</span>
          <div class="kpi-value">${formatCurrency(kpis.financial.operationalCost)}</div>
          <span class="kpi-sub">Fuel + Maintenance + Expenses</span>
        </div>
        <div class="kpi-card purple">
          <span class="kpi-label">Fuel Efficiency</span>
          <div class="kpi-value">${kpis.financial.fuelEfficiency}</div>
          <span class="kpi-sub">km/liter average</span>
        </div>
      </div>

      <div class="chart-grid" style="grid-template-columns: 1fr;">
        <div class="card">
          <div class="card-header"><h3 class="card-title">Operational Cost Breakdown</h3></div>
          <div class="chart-container"><canvas id="chart-cost-breakdown"></canvas></div>
        </div>
      </div>
    `;
    renderFinancialAnalystCharts(kpis);
  }
}

// 7. Inline Actions for Dispatcher dashboard console
async function dispatchTripFromDashboard(id) {
  try {
    await api(`/trips/${id}/dispatch`, { method: 'POST' });
    showToast(`Trip #${id} dispatched successfully!`, 'success');
    await fetchDashboardData(); // Refresh counts inline
  } catch (err) {
    showToast(err.error || 'Failed to dispatch trip', 'error');
  }
}

async function completeTripFromDashboard(id) {
  const actual_distance = prompt("Enter actual distance (km):");
  if (actual_distance === null) return;
  const fuel_consumed = prompt("Enter fuel consumed (liters):");
  if (fuel_consumed === null) return;
  const revenue = prompt("Enter revenue earned (₹):");
  if (revenue === null) return;

  try {
    await api(`/trips/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        actual_distance: parseFloat(actual_distance) || 0,
        fuel_consumed: parseFloat(fuel_consumed) || 0,
        revenue: parseFloat(revenue) || 0
      })
    });
    showToast(`Trip #${id} completed.`, 'success');
    await fetchDashboardData(); // Refresh inline
  } catch (err) {
    showToast(err.error || 'Failed to complete trip', 'error');
  }
}

async function cancelTripFromDashboard(id) {
  if (!confirm(`Cancel trip #${id}?`)) return;
  try {
    await api(`/trips/${id}/cancel`, { method: 'POST' });
    showToast(`Trip #${id} cancelled.`, 'warning');
    await fetchDashboardData(); // Refresh inline
  } catch (err) {
    showToast(err.error || 'Failed to cancel trip', 'error');
  }
}

// 8. Chart Rendering helpers
function destroyExistingCharts() {
  Object.values(dashboardCharts).forEach(c => c.destroy());
  dashboardCharts = {};
}

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 16 } }
  }
};

function renderDispatcherCharts(kpis) {
  destroyExistingCharts();

  // Fleet Status Doughnut
  const statusCtx = document.getElementById('chart-fleet-status');
  if (statusCtx) {
    dashboardCharts.status = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: ['Available', 'On Trip', 'In Shop', 'Retired'],
        datasets: [{
          data: [kpis.vehicles.available, kpis.vehicles.onTrip, kpis.vehicles.inShop, kpis.vehicles.retired],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#6b7280'],
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        ...chartDefaults,
        cutout: '65%',
        plugins: { ...chartDefaults.plugins, legend: { ...chartDefaults.plugins.legend, position: 'bottom' } }
      }
    });
  }

  // Regional Bar
  const regionCtx = document.getElementById('chart-regions');
  if (regionCtx) {
    dashboardCharts.regions = new Chart(regionCtx, {
      type: 'bar',
      data: {
        labels: kpis.regionDistribution.map(r => r.region),
        datasets: [{
          label: 'Vehicles',
          data: kpis.regionDistribution.map(r => r.count),
          backgroundColor: ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981'],
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        ...chartDefaults,
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', stepSize: 1 } }
        },
        plugins: { ...chartDefaults.plugins, legend: { display: false } }
      }
    });
  }
}

function renderFleetManagerCharts(kpis) {
  destroyExistingCharts();

  // Types Bar
  const typeCtx = document.getElementById('chart-vehicle-types');
  if (typeCtx) {
    dashboardCharts.types = new Chart(typeCtx, {
      type: 'bar',
      data: {
        labels: kpis.vehicleTypes.map(v => v.type),
        datasets: [{
          label: 'Vehicles',
          data: kpis.vehicleTypes.map(v => v.count),
          backgroundColor: ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b'],
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        ...chartDefaults,
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', stepSize: 1 } }
        },
        plugins: { ...chartDefaults.plugins, legend: { display: false } }
      }
    });
  }

  // Fleet Status Doughnut
  const statusCtx = document.getElementById('chart-fleet-status');
  if (statusCtx) {
    dashboardCharts.status = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: ['Available', 'On Trip', 'In Shop', 'Retired'],
        datasets: [{
          data: [kpis.vehicles.available, kpis.vehicles.onTrip, kpis.vehicles.inShop, kpis.vehicles.retired],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#6b7280'],
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        ...chartDefaults,
        cutout: '65%',
        plugins: { ...chartDefaults.plugins, legend: { ...chartDefaults.plugins.legend, position: 'bottom' } }
      }
    });
  }
}

function renderSafetyOfficerCharts(kpis) {
  destroyExistingCharts();

  const regionCtx = document.getElementById('chart-regions');
  if (regionCtx) {
    dashboardCharts.regions = new Chart(regionCtx, {
      type: 'bar',
      data: {
        labels: kpis.regionDistribution.map(r => r.region),
        datasets: [{
          label: 'Vehicles',
          data: kpis.regionDistribution.map(r => r.count),
          backgroundColor: ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'],
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        ...chartDefaults,
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#64748b', stepSize: 1 } }
        },
        plugins: { ...chartDefaults.plugins, legend: { display: false } }
      }
    });
  }
}

function renderFinancialAnalystCharts(kpis) {
  destroyExistingCharts();

  // Cost Breakdown Doughnut
  const costCtx = document.getElementById('chart-cost-breakdown');
  if (costCtx) {
    dashboardCharts.cost = new Chart(costCtx, {
      type: 'doughnut',
      data: {
        labels: ['Fuel', 'Maintenance', 'Tolls', 'Other'],
        datasets: [{
          data: [kpis.costBreakdown.fuel, kpis.costBreakdown.maintenance, kpis.costBreakdown.tolls, kpis.costBreakdown.other],
          backgroundColor: ['#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444'],
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        ...chartDefaults,
        cutout: '65%',
        plugins: {
          ...chartDefaults.plugins,
          legend: { ...chartDefaults.plugins.legend, position: 'bottom' }
        }
      }
    });
  }
}
