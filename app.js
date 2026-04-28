// ==========================================
// BOOT
// ==========================================
document.addEventListener('DOMContentLoaded', boot);

function boot() {
  if (DB.get(KEYS.SETUP_DONE)) {
    document.getElementById('setup-wizard').style.display = 'none';
    document.getElementById('app-shell').style.display = 'block';
    initApp();
  } else {
    renderSetupWizard();
    document.getElementById('setup-wizard').style.display = 'block';
  }
}

// ==========================================
// INIT APP
// ==========================================
function initApp() {
  loadState();

  renderTopbar();
  renderSidebar();
  renderCalendarView();

  showView('calendar');
}

// ==========================================
// RENDER COMPONENTS
// ==========================================
function renderTopbar() {
  document.getElementById('topbar').innerHTML = `
    <div class="brand">
      <div class="brand-logo"><i class="fas fa-calendar-check"></i></div>
      <div>
        <div class="brand-name">${state.biz.name}</div>
        <span class="brand-tag">Reservation Engine</span>
      </div>
    </div>
    <div>
      <button class="topbar-btn" onclick="forceSync()">
        <i class="fas fa-sync"></i> Sync
      </button>
    </div>
  `;
}

function renderSidebar() {
  document.getElementById('sidebar').innerHTML = `
    <div class="nav-item active" onclick="showView('calendar')" data-view="calendar">
      <i class="fas fa-calendar-alt"></i> Kalender
    </div>
    <div class="nav-item" onclick="showView('menus')" data-view="menus">
      <i class="fas fa-book"></i> Menu
    </div>
    <div class="nav-item" onclick="showView('locations')" data-view="locations">
      <i class="fas fa-map-marker-alt"></i> Lokasi
    </div>
  `;
}

// ==========================================
// VIEW ROUTING
// ==========================================
function showView(name) {
  document.querySelectorAll('#content > div').forEach(v => v.style.display = 'none');
  const el = document.getElementById(`view-${name}`);
  if (el) el.style.display = 'block';

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === name);
  });

  if (name === 'calendar') renderCalendarView();
  if (name === 'menus') renderMenusView();
  if (name === 'locations') renderLocationsView();
}

// ==========================================
// CALENDAR VIEW
// ==========================================
function renderCalendarView() {
  const el = document.getElementById('view-calendar');

  const m = state.currentMonth;
  const y = state.currentYear;

  const monthRes = getResForMonth(y, m);

  el.innerHTML = `
    <h1>${MONTHS[m]} ${y}</h1>
    <p>Total reservasi: ${monthRes.length}</p>

    <button onclick="navMonth(-1)">◀</button>
    <button onclick="navMonth(1)">▶</button>

    <div id="calendar-days"></div>
  `;

  renderCalendarDays();
}

function renderCalendarDays() {
  const el = document.getElementById('calendar-days');
  const m = state.currentMonth;
  const y = state.currentYear;

  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let html = '';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const count = getResForDate(dateStr).length;

    html += `
      <div class="cal-day" onclick="selectDate('${dateStr}')">
        <b>${d}</b><br/>
        ${count ? count + ' reservasi' : ''}
      </div>
    `;
  }

  el.innerHTML = html;
}

function navMonth(dir) {
  state.currentMonth += dir;
  if (state.currentMonth < 0) {
    state.currentMonth = 11;
    state.currentYear--;
  }
  if (state.currentMonth > 11) {
    state.currentMonth = 0;
    state.currentYear++;
  }
  renderCalendarView();
}

function selectDate(dateStr) {
  state.selectedDate = dateStr;
  showToast('Tanggal dipilih: ' + formatDateDisplay(dateStr));
}

// ==========================================
// MENUS VIEW
// ==========================================
function renderMenusView() {
  const el = document.getElementById('view-menus');

  const menus = Object.values(state.menus);

  el.innerHTML = `
    <h2>Menu</h2>
    <button onclick="addDummyMenu()">+ Tambah</button>
    <ul>
      ${menus.map(m => `<li>${m.name} - Rp${formatRupiah(m.price)}</li>`).join('')}
    </ul>
  `;
}

function addDummyMenu() {
  const id = genId();
  state.menus[id] = { name: 'Menu Baru', price: 10000, details: [] };
  saveMenus();
  renderMenusView();
}

// ==========================================
// LOCATIONS VIEW
// ==========================================
function renderLocationsView() {
  const el = document.getElementById('view-locations');

  const locs = Object.values(state.locations);

  el.innerHTML = `
    <h2>Lokasi</h2>
    <button onclick="addDummyLocation()">+ Tambah</button>
    <ul>
      ${locs.map(l => `<li>${l.name} (${l.capacity} orang)</li>`).join('')}
    </ul>
  `;
}

function addDummyLocation() {
  const id = genId();
  state.locations[id] = { name: 'Tempat Baru', capacity: 10 };
  saveLocations();
  renderLocationsView();
}

// ==========================================
// SETUP WIZARD (MINIMAL)
// ==========================================
function renderSetupWizard() {
  document.getElementById('wizard-root').innerHTML = `
    <h2>Setup Awal</h2>
    <input id="biz-name" placeholder="Nama usaha"/>
    <button onclick="finishSetup()">Mulai</button>
  `;
}

function finishSetup() {
  const name = document.getElementById('biz-name').value.trim();
  if (!name) {
    showToast('Isi nama usaha!', 'error');
    return;
  }

  state.biz.name = name;
  saveBiz();

  DB.set(KEYS.SETUP_DONE, true);

  document.getElementById('setup-wizard').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';

  initApp();
}

// ==========================================
// SYNC
// ==========================================
function forceSync() {
  loadState();
  renderCalendarView();
  showToast('Data disinkronkan', 'info');
}