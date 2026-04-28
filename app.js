// ==========================================
// BOOT
// ==========================================
document.addEventListener('DOMContentLoaded', boot);

function boot() {
  try {
    if (DB.get(KEYS.SETUP_DONE)) {
      document.getElementById('setup-wizard').style.display = 'none';
      document.getElementById('app-shell').style.display = 'block';
      initApp();
    } else {
      document.getElementById('setup-wizard').style.display = 'block';
    }
  } catch (e) {
    console.error('Boot error:', e);
  }
}

// ==========================================
// INIT
// ==========================================
function initApp() {
  loadState();
  bindGlobals();

  renderTopbar();
  renderCalendar();
  renderMenusTable();
  renderLocationsTable();
  renderCustomersTable();
  renderBroadcastList();
  runAnalysis();
}

// expose ke global (fix inline onclick)
function bindGlobals() {
  window.showView = showView;
  window.navMonth = navMonth;
  window.selectDate = selectDate;
  window.openAddReservationModal = openAddReservationModal;
  window.saveReservation = saveReservation;
  window.deleteRes = deleteRes;
  window.openMenuModal = openMenuModal;
  window.openLocationModal = openLocationModal;
  window.saveMenu = saveMenu;
  window.saveLocation = saveLocation;
  window.filterCustomers = filterCustomers;
  window.saveBroadcastMsg = saveBroadcastMsg;
  window.handleExport = handleExport;
  window.forceSync = forceSync;
}

// ==========================================
// VIEW ROUTING
// ==========================================
function showView(name) {
  document.querySelectorAll('#content > div').forEach(v => v.style.display = 'none');
  document.getElementById('view-' + name).style.display = 'block';

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === name);
  });

  if (name === 'menus') renderMenusTable();
  if (name === 'locations') renderLocationsTable();
  if (name === 'customers') renderCustomersTable();
  if (name === 'analysis') runAnalysis();
  if (name === 'broadcast') renderBroadcastList();
}

// ==========================================
// TOPBAR
// ==========================================
function renderTopbar() {
  document.getElementById('cal-biz-name').textContent = state.biz.name;
  document.getElementById('cal-subtitle').textContent =
    'Kelola reservasi dengan mudah';
}

// ==========================================
// CALENDAR
// ==========================================
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

  renderCalendar();
}

function renderCalendar() {
  const m = state.currentMonth;
  const y = state.currentYear;

  document.getElementById('cal-month-label').textContent =
    MONTHS[m] + ' ' + y;

  const daysEl = document.getElementById('cal-days');
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let html = '';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr =
      `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const count = getResForDate(dateStr).length;

    html += `
      <div class="cal-day" onclick="selectDate('${dateStr}')">
        <div>${d}</div>
        ${count ? `<small>${count} reservasi</small>` : ''}
      </div>
    `;
  }

  daysEl.innerHTML = html;
}

function selectDate(dateStr) {
  state.selectedDate = dateStr;

  document.getElementById('view-calendar').style.display = 'none';
  document.getElementById('view-detail').style.display = 'block';

  document.getElementById('detail-title').textContent =
    formatDateDisplay(dateStr);

  renderDetailList(getResForDate(dateStr));
}

// ==========================================
// DETAIL LIST
// ==========================================
function renderDetailList(list) {
  const el = document.getElementById('detail-list');

  if (!list.length) {
    el.innerHTML = '<p>Tidak ada reservasi</p>';
    return;
  }

  el.innerHTML = list.map(r => `
    <div class="res-card">
      <b>${r.nama}</b><br/>
      ${r.jam} • ${r.tempat} • ${r.jumlah} org
      <br/>
      <button onclick="deleteRes('${r.id}')">Hapus</button>
    </div>
  `).join('');
}

// ==========================================
// RESERVATION CRUD
// ==========================================
function openAddReservationModal() {
  const nama = prompt('Nama tamu:');
  if (!nama) return;

  const jumlah = parseInt(prompt('Jumlah tamu:')) || 1;

  const res = {
    id: genId(),
    date: state.selectedDate,
    nama,
    jumlah,
    jam: '18:00',
    tempat: '-'
  };

  addReservation(res);
  renderDetailList(getResForDate(state.selectedDate));
  renderCalendar();
}

function saveReservation() {
  // sudah handled di prompt version
}

function deleteRes(id) {
  if (!confirm('Hapus?')) return;

  deleteReservation(id);
  renderDetailList(getResForDate(state.selectedDate));
  renderCalendar();
}

// ==========================================
// MENUS
// ==========================================
function renderMenusTable() {
  const tbody = document.getElementById('menus-tbody');
  const arr = Object.entries(state.menus);

  if (!arr.length) {
    tbody.innerHTML = '<tr><td>Belum ada menu</td></tr>';
    return;
  }

  tbody.innerHTML = arr.map(([id, m]) => `
    <tr>
      <td>${m.name}</td>
      <td>Rp${formatRupiah(m.price)}</td>
    </tr>
  `).join('');
}

function openMenuModal() {
  const name = prompt('Nama menu:');
  if (!name) return;

  state.menus[genId()] = { name, price: 10000, details: [] };
  saveAll();
  renderMenusTable();
}

// ==========================================
// LOCATIONS
// ==========================================
function renderLocationsTable() {
  const tbody = document.getElementById('locations-tbody');
  const arr = Object.entries(state.locations);

  if (!arr.length) {
    tbody.innerHTML = '<tr><td>Belum ada lokasi</td></tr>';
    return;
  }

  tbody.innerHTML = arr.map(([id, l]) => `
    <tr>
      <td>${l.name}</td>
      <td>${l.capacity}</td>
    </tr>
  `).join('');
}

function openLocationModal() {
  const name = prompt('Nama lokasi:');
  const cap = parseInt(prompt('Kapasitas:'));

  if (!name || !cap) return;

  state.locations[genId()] = { name, capacity: cap };
  saveAll();
  renderLocationsTable();
}

// ==========================================
// CUSTOMERS
// ==========================================
function renderCustomersTable(filter = '') {
  const list = buildCustomerList();
  const tbody = document.getElementById('customers-tbody');

  const filtered = filter
    ? list.filter(c =>
        c.nama.toLowerCase().includes(filter.toLowerCase())
      )
    : list;

  tbody.innerHTML = filtered.map(c => `
    <tr>
      <td>${c.nama}</td>
      <td>${c.nomorHp || '-'}</td>
      <td>${c.count}x</td>
    </tr>
  `).join('');
}

function filterCustomers(q) {
  renderCustomersTable(q);
}

// ==========================================
// BROADCAST
// ==========================================
function renderBroadcastList() {
  const el = document.getElementById('bc-list');
  const list = buildCustomerList();

  el.innerHTML = list.map(c => `
    <div>
      ${c.nama}
      ${c.nomorHp ? `<button onclick="openWhatsApp('${c.nomorHp}','Halo ${c.nama}')">WA</button>` : ''}
    </div>
  `).join('');
}

// ==========================================
// ANALYSIS
// ==========================================
function runAnalysis() {
  const all = getAllReservations();

  document.getElementById('anl-stats').innerHTML =
    `Total Reservasi: ${all.length}`;

  const ctx = document.getElementById('anl-chart');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Reservasi'],
      datasets: [{
        data: [all.length]
      }]
    }
  });
}

// ==========================================
// SYNC
// ==========================================
function forceSync() {
  loadState();
  renderCalendar();
  showToast('Data diperbarui', 'info');
}