/* ============================================
   TransitOps — Core App (SPA Router + API Client)
   ============================================ */

const API_BASE = '/api';
let authToken = localStorage.getItem('transitops_token');
let currentUser = null;
let currentPage = 'dashboard';

// ===== API Client =====
async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  });

  if (res.status === 401 || res.status === 403) {
    if (endpoint !== '/auth/login') {
      logout();
      return;
    }
  }

  // Handle CSV downloads
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('text/csv')) {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.headers.get('content-disposition')?.split('filename=')[1] || 'report.csv';
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  }

  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

// ===== Auth =====
function fillLogin(btn) {
  document.getElementById('login-email').value = btn.dataset.email;
  document.getElementById('login-password').value = 'password123';
}

let lockoutTimer = null;

function setLoginFormDisabled(disabled) {
  document.getElementById('login-email').disabled = disabled;
  document.getElementById('login-password').disabled = disabled;
  document.getElementById('login-btn').disabled = disabled;
  document.querySelectorAll('.demo-chip').forEach(btn => btn.disabled = disabled);
}

function startLockoutCountdown(lockedUntil) {
  if (lockoutTimer) clearInterval(lockoutTimer);

  const errEl = document.getElementById('login-error');
  errEl.style.display = 'block';

  setLoginFormDisabled(true);

  function update() {
    const now = new Date();
    const lockedUntilDate = new Date(lockedUntil);
    const diffMs = lockedUntilDate - now;

    if (diffMs <= 0) {
      clearInterval(lockoutTimer);
      lockoutTimer = null;
      setLoginFormDisabled(false);
      errEl.style.display = 'none';
      errEl.textContent = '';
      return;
    }

    const totalSecs = Math.ceil(diffMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const padSecs = String(secs).padStart(2, '0');
    const padMins = String(mins).padStart(2, '0');

    errEl.textContent = `Too many attempts. Try again in ${padMins}:${padSecs}`;
  }

  update();
  lockoutTimer = setInterval(update, 1000);
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;margin:0;"></span>';
  errEl.style.display = 'none';

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('transitops_token', authToken);
    window.location.reload(); // Fresh reload cleanly boots the application with user session
  } catch (err) {
    if (err.status === 423 && err.error === 'ACCOUNT_LOCKED') {
      startLockoutCountdown(err.locked_until);
    } else {
      errEl.textContent = err.error || 'Login failed';
      errEl.style.display = 'block';
    }
  } finally {
    if (!lockoutTimer) {
      btn.disabled = false;
      btn.innerHTML = '<span>Sign In</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
    }
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('transitops_token');
  window.location.reload(); // Fresh reload cleanly resets application state
}

// ===== Permission Model =====
// Route-level gating removed — every authenticated user sees all 8 modules.
// Gating lives at the action level inside each page via permGate().

/**
 * Returns true if the currently logged-in user's role has permission
 * for the given resource + action.
 */
function canDo(resource, action) {
  if (!currentUser) return false;
  return window.permissions.canDo(currentUser.role, resource, action);
}

/**
 * Action-level permission gate — the single reusable pattern for every
 * button/control across all 8 pages.
 *
 * If the user HAS permission  → returns buttonHtml unchanged (normal enabled button).
 * If the user LACKS permission → returns the same button visually locked:
 *   - onclick stripped so keyboard Enter cannot trigger it
 *   - aria-disabled="true" so screen readers announce it correctly
 *   - .btn-perm-locked class for the distinct "you can't" visual
 *   - Wrapped in a focusable <span> with title tooltip so keyboard users
 *     (who can't hover) still see which role is needed
 *
 * @param {string} resource        - permission module key (e.g. 'vehicles')
 * @param {string} action          - permission action key  (e.g. 'edit')
 * @param {string} buttonHtml      - The full <button>...</button> HTML string
 */
function permGate(resource, action, buttonHtml) {
  if (canDo(resource, action)) return buttonHtml;
  const ownerRoleKey = window.permissions.ownership[resource];
  const ownerRoleLabel = window.permissions.roleNames[ownerRoleKey] || 'authorized role';
  const tip = `Only ${ownerRoleLabel} can edit this.`;
  // Strip onclick so keyboard Enter or devtools click can't fire the handler
  const stripped = buttonHtml.replace(/\s+onclick="[^"]*"/g, '');
  // Inject .btn-perm-locked + aria-disabled into the opening <button> tag
  const locked = stripped.replace(/<button([^>]*)>/i, (m, attrs) => {
    const withClass = attrs.includes('class=')
      ? attrs.replace(/class="([^"]*)"/, 'class="$1 btn-perm-locked"')
      : `${attrs} class="btn-perm-locked"`;
    return `<button${withClass} aria-disabled="true" tabindex="-1">`;
  });
  // Wrap in a focusable span: keyboard users Tab to the span;
  // title shows on both hover (mouse) and focus (keyboard).
  return `<span class="perm-gate" tabindex="0" title="${tip}" aria-label="${tip}" role="button" aria-disabled="true">${locked}</span>`;
}

async function showApp() {
  if (!currentUser) {
    try {
      currentUser = await api('/auth/me');
    } catch {
      logout();
      return;
    }
  }

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';

  // Set user info in sidebar
  const initials = currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase();
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name').textContent = currentUser.name;
  
  // Format role name nicely from permissions roleNames mapping
  document.getElementById('user-role').textContent = window.permissions.roleNames[currentUser.role] || currentUser.role;

  // All 8 modules visible to every authenticated role — no nav filtering.
  document.querySelectorAll('.nav-item').forEach(item => {
    item.style.display = 'flex';
    
    // Remove any existing badge
    const existingBadge = item.querySelector('.owner-badge');
    if (existingBadge) existingBadge.remove();
    
    // Check if user owns this module
    const page = item.dataset.page;
    const owner = window.permissions.ownership[page];
    if (owner && owner === currentUser.role) {
      // Append a small green dot badge
      const badge = document.createElement('span');
      badge.className = 'owner-badge';
      badge.textContent = '●';
      badge.style.color = '#10B981';
      badge.style.marginLeft = 'auto';
      badge.style.fontSize = '0.75rem';
      badge.title = 'You have edit access in this module';
      item.appendChild(badge);
    }
  });
  navigateTo(currentPage);
}

// applyNavPermissions() removed — all routes reachable by every authenticated role.

// ===== Navigation =====
function navigateTo(page) {
  // No route-level permission check — every authenticated user can reach any page.
  // Action-level gating is handled per-page by permGate().

  currentPage = page;

  // Update active nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // Update page title
  const titles = {
    dashboard: 'Dashboard',
    vehicles: 'Fleet',
    drivers: 'Driver Management',
    compliance: 'Compliance & Safety',
    trips: 'Trip Management',
    maintenance: 'Maintenance & Repairs',
    fuel: 'Fuel & Expenses',
    reports: 'Analytics'
  };
  document.getElementById('page-title').textContent = titles[page] || page;

  // Search box always visible — clear query on page change
  const searchBox = document.getElementById('global-search-box');
  searchBox.style.display = 'flex';
  const searchInput = document.getElementById('global-search');
  searchInput.value = '';
  searchInput.placeholder = {
    vehicles: 'Search fleet…',
    drivers: 'Search drivers…',
    trips: 'Search trips…',
    compliance: 'Search compliance…',
    maintenance: 'Search maintenance…',
    fuel: 'Search expenses…',
    reports: 'Search analytics…',
    dashboard: 'Search…'
  }[page] || 'Search…';

  // Load page content
  const content = document.getElementById('page-content');
  content.innerHTML = '<div class="spinner"></div>';

  // Reset animation
  content.style.animation = 'none';
  content.offsetHeight; // trigger reflow
  content.style.animation = 'fadeIn 0.3s ease';

  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'vehicles': renderVehicles(); break;
    case 'drivers': renderDrivers(); break;
    case 'compliance': renderCompliance(); break;
    case 'trips': renderTrips(); break;
    case 'maintenance': renderMaintenance(); break;
    case 'fuel': renderFuel(); break;
    case 'reports': renderReports(); break;
    default: content.innerHTML = '<div class="empty-state"><h3>Page not found</h3></div>';
  }
}

// ===== Sidebar Toggle =====
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('open');
    sidebar.classList.remove('collapsed');
  } else {
    sidebar.classList.toggle('collapsed');
    sidebar.classList.remove('open');
  }
}

// ===== Modal =====
function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});

// ===== Toast Notifications =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  toast.innerHTML = `<span style="font-size:1.1rem;">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ===== Status Badge Helper =====
function statusBadge(status) {
  const cls = status.toLowerCase().replace(/\s+/g, '-');
  return `<span class="badge badge-${cls}">${status}</span>`;
}

// ===== Format Helpers =====
function formatCurrency(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN');
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  return Math.ceil(diff);
}

// ===== Role Check Helpers (legacy shims — now backed by canDo) =====
// These are kept so that any remaining direct callers still work.
// All new gating MUST use permGate() instead.
function canEdit()         { return canDo('vehicles', 'edit'); }
function isSafetyOfficer() { return canDo('drivers', 'suspend'); }
function canManageTrips()  { return canDo('trips', 'dispatch'); }

// ===== Inline Validation Helpers =====
function showFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  if (input) {
    let errorEl = input.parentNode.querySelector('.field-error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'field-error';
      input.parentNode.appendChild(errorEl);
    }
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    input.focus();
  }
}

function clearFieldErrors() {
  document.querySelectorAll('.field-error').forEach(el => {
    el.style.display = 'none';
    el.textContent = '';
  });
}


// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Nav click handlers
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
      // Close mobile sidebar
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  // Global search
  document.getElementById('global-search').addEventListener('input', (e) => {
    const query = e.target.value;
    if (currentPage === 'vehicles') renderVehicles(query);
    else if (currentPage === 'drivers') renderDrivers(query);
    else if (currentPage === 'compliance') renderCompliance(query);
    else if (currentPage === 'trips') renderTrips(query);
    else if (currentPage === 'maintenance') renderMaintenance(query);
    else if (currentPage === 'fuel') renderFuel(query);
    // dashboard/reports: no text search, ignore silently
  });

  // Check if already logged in
  if (authToken) {
    showApp();
  }
});
