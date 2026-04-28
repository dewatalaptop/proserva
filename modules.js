// ==========================================
// STORAGE KEYS
// ==========================================
const KEYS = {
  BIZ: 'proserva_biz',
  MENUS: 'proserva_menus',
  LOCATIONS: 'proserva_locations',
  RESERVATIONS: 'proserva_reservations',
  SETUP_DONE: 'proserva_setup_done',
  BC_MSG: 'proserva_bc_msg'
};

// ==========================================
// DATABASE (LocalStorage Wrapper)
// ==========================================
const DB = {
  get(key, def = null) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch {
      return def;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch {
      return false;
    }
  }
};

// ==========================================
// GLOBAL STATE
// ==========================================
const state = {
  biz: { name: 'Usaha Saya', type: 'restoran' },
  menus: {},
  locations: {},
  reservations: {},
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  selectedDate: null
};

// ==========================================
// STATE LOAD / SAVE
// ==========================================
function loadState() {
  state.biz = DB.get(KEYS.BIZ, state.biz);
  state.menus = DB.get(KEYS.MENUS, {});
  state.locations = DB.get(KEYS.LOCATIONS, {});
  state.reservations = DB.get(KEYS.RESERVATIONS, {});
}

function saveBiz() { DB.set(KEYS.BIZ, state.biz); }
function saveMenus() { DB.set(KEYS.MENUS, state.menus); }
function saveLocations() { DB.set(KEYS.LOCATIONS, state.locations); }
function saveReservations() { DB.set(KEYS.RESERVATIONS, state.reservations); }

// ==========================================
// UTIL DATE
// ==========================================
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function getMonthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function getResForMonth(year, month) {
  return state.reservations[getMonthKey(year, month)] || [];
}

function getResForDate(dateStr) {
  const mk = dateStr.substring(0, 7);
  return (state.reservations[mk] || []).filter(r => r.date === dateStr);
}

// ==========================================
// CRUD RESERVATION
// ==========================================
function addReservation(res) {
  const mk = res.date.substring(0, 7);
  if (!state.reservations[mk]) state.reservations[mk] = [];
  state.reservations[mk].push(res);
  saveReservations();
}

function updateReservation(res) {
  const mk = res.date.substring(0, 7);
  if (!state.reservations[mk]) return;

  const idx = state.reservations[mk].findIndex(r => r.id === res.id);
  if (idx !== -1) {
    state.reservations[mk][idx] = res;
    saveReservations();
  }
}

function deleteReservation(id) {
  for (let mk in state.reservations) {
    const idx = state.reservations[mk].findIndex(r => r.id === id);
    if (idx !== -1) {
      state.reservations[mk].splice(idx, 1);
      saveReservations();
      return;
    }
  }
}

function findReservationById(id) {
  for (let mk in state.reservations) {
    const r = state.reservations[mk].find(r => r.id === id);
    if (r) return r;
  }
  return null;
}

function getAllReservations() {
  return Object.values(state.reservations).flat();
}

// ==========================================
// ID GENERATOR
// ==========================================
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ==========================================
// FORMAT UTIL
// ==========================================
function formatRupiah(n = 0) {
  return n.toLocaleString('id-ID');
}

function formatK(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'jt';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'rb';
  return n;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

// ==========================================
// TOAST
// ==========================================
function showToast(msg, type = 'success') {
  const icons = {
    success: 'fas fa-check-circle',
    error: 'fas fa-times-circle',
    info: 'fas fa-info-circle'
  };

  const container = document.getElementById('toast-container');
  if (!container) return;

  const div = document.createElement('div');
  div.className = `toast-item toast-${type}`;
  div.innerHTML = `<i class="${icons[type]}"></i> ${msg}`;

  container.appendChild(div);

  setTimeout(() => {
    div.style.opacity = '0';
    div.style.transform = 'translateX(20px)';
    setTimeout(() => div.remove(), 300);
  }, 3000);
