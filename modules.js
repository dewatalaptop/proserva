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
// DATABASE
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
// STATE
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
// LOAD / SAVE
// ==========================================
function loadState() {
  state.biz = DB.get(KEYS.BIZ, state.biz);
  state.menus = DB.get(KEYS.MENUS, {});
  state.locations = DB.get(KEYS.LOCATIONS, {});
  state.reservations = DB.get(KEYS.RESERVATIONS, {});
}

function saveAll() {
  DB.set(KEYS.BIZ, state.biz);
  DB.set(KEYS.MENUS, state.menus);
  DB.set(KEYS.LOCATIONS, state.locations);
  DB.set(KEYS.RESERVATIONS, state.reservations);
}

// ==========================================
// UTIL
// ==========================================
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function formatRupiah(n = 0) {
  return n.toLocaleString('id-ID');
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

// ==========================================
// RESERVATION ENGINE
// ==========================================
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

function addReservation(res) {
  const mk = res.date.substring(0, 7);
  if (!state.reservations[mk]) state.reservations[mk] = [];
  state.reservations[mk].push(res);
  saveAll();
}

function updateReservation(res) {
  const mk = res.date.substring(0, 7);
  const arr = state.reservations[mk] || [];
  const idx = arr.findIndex(r => r.id === res.id);
  if (idx !== -1) {
    arr[idx] = res;
    saveAll();
  }
}

function deleteReservation(id) {
  for (let mk in state.reservations) {
    const idx = state.reservations[mk].findIndex(r => r.id === id);
    if (idx !== -1) {
      state.reservations[mk].splice(idx, 1);
      saveAll();
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
// WIZARD (RESTORED)
// ==========================================
let wizardData = { locations: [], menus: [] };

function wizardNext(step) {
  document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
  document.getElementById(`wizard-${step}`).classList.add('active');
}

function wizardAddLocation() {
  const name = document.getElementById('wz-loc-name').value.trim();
  const cap = parseInt(document.getElementById('wz-loc-cap').value);

  if (!name || !cap) {
    showToast('Isi data lokasi!', 'error');
    return;
  }

  wizardData.locations.push({ name, capacity: cap });
  showToast('Lokasi ditambahkan');
}

function wizardAddMenu() {
  const name = document.getElementById('wz-menu-name').value.trim();
  const price = parseInt(document.getElementById('wz-menu-price').value) || 0;

  if (!name) {
    showToast('Isi nama menu!', 'error');
    return;
  }

  wizardData.menus.push({ name, price, details: [] });
  showToast('Menu ditambahkan');
}

function wizardFinish() {
  const name = document.getElementById('wz-biz-name').value.trim();
  if (!name) {
    showToast('Nama usaha wajib diisi!', 'error');
    return;
  }

  state.biz.name = name;

  wizardData.locations.forEach(l => {
    state.locations[genId()] = l;
  });

  wizardData.menus.forEach(m => {
    state.menus[genId()] = m;
  });

  saveAll();
  DB.set(KEYS.SETUP_DONE, true);

  location.reload();
}

// ==========================================
// CUSTOMERS
// ==========================================
function buildCustomerList() {
  const all = getAllReservations();
  const map = {};

  all.forEach(r => {
    const key = r.nomorHp || r.nama;
    if (!map[key]) {
      map[key] = { nama: r.nama, nomorHp: r.nomorHp, count: 0 };
    }
    map[key].count++;
  });

  return Object.values(map);
}

// ==========================================
// WHATSAPP
// ==========================================
function openWhatsApp(phone, msg) {
  const formatted = phone.replace(/^0/, '62');
  window.open(`https://wa.me/${formatted}?text=${encodeURIComponent(msg)}`);
}

// ==========================================
// BROADCAST
// ==========================================
function saveBroadcastMsg() {
  const msg = document.getElementById('broadcast-msg').value.trim();
  if (!msg) {
    showToast('Pesan kosong!', 'error');
    return;
  }
  localStorage.setItem(KEYS.BC_MSG, msg);
  showToast('Pesan disimpan');
}

// ==========================================
// EXPORT / IMPORT
// ==========================================
function handleExport() {
  const data = {
    biz: state.biz,
    menus: state.menus,
    locations: state.locations,
    reservations: state.reservations
  };

  const encoded = btoa(JSON.stringify(data));
  prompt('Copy data:', encoded);
}

// ==========================================
// TOAST
// ==========================================
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const div = document.createElement('div');
  div.className = `toast-item toast-${type}`;
  div.textContent = msg;

  container.appendChild(div);

  setTimeout(() => {
    div.remove();
  }, 2500);
}