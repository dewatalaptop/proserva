'use strict';

/* ============================================================
   PROSERVA MODULES
   PART 1/15
   FOUNDATION + CONFIG + HELPERS + EVENT BUS
   ============================================================ */

/* ============================================================
   1. GLOBAL CONFIG (FUTURE SAFE)
   ============================================================ */

const CONFIG = {

  // Mode data source (future: firebase)
  DATA_MODE: 'local', // 'local' | 'firebase'

  // Reservation rules (bisa dipakai nanti)
  MAX_CAPACITY_PER_SLOT: 20,

  // Debug
  DEBUG: true

};


/* ============================================================
   2. GLOBAL STATE (LIGHTWEIGHT)
   ============================================================ */

const STATE = {

  selectedDate: null,
  selectedMonth: new Date().getMonth(),
  selectedYear: new Date().getFullYear(),

  reservationsCache: null // cache untuk performa

};


/* ============================================================
   3. SAFE LOGGER (ANTI SPAM PRODUCTION)
   ============================================================ */

const Logger = (() => {

  function log(...args) {
    if (!CONFIG.DEBUG) return;
    console.log('[Proserva]', ...args);
  }

  function warn(...args) {
    if (!CONFIG.DEBUG) return;
    console.warn('[Proserva]', ...args);
  }

  function error(...args) {
    console.error('[Proserva]', ...args);
  }

  return {
    log,
    warn,
    error
  };

})();


/* ============================================================
   4. UTILS (NO DEPENDENCY, PURE)
   ============================================================ */

const Utils = (() => {

  function generateId() {
    return crypto.randomUUID();
  }

  function formatDate(year, month, day) {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  }

  function today() {
    const now = new Date();
    return formatDate(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
  }

  function debounce(fn, delay = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

  return {
    generateId,
    formatDate,
    today,
    clamp,
    debounce
  };

})();


/* ============================================================
   5. EVENT BUS (CRITICAL FOR SCALING UI)
   ============================================================ */

const Events = (() => {

  const listeners = {};

  function on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
  }

  function off(event, callback) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(cb => cb !== callback);
  }

  function emit(event, data) {
    if (!listeners[event]) return;
    listeners[event].forEach(cb => cb(data));
  }

  return {
    on,
    off,
    emit
  };

})();


/* ============================================================
   6. DOM HELPERS (SAFE QUERY)
   ============================================================ */

const DOM = (() => {

  function get(selector) {
    return document.querySelector(selector);
  }

  function getAll(selector) {
    return document.querySelectorAll(selector);
  }

  function html(el, content) {
    if (!el) return;
    el.innerHTML = content;
  }

  function show(el) {
    if (!el) return;
    el.classList.remove('hidden');
  }

  function hide(el) {
    if (!el) return;
    el.classList.add('hidden');
  }

  return {
    get,
    getAll,
    html,
    show,
    hide
  };

})();


/* ============================================================
   7. SAFE INIT GUARD
   ============================================================ */

let __APP_INITIALIZED__ = false;

function guardInit() {
  if (__APP_INITIALIZED__) {
    Logger.warn('App already initialized');
    return false;
  }
  __APP_INITIALIZED__ = true;
  return true;
}
/* ============================================================
   PROSERVA MODULES
   PART 2/15
   DATA LAYER (DB) — LOCAL + FIREBASE READY
   ============================================================ */

/* ============================================================
   1. STORAGE KEYS
   ============================================================ */

const KEYS = {
  reservations: 'psv_reservations_v1',
  settings: 'psv_settings_v1'
};


/* ============================================================
   2. INTERNAL STORAGE (LOCAL)
   ============================================================ */

const LocalDB = (() => {

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      Logger.error('LocalDB read error', err);
      return [];
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      Logger.error('LocalDB write error', err);
    }
  }

  return {
    read,
    write
  };

})();


/* ============================================================
   3. DB ADAPTER (ABSTRACTION LAYER)
   ============================================================ */

const DB = (() => {

  /* =========================
     CACHE SYSTEM
     ========================= */

  function invalidateCache() {
    STATE.reservationsCache = null;
  }

  function setCache(data) {
    STATE.reservationsCache = data;
  }

  function getCache() {
    return STATE.reservationsCache;
  }

  /* =========================
     CORE METHODS
     ========================= */

  async function getAllReservations() {

    // gunakan cache dulu
    if (getCache()) {
      return getCache();
    }

    let data;

    if (CONFIG.DATA_MODE === 'local') {
      data = LocalDB.read(KEYS.reservations);
    } else {
      // 🔥 placeholder firebase
      data = [];
    }

    setCache(data);
    return data;
  }


  async function insertReservation(item) {

    let data = await getAllReservations();

    data.push(item);

    if (CONFIG.DATA_MODE === 'local') {
      LocalDB.write(KEYS.reservations, data);
    } else {
      // firebase nanti
    }

    invalidateCache();

    Events.emit('reservation:changed');

    return item;
  }


  async function updateReservation(id, patch) {

    let data = await getAllReservations();

    const idx = data.findIndex(r => r.id === id);
    if (idx === -1) return null;

    data[idx] = { ...data[idx], ...patch };

    if (CONFIG.DATA_MODE === 'local') {
      LocalDB.write(KEYS.reservations, data);
    } else {
      // firebase nanti
    }

    invalidateCache();

    Events.emit('reservation:changed');

    return data[idx];
  }


  async function deleteReservation(id) {

    let data = await getAllReservations();

    data = data.filter(r => r.id !== id);

    if (CONFIG.DATA_MODE === 'local') {
      LocalDB.write(KEYS.reservations, data);
    } else {
      // firebase nanti
    }

    invalidateCache();

    Events.emit('reservation:changed');
  }


  /* =========================
     FILTER HELPERS
     ========================= */

  async function getByDate(date) {
    const data = await getAllReservations();
    return data.filter(r => r.date === date);
  }


  async function getByStatus(status) {
    const data = await getAllReservations();
    return data.filter(r => r.status === status);
  }


  return {
    getAllReservations,
    insertReservation,
    updateReservation,
    deleteReservation,
    getByDate,
    getByStatus
  };

})();
/* ============================================================
   PROSERVA MODULES
   PART 3/15 (FIXED)
   RESERVATION MODULE (BUSINESS LOGIC CORE)
   ============================================================ */

const Reservation = (() => {

  /* ============================================================
     1. CONSTANTS
     ============================================================ */

  const STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    ONGOING: 'ongoing',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  };


  /* ============================================================
     2. VALIDATION
     ============================================================ */

  function validate(payload) {

    if (!payload.name || payload.name.trim().length < 2) {
      throw new Error('Nama minimal 2 karakter');
    }

    if (!payload.date) {
      throw new Error('Tanggal wajib diisi');
    }

    if (!payload.time) {
      throw new Error('Waktu wajib diisi');
    }

    if (!payload.guests || payload.guests < 1) {
      throw new Error('Jumlah tamu tidak valid');
    }

    return true;
  }


  /* ============================================================
     3. NORMALIZATION
     ============================================================ */

  function normalize(payload) {
    return {
      id: Utils.generateId(), // ✅ FIXED (sebelumnya Utils.uuid)

      name: payload.name.trim(),
      phone: payload.phone || '',
      note: payload.note || '',

      date: payload.date,
      time: payload.time,

      guests: Number(payload.guests) || 1,

      table: payload.table || null,

      status: STATUS.PENDING,

      menus: payload.menus || [],

      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }


  /* ============================================================
     4. CAPACITY GUARD (ANTI OVERBOOKING)
     ============================================================ */

  async function checkCapacity(date, guests) {

    const list = await DB.getByDate(date);

    const totalGuests = list.reduce((sum, r) => {
      if (r.status === STATUS.CANCELLED) return sum;
      return sum + (r.guests || 0);
    }, 0);

    const max = CONFIG.MAX_CAPACITY_PER_SLOT; // ✅ FIXED

    if ((totalGuests + guests) > max) {
      throw new Error('Kapasitas penuh');
    }

    return true;
  }


  /* ============================================================
     5. CREATE RESERVATION
     ============================================================ */

  async function create(payload) {

    validate(payload);

    await checkCapacity(payload.date, payload.guests);

    const data = normalize(payload);

    return DB.insertReservation(data);
  }


  /* ============================================================
     6. UPDATE RESERVATION
     ============================================================ */

  async function update(id, patch) {

    patch.updatedAt = Date.now();

    return DB.updateReservation(id, patch);
  }


  /* ============================================================
     7. DELETE
     ============================================================ */

  async function remove(id) {
    return DB.deleteReservation(id);
  }


  /* ============================================================
     8. STATUS FLOW (CONTROLLED)
     ============================================================ */

  function getNextStatus(current) {

    switch (current) {
      case STATUS.PENDING:
        return STATUS.CONFIRMED;

      case STATUS.CONFIRMED:
        return STATUS.ONGOING;

      case STATUS.ONGOING:
        return STATUS.COMPLETED;

      default:
        return current;
    }
  }


  async function advanceStatus(id) {

    const list = await DB.getAllReservations();
    const item = list.find(r => r.id === id);

    if (!item) return null;

    const next = getNextStatus(item.status);

    return update(id, { status: next });
  }


  async function cancel(id) {
    return update(id, { status: STATUS.CANCELLED });
  }


  /* ============================================================
     9. HELPERS
     ============================================================ */

  async function getAll() {
    return DB.getAllReservations();
  }

  async function getByDate(date) {
    return DB.getByDate(date);
  }


  return {
    STATUS,
    create,
    update,
    remove,
    advanceStatus,
    cancel,
    getAll,
    getByDate
  };

})();
/* ============================================================
   PROSERVA MODULES
   PART 4/15 (FIXED)
   CALENDAR MODULE (ENGINE + DATA MAPPING)
   ============================================================ */

const Calendar = (() => {

  /* ============================================================
     1. STATE
     ============================================================ */

  let current = new Date(); // bulan aktif
  let selectedDate = null;


  /* ============================================================
     2. DATE HELPERS
     ============================================================ */

  function formatDate(date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  function isToday(date) {
    const today = new Date();
    return formatDate(today) === formatDate(date);
  }

  function clone(date) {
    return new Date(date.getTime());
  }


  /* ============================================================
     3. GENERATE GRID (42 CELLS SAFE)
     ============================================================ */

  function generateGrid(baseDate) {

    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay(); // 0 = Minggu

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const grid = [];

    // selalu 42 cell (6 minggu)
    for (let i = 0; i < 42; i++) {

      const dayIndex = i - startDay + 1;

      if (dayIndex < 1 || dayIndex > daysInMonth) {
        grid.push({
          empty: true
        });
        continue;
      }

      const date = new Date(year, month, dayIndex);
      const dateStr = formatDate(date);

      grid.push({
        date,
        dateStr,
        day: dayIndex,
        today: isToday(date),
        selected: selectedDate === dateStr,
        empty: false
      });
    }

    return grid;
  }


  /* ============================================================
     4. CAPACITY CLASSIFIER
     ============================================================ */

  function getCapacityLevel(totalGuests) {

    const max = CONFIG.MAX_CAPACITY_PER_SLOT; // ✅ FIXED

    if (!max) return 'low';

    if (totalGuests <= max * 0.4) return 'low';
    if (totalGuests <= max * 0.8) return 'medium';
    return 'high';
  }


  /* ============================================================
     5. ATTACH RESERVATION DATA
     ============================================================ */

  async function attachReservations(grid) {

    const reservations = await Reservation.getAll();

    const map = {};

    // group by date
    reservations.forEach(r => {
      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    });

    return grid.map(cell => {

      if (cell.empty) return cell;

      const list = map[cell.dateStr] || [];

      const activeList = list.filter(
        r => r.status !== Reservation.STATUS.CANCELLED
      );

      const totalGuests = activeList.reduce(
        (sum, r) => sum + (r.guests || 0),
        0
      );

      return {
        ...cell,

        reservations: list,
        total: list.length,
        guests: totalGuests,

        level: getCapacityLevel(totalGuests),

        preview: activeList.slice(0, 3).map(r => r.name)
      };
    });
  }


  /* ============================================================
     6. PUBLIC API: GET CALENDAR DATA
     ============================================================ */

  async function getCalendar() {

    const grid = generateGrid(current);
    const enriched = await attachReservations(grid);

    return {
      month: current.getMonth(),
      year: current.getFullYear(),
      grid: enriched
    };
  }


  /* ============================================================
     7. NAVIGATION
     ============================================================ */

  function nextMonth() {
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  function prevMonth() {
    current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
  }


  /* ============================================================
     8. SELECTION
     ============================================================ */

  function select(dateStr) {
    selectedDate = dateStr;
  }

  function getSelected() {
    return selectedDate;
  }


  /* ============================================================
     9. RESET
     ============================================================ */

  function resetToToday() {
    current = new Date();
    selectedDate = formatDate(current);
  }


  return {
    getCalendar,
    nextMonth,
    prevMonth,
    select,
    getSelected,
    resetToToday
  };

})();
/* ============================================================
   PROSERVA MODULES
   PART 5/15
   UI CONTROLLER (RENDER + EVENT BRIDGE)
   ============================================================ */

const UI = (() => {

  /* ============================================================
     1. ELEMENT REFERENCES (CACHE)
     ============================================================ */

  const el = {
    calendarGrid: document.getElementById('calendar-grid'),
    monthLabel: document.getElementById('calendar-month'),

    prevBtn: document.getElementById('btn-prev-month'),
    nextBtn: document.getElementById('btn-next-month'),

    detailList: document.getElementById('reservation-list'),

    emptyState: document.getElementById('empty-state')
  };


  /* ============================================================
     2. FORMATTER
     ============================================================ */

  function formatMonth(month, year) {
    const names = [
      'Januari','Februari','Maret','April','Mei','Juni',
      'Juli','Agustus','September','Oktober','November','Desember'
    ];
    return `${names[month]} ${year}`;
  }


  /* ============================================================
     3. RENDER CALENDAR
     ============================================================ */

  async function renderCalendar() {

    const data = await Calendar.getCalendar();

    // update title
    el.monthLabel.textContent = formatMonth(data.month, data.year);

    // clear grid
    el.calendarGrid.innerHTML = '';

    data.grid.forEach(day => {

      const div = document.createElement('div');

      div.className = 'cal-day';

      if (day.empty) {
        div.classList.add('empty');
        el.calendarGrid.appendChild(div);
        return;
      }

      // state
      if (day.today) div.classList.add('today');
      if (day.selected) div.classList.add('selected');

      // capacity
      if (day.level) div.classList.add(day.level);

      // click
      div.addEventListener('click', () => {
        Calendar.select(day.dateStr);
        renderCalendar();
        renderDetail(day.dateStr);
      });

      // content
      div.innerHTML = `
        <div class="cal-day-num">${day.day}</div>

        ${day.total > 0 ? `
          <div class="cal-res-pill">${day.total} reservasi</div>
        ` : ''}

        <div class="cal-mini-names">
          ${day.preview.map(n => `<div class="cal-mini-name">${n}</div>`).join('')}
        </div>
      `;

      el.calendarGrid.appendChild(div);
    });
  }


  /* ============================================================
     4. RENDER DETAIL LIST
     ============================================================ */

  async function renderDetail(dateStr) {

    if (!dateStr) {
      el.detailList.innerHTML = '';
      return;
    }

    const list = await Reservation.getByDate(dateStr);

    if (!list.length) {
      el.detailList.innerHTML = `
        <div class="empty-state">Belum ada reservasi</div>
      `;
      return;
    }

    el.detailList.innerHTML = '';

    list.forEach(item => {

      const card = document.createElement('div');
      card.className = 'res-card';
      card.dataset.status = item.status;

      card.innerHTML = `
        <div class="rc-top">
          <div class="rc-name">
            <div class="rc-avatar">${item.name.charAt(0).toUpperCase()}</div>
            ${item.name}
          </div>

          <div class="rc-badges">
            <div class="status status-${item.status}">${item.status}</div>
          </div>
        </div>

        <div class="rc-info">
          <div>⏰ ${item.time}</div>
          <div>👥 ${item.guests} orang</div>
        </div>

        <div class="rc-footer">
          <button class="btn btn-sm btn-done" data-action="next">Next</button>
          <button class="btn btn-sm btn-cancel" data-action="cancel">Cancel</button>
        </div>
      `;

      // ACTIONS
      card.querySelector('[data-action="next"]').addEventListener('click', async () => {
        await Reservation.advanceStatus(item.id);
        renderDetail(dateStr);
        renderCalendar();
      });

      card.querySelector('[data-action="cancel"]').addEventListener('click', async () => {
        await Reservation.cancel(item.id);
        renderDetail(dateStr);
        renderCalendar();
      });

      el.detailList.appendChild(card);
    });
  }


  /* ============================================================
     5. NAVIGATION EVENTS
     ============================================================ */

  function bindNav() {

    el.prevBtn.addEventListener('click', () => {
      Calendar.prevMonth();
      renderCalendar();
    });

    el.nextBtn.addEventListener('click', () => {
      Calendar.nextMonth();
      renderCalendar();
    });

  }


  /* ============================================================
     6. INITIAL LOAD
     ============================================================ */

  async function init() {
    Calendar.resetToToday();

    await renderCalendar();

    const today = Calendar.getSelected();
    await renderDetail(today);

    bindNav();
  }


  return {
    init,
    renderCalendar,
    renderDetail
  };

})();
/* ============================================================
   PROSERVA MODULES
   PART 6/15
   MODAL + FORM CONTROLLER
   ============================================================ */

const Form = (() => {

  /* ============================================================
     1. ELEMENT REFERENCES
     ============================================================ */

  const el = {
    modal: document.getElementById('reservation-modal'),
    openBtn: document.getElementById('btn-open-modal'),
    closeBtn: document.getElementById('modal-close'),

    form: document.getElementById('reservation-form'),

    name: document.getElementById('input-name'),
    phone: document.getElementById('input-phone'),
    date: document.getElementById('input-date'),
    time: document.getElementById('input-time'),
    guests: document.getElementById('input-guests'),
    note: document.getElementById('input-note'),

    submit: document.getElementById('btn-submit')
  };


  /* ============================================================
     2. MODAL CONTROL
     ============================================================ */

  function open() {
    el.modal.classList.add('open');
    document.body.classList.add('lock-scroll');
  }

  function close() {
    el.modal.classList.remove('open');
    document.body.classList.remove('lock-scroll');
    resetForm();
  }


  /* ============================================================
     3. FORM UTILITIES
     ============================================================ */

  function getValues() {
    return {
      name: el.name.value,
      phone: el.phone.value,
      date: el.date.value,
      time: el.time.value,
      guests: Number(el.guests.value),
      note: el.note.value
    };
  }

  function resetForm() {
    el.form.reset();
    clearErrors();
  }


  /* ============================================================
     4. ERROR HANDLING (UI ONLY)
     ============================================================ */

  function showError(input, message) {
    input.classList.add('error');

    let err = input.parentElement.querySelector('.form-error');

    if (!err) {
      err = document.createElement('div');
      err.className = 'form-error';
      input.parentElement.appendChild(err);
    }

    err.textContent = message;
    err.classList.add('show');
  }

  function clearErrors() {
    el.form.querySelectorAll('.input').forEach(i => {
      i.classList.remove('error');
    });

    el.form.querySelectorAll('.form-error').forEach(e => {
      e.classList.remove('show');
    });
  }


  /* ============================================================
     5. VALIDATION (UI LEVEL)
     ============================================================ */

  function validate(values) {

    clearErrors();

    let valid = true;

    if (!values.name || values.name.length < 2) {
      showError(el.name, 'Nama minimal 2 karakter');
      valid = false;
    }

    if (!values.date) {
      showError(el.date, 'Tanggal wajib diisi');
      valid = false;
    }

    if (!values.time) {
      showError(el.time, 'Waktu wajib diisi');
      valid = false;
    }

    if (!values.guests || values.guests < 1) {
      showError(el.guests, 'Jumlah tamu tidak valid');
      valid = false;
    }

    return valid;
  }


  /* ============================================================
     6. SUBMIT HANDLER
     ============================================================ */

  async function handleSubmit(e) {
    e.preventDefault();

    const values = getValues();

    if (!validate(values)) return;

    try {

      el.submit.classList.add('btn-loading');

      await Reservation.create(values);

      close();

      // refresh UI
      UI.renderCalendar();

      const selected = Calendar.getSelected();
      if (selected) UI.renderDetail(selected);

    } catch (err) {
      alert(err.message);
    } finally {
      el.submit.classList.remove('btn-loading');
    }
  }


  /* ============================================================
     7. EVENT BINDING
     ============================================================ */

  function bind() {

    // open modal
    el.openBtn.addEventListener('click', open);

    // close modal
    el.closeBtn.addEventListener('click', close);

    // click outside
    el.modal.addEventListener('click', (e) => {
      if (e.target === el.modal) close();
    });

    // submit
    el.form.addEventListener('submit', handleSubmit);
  }


  /* ============================================================
     8. INIT
     ============================================================ */

  function init() {
    bind();
  }


  return {
    init,
    open,
    close
  };

})();
/* ============================================================
   PROSERVA MODULES
   PART 7/15 (FIXED)
   MENU SYSTEM (DYNAMIC ORDER BUILDER)
   ============================================================ */

const Menu = (() => {

  /* ============================================================
     1. STATE
     ============================================================ */

  let items = [];

  const el = {
    container: document.getElementById('menu-container'),
    addBtn: document.getElementById('btn-add-menu'),
    total: document.getElementById('menu-total')
  };


  /* ============================================================
     2. MOCK MENU DATA (FUTURE: FIREBASE)
     ============================================================ */

  const MENU_LIST = [
    { id: 'm1', name: 'Ayam Bakar', price: 25000 },
    { id: 'm2', name: 'Nasi Goreng', price: 20000 },
    { id: 'm3', name: 'Mie Goreng', price: 18000 },
    { id: 'm4', name: 'Es Teh', price: 5000 },
    { id: 'm5', name: 'Jus Jeruk', price: 10000 }
  ];


  /* ============================================================
     3. UTIL
     ============================================================ */

  function formatRupiah(num) {
    return 'Rp ' + (Number(num) || 0).toLocaleString('id-ID');
  }

  function getMenuById(id) {
    return MENU_LIST.find(m => m.id === id) || MENU_LIST[0];
  }


  /* ============================================================
     4. CREATE ROW
     ============================================================ */

  function createRow(data = {}) {

    const row = {
      id: Utils.generateId(), // ✅ FIXED
      menuId: data.menuId || MENU_LIST[0].id,
      qty: Number(data.qty) > 0 ? Number(data.qty) : 1
    };

    items.push(row);

    render();
  }


  /* ============================================================
     5. REMOVE ROW
     ============================================================ */

  function removeRow(id) {
    items = items.filter(i => i.id !== id);
    render();
  }


  /* ============================================================
     6. UPDATE ROW
     ============================================================ */

  function updateRow(id, patch) {

    const item = items.find(i => i.id === id);
    if (!item) return;

    if (patch.menuId !== undefined) {
      item.menuId = patch.menuId;
    }

    if (patch.qty !== undefined) {
      const qty = Number(patch.qty);
      item.qty = qty > 0 ? qty : 1; // prevent 0 / NaN
    }

    render();
  }


  /* ============================================================
     7. CALCULATE TOTAL
     ============================================================ */

  function calculateTotal() {

    return items.reduce((sum, i) => {
      const menu = getMenuById(i.menuId);
      return sum + (menu.price * i.qty);
    }, 0);
  }


  /* ============================================================
     8. GET FINAL DATA (UNTUK RESERVATION)
     ============================================================ */

  function getData() {
    return items.map(i => {
      const menu = getMenuById(i.menuId);

      return {
        menuId: menu.id,
        name: menu.name,
        price: menu.price,
        qty: i.qty,
        subtotal: menu.price * i.qty
      };
    });
  }


  /* ============================================================
     9. RENDER (SAFE)
     ============================================================ */

  function render() {

    if (!el.container) return;

    el.container.innerHTML = '';

    items.forEach(item => {

      const menu = getMenuById(item.menuId);

      const row = document.createElement('div');
      row.className = 'menu-row';

      row.innerHTML = `
        <select class="menu-select">
          ${MENU_LIST.map(m => `
            <option value="${m.id}" ${m.id === item.menuId ? 'selected' : ''}>
              ${m.name}
            </option>
          `).join('')}
        </select>

        <input type="number" class="qty input" value="${item.qty}" min="1"/>

        <div class="price">${formatRupiah(menu.price * item.qty)}</div>

        <button class="remove">✕</button>
      `;

      // EVENTS
      row.querySelector('.menu-select').addEventListener('change', (e) => {
        updateRow(item.id, { menuId: e.target.value });
      });

      row.querySelector('.qty').addEventListener('input', (e) => {
        updateRow(item.id, { qty: e.target.value });
      });

      row.querySelector('.remove').addEventListener('click', () => {
        removeRow(item.id);
      });

      el.container.appendChild(row);
    });

    // update total
    if (el.total) {
      el.total.textContent = formatRupiah(calculateTotal());
    }
  }


  /* ============================================================
     10. RESET
     ============================================================ */

  function reset() {
    items = [];
    render();
  }


  /* ============================================================
     11. INIT
     ============================================================ */

  function init() {

    if (el.addBtn) {
      el.addBtn.addEventListener('click', () => {
        createRow();
      });
    }

    // default 1 row
    createRow();
  }


  return {
    init,
    reset,
    getData
  };

})();
/* ============================================================
   PROSERVA MODULES
   PART 8/15 (FIXED)
   SEARCH + FILTER ENGINE (STABLE + UI SAFE)
   ============================================================ */

const Filter = (() => {

  /* ============================================================
     1. STATE
     ============================================================ */

  let keyword = '';
  let status = 'all';
  let date = null;


  /* ============================================================
     2. ELEMENT REFERENCES
     ============================================================ */

  const el = {
    search: document.getElementById('detail-search'),
    status: document.getElementById('filter-status'),
    date: document.getElementById('filter-date')
  };


  /* ============================================================
     3. APPLY FILTER (PURE FUNCTION)
     ============================================================ */

  function apply(list) {

    return list.filter(item => {

      // keyword (name / phone)
      if (keyword) {
        const k = keyword.toLowerCase();

        const match =
          (item.name && item.name.toLowerCase().includes(k)) ||
          (item.phone && item.phone.includes(k));

        if (!match) return false;
      }

      // status
      if (status !== 'all' && item.status !== status) {
        return false;
      }

      // date
      if (date && item.date !== date) {
        return false;
      }

      return true;
    });
  }


  /* ============================================================
     4. SETTERS
     ============================================================ */

  function setKeyword(val) {
    keyword = val.trim();
  }

  function setStatus(val) {
    status = val;
  }

  function setDate(val) {
    date = val;
  }

  function reset() {
    keyword = '';
    status = 'all';
    date = null;

    if (el.search) el.search.value = '';
    if (el.status) el.status.value = 'all';
    if (el.date) el.date.value = '';
  }


  /* ============================================================
     5. SAFE RENDER (FIXED - NO MISSING FUNCTION)
     ============================================================ */

  function render(list) {

    const container = document.getElementById('reservation-list');
    if (!container) return;

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state">Tidak ada hasil</div>
      `;
      return;
    }

    container.innerHTML = '';

    list.forEach(item => {

      const card = document.createElement('div');
      card.className = 'res-card';
      card.dataset.status = item.status;

      card.innerHTML = `
        <div class="rc-top">
          <div class="rc-name">
            <div class="rc-avatar">
              ${item.name.charAt(0).toUpperCase()}
            </div>
            ${item.name}
          </div>

          <div class="rc-badges">
            <div class="status status-${item.status}">
              ${item.status}
            </div>
          </div>
        </div>

        <div class="rc-info">
          <div>⏰ ${item.time}</div>
          <div>👥 ${item.guests} orang</div>
        </div>

        <div class="rc-footer">
          <button class="btn btn-sm btn-done" data-action="next">Next</button>
          <button class="btn btn-sm btn-cancel" data-action="cancel">Cancel</button>
        </div>
      `;

      // ACTIONS (SAME AS UI MODULE)
      card.querySelector('[data-action="next"]').addEventListener('click', async () => {
        await Reservation.advanceStatus(item.id);
        trigger(); // refresh filter result
        UI.renderCalendar();
      });

      card.querySelector('[data-action="cancel"]').addEventListener('click', async () => {
        await Reservation.cancel(item.id);
        trigger();
        UI.renderCalendar();
      });

      container.appendChild(card);
    });
  }


  /* ============================================================
     6. TRIGGER UPDATE (SMART SOURCE)
     ============================================================ */

  async function trigger() {

    let list;

    if (date) {
      list = await Reservation.getByDate(date);
    } else {
      list = await Reservation.getAll();
    }

    const filtered = apply(list);

    render(filtered);
  }


  /* ============================================================
     7. BIND EVENTS
     ============================================================ */

  function bind() {

    if (el.search) {
      el.search.addEventListener('input', Utils.debounce((e) => {
        setKeyword(e.target.value);
        trigger();
      }, 250));
    }

    if (el.status) {
      el.status.addEventListener('change', (e) => {
        setStatus(e.target.value);
        trigger();
      });
    }

    if (el.date) {
      el.date.addEventListener('change', (e) => {
        setDate(e.target.value);
        trigger();
      });
    }
  }


  /* ============================================================
     8. INIT
     ============================================================ */

  function init() {
    bind();
  }


  return {
    init,
    apply,
    reset,
    trigger // expose biar bisa dipanggil dari luar
  };

})();
/* ============================================================
   PROSERVA MODULES
   PART 9/15
   NOTIFICATION SYSTEM (TOAST + UX FEEDBACK)
   ============================================================ */

const Notify = (() => {

  /* ============================================================
     1. STATE
     ============================================================ */

  let container = null;


  /* ============================================================
     2. INIT CONTAINER
     ============================================================ */

  function initContainer() {

    if (container) return;

    container = document.createElement('div');
    container.id = 'toast-container';

    Object.assign(container.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    });

    document.body.appendChild(container);
  }


  /* ============================================================
     3. CREATE TOAST
     ============================================================ */

  function create(message, type = 'info', duration = 2500) {

    initContainer();

    const toast = document.createElement('div');

    const colors = {
      success: 'rgba(34,197,94,0.15)',
      error: 'rgba(239,68,68,0.15)',
      info: 'rgba(59,130,246,0.15)'
    };

    const textColors = {
      success: '#22c55e',
      error: '#ef4444',
      info: '#3b82f6'
    };

    Object.assign(toast.style, {
      background: colors[type] || colors.info,
      color: textColors[type] || textColors.info,
      padding: '10px 14px',
      borderRadius: '12px',
      fontSize: '0.8rem',
      fontWeight: '500',
      backdropFilter: 'blur(6px)',
      transform: 'translateY(-10px)',
      opacity: '0',
      transition: 'all 0.2s ease'
    });

    toast.textContent = message;

    container.appendChild(toast);

    // animate in
    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    });

    // auto remove
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';

      setTimeout(() => {
        toast.remove();
      }, 200);

    }, duration);
  }


  /* ============================================================
     4. SHORTCUTS
     ============================================================ */

  function success(msg) {
    create(msg, 'success');
  }

  function error(msg) {
    create(msg, 'error');
  }

  function info(msg) {
    create(msg, 'info');
  }


  return {
    success,
    error,
    info
  };

})();

/* ============================================================
   PROSERVA MODULES
   PART 11/15 (FIXED)
   ANALYTICS ENGINE (BUSINESS INSIGHT - STABLE)
   ============================================================ */

const Analytics = (() => {

  /* ============================================================
     1. FILTER ACTIVE (EXCLUDE CANCELLED)
     ============================================================ */

  function activeOnly(list) {
    return (list || []).filter(
      r => r.status !== Reservation.STATUS.CANCELLED
    );
  }


  /* ============================================================
     2. TOTAL RESERVATIONS
     ============================================================ */

  function totalReservations(list) {
    return (list || []).length;
  }


  /* ============================================================
     3. TOTAL GUESTS
     ============================================================ */

  function totalGuests(list) {
    return (list || []).reduce(
      (sum, r) => sum + (r.guests || 0),
      0
    );
  }


  /* ============================================================
     4. OCCUPANCY RATE
     ============================================================ */

  function occupancyRate(list) {

    const guests = totalGuests(list);
    const max = CONFIG.MAX_CAPACITY_PER_SLOT; // ✅ FIXED

    if (!max || max <= 0) return 0;

    return Math.min(
      100,
      Math.round((guests / max) * 100)
    );
  }


  /* ============================================================
     5. STATUS BREAKDOWN
     ============================================================ */

  function statusBreakdown(list) {

    const result = {
      pending: 0,
      confirmed: 0,
      ongoing: 0,
      completed: 0,
      cancelled: 0
    };

    (list || []).forEach(r => {
      if (result[r.status] !== undefined) {
        result[r.status]++;
      }
    });

    return result;
  }


  /* ============================================================
     6. GROUP BY DATE
     ============================================================ */

  function groupByDate(list) {

    const map = {};

    (list || []).forEach(r => {
      if (!r.date) return;

      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    });

    return map;
  }


  /* ============================================================
     7. DAILY STATS
     ============================================================ */

  function dailyStats(list) {

    const grouped = groupByDate(list);

    const result = [];

    Object.keys(grouped).forEach(date => {

      const dayList = activeOnly(grouped[date]);

      result.push({
        date,
        total: totalReservations(dayList),
        guests: totalGuests(dayList),
        occupancy: occupancyRate(dayList)
      });

    });

    return result.sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }


  /* ============================================================
     8. PEAK DAY
     ============================================================ */

  function peakDay(list) {

    const grouped = groupByDate(list);

    let max = 0;
    let best = null;

    Object.entries(grouped).forEach(([date, items]) => {

      const active = activeOnly(items);
      const total = active.length;

      if (total > max) {
        max = total;
        best = date;
      }

    });

    return best;
  }


  /* ============================================================
     9. SUMMARY (MAIN DASHBOARD)
     ============================================================ */

  async function getSummary() {

    const list = await Reservation.getAll();

    const active = activeOnly(list);

    return {
      totalReservations: totalReservations(active),
      totalGuests: totalGuests(active),
      occupancy: occupancyRate(active),
      peakDay: peakDay(active),
      status: statusBreakdown(list)
    };
  }


  /* ============================================================
     10. DAILY DATA (FOR CHART / GRAPH)
     ============================================================ */

  async function getDaily() {

    const list = await Reservation.getAll();
    return dailyStats(list);
  }


  return {
    getSummary,
    getDaily,
    dailyStats,     // expose for flexibility
    peakDay         // expose for reuse
  };

})();
/* ============================================================
   PROSERVA MODULES
   PART 12/15 (FIXED)
   BACKUP + EXPORT + RESTORE SYSTEM (SAFE + CONSISTENT)
   ============================================================ */

const Backup = (() => {

  /* ============================================================
     1. EXPORT DATA
     ============================================================ */

  async function exportData() {

    const data = await DB.getAllReservations();

    const payload = {
      app: 'PROSERVA',
      version: 1,
      exportedAt: new Date().toISOString(),
      data
    };

    const blob = new Blob(
      [JSON.stringify(payload, null, 2)],
      { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `proserva-backup-${Date.now()}.json`;

    a.click();

    URL.revokeObjectURL(url);

    Notify.success('Backup berhasil diunduh');
  }


  /* ============================================================
     2. IMPORT DATA
     ============================================================ */

  function importFile(file) {

    return new Promise((resolve, reject) => {

      const reader = new FileReader();

      reader.onload = async (e) => {

        try {

          const json = JSON.parse(e.target.result);

          validateBackup(json);

          await restoreData(json.data);

          Notify.success('Data berhasil di-restore');

          // refresh UI
          UI.renderCalendar();
          const selected = Calendar.getSelected();
          if (selected) UI.renderDetail(selected);

          resolve(true);

        } catch (err) {

          Notify.error('File tidak valid');
          reject(err);

        }

      };

      reader.readAsText(file);

    });
  }


  /* ============================================================
     3. VALIDATION
     ============================================================ */

  function validateBackup(json) {

    if (!json || json.app !== 'PROSERVA') {
      throw new Error('Invalid backup file');
    }

    if (!Array.isArray(json.data)) {
      throw new Error('Invalid data format');
    }

    return true;
  }


  /* ============================================================
     4. RESTORE DATA (REPLACE ALL)
     ============================================================ */

  async function restoreData(list) {

    if (!Array.isArray(list)) {
      throw new Error('Data tidak valid');
    }

    try {
      localStorage.setItem(
        KEYS.reservations, // ✅ FIXED (sebelumnya CONFIG.STORAGE_KEY)
        JSON.stringify(list)
      );

      // invalidate cache biar langsung update
      if (typeof STATE !== 'undefined') {
        STATE.reservationsCache = null;
      }

      return true;

    } catch (err) {
      Logger.error('Restore error', err);
      throw new Error('Gagal menyimpan data');
    }
  }


  /* ============================================================
     5. CLEAR DATA (RESET APP)
     ============================================================ */

  function clearAll() {

    const confirmed = confirm('Hapus semua data?');
    if (!confirmed) return;

    localStorage.removeItem(KEYS.reservations); // ✅ FIXED

    Notify.info('Semua data dihapus');

    location.reload();
  }


  /* ============================================================
     6. INIT (BIND UI)
     ============================================================ */

  function init() {

    const exportBtn = document.getElementById('btn-export');
    const importInput = document.getElementById('input-import');
    const clearBtn = document.getElementById('btn-clear');

    if (exportBtn) {
      exportBtn.addEventListener('click', exportData);
    }

    if (importInput) {
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) importFile(file);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', clearAll);
    }

  }


  return {
    init,
    exportData,
    importFile,
    clearAll
  };

})();
/* ============================================================
   PROSERVA MODULES
   PART 13/15 (FIXED)
   SETTINGS + BUSINESS CONFIG SYSTEM (CONSISTENT + SAFE)
   ============================================================ */

const Settings = (() => {

  /* ============================================================
     1. DEFAULT CONFIG
     ============================================================ */

  const DEFAULT = {
    businessName: 'Restoran Saya',
    openTime: '10:00',
    closeTime: '22:00',
    maxCapacityPerDay: 50,
    slotDuration: 60, // menit
    currency: 'IDR',
    enableWA: true,
    phoneNumber: '',
    autoConfirm: false
  };


  /* ============================================================
     2. GET SETTINGS
     ============================================================ */

  function get() {

    const raw = localStorage.getItem(KEYS.settings); // ✅ FIXED

    if (!raw) return { ...DEFAULT };

    try {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT, ...parsed };
    } catch (err) {
      Logger.warn('Settings parse error', err);
      return { ...DEFAULT };
    }

  }


  /* ============================================================
     3. SAVE SETTINGS
     ============================================================ */

  function save(data) {

    const merged = {
      ...DEFAULT,
      ...get(),
      ...data
    };

    localStorage.setItem(
      KEYS.settings, // ✅ FIXED
      JSON.stringify(merged)
    );

    Notify.success('Pengaturan disimpan');

    return merged;
  }


  /* ============================================================
     4. RESET SETTINGS
     ============================================================ */

  function reset() {

    localStorage.removeItem(KEYS.settings); // ✅ FIXED

    Notify.info('Pengaturan direset');

    return { ...DEFAULT };
  }


  /* ============================================================
     5. VALIDATION
     ============================================================ */

  function validate(data) {

    if (!data.businessName) {
      throw new Error('Nama bisnis wajib diisi');
    }

    if (!data.openTime || !data.closeTime) {
      throw new Error('Jam operasional tidak valid');
    }

    if (data.maxCapacityPerDay <= 0) {
      throw new Error('Kapasitas harus lebih dari 0');
    }

    return true;
  }


  /* ============================================================
     6. APPLY TO UI
     ============================================================ */

  function applyToUI() {

    const s = get();

    const nameEl = document.getElementById('biz-name');
    if (nameEl) nameEl.textContent = s.businessName;

  }


  /* ============================================================
     7. FORM BINDING
     ============================================================ */

  function bindForm() {

    const form = document.getElementById('settings-form');
    if (!form) return;

    const s = get();

    // prefill
    if (form.businessName) form.businessName.value = s.businessName;
    if (form.openTime) form.openTime.value = s.openTime;
    if (form.closeTime) form.closeTime.value = s.closeTime;
    if (form.maxCapacityPerDay) form.maxCapacityPerDay.value = s.maxCapacityPerDay;
    if (form.slotDuration) form.slotDuration.value = s.slotDuration;
    if (form.phoneNumber) form.phoneNumber.value = s.phoneNumber;
    if (form.enableWA) form.enableWA.checked = s.enableWA;
    if (form.autoConfirm) form.autoConfirm.checked = s.autoConfirm;

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      try {

        const data = {
          businessName: form.businessName.value.trim(),
          openTime: form.openTime.value,
          closeTime: form.closeTime.value,
          maxCapacityPerDay: Number(form.maxCapacityPerDay.value),
          slotDuration: Number(form.slotDuration.value),
          phoneNumber: form.phoneNumber.value.trim(),
          enableWA: form.enableWA.checked,
          autoConfirm: form.autoConfirm.checked
        };

        validate(data);

        save(data);

        applyToUI();

      } catch (err) {
        Notify.error(err.message);
      }

    });

  }


  /* ============================================================
     8. BUSINESS LOGIC HELPERS
     ============================================================ */

  function isOpenNow() {

    const s = get();

    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();

    const [openH, openM] = s.openTime.split(':').map(Number);
    const [closeH, closeM] = s.closeTime.split(':').map(Number);

    const open = openH * 60 + openM;
    const close = closeH * 60 + closeM;

    return current >= open && current <= close;
  }


  function formatCurrency(value) {

    const s = get();

    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: s.currency
    }).format(value);
  }


  /* ============================================================
     9. INIT
     ============================================================ */

  function init() {
    bindForm();
    applyToUI();
  }


  return {
    init,
    get,
    save,
    reset,
    isOpenNow,
    formatCurrency
  };

})();
/* ============================================================
   PROSERVA MODULES
   PART 15/15 (FIXED)
   SYNC LAYER + FIREBASE READY ADAPTER (CLEAN)
   ============================================================ */

const Sync = (() => {

  /* ============================================================
     1. MODE (FOLLOW CONFIG)
     ============================================================ */

  function isFirebase() {
    return CONFIG.DATA_MODE === 'firebase';
  }


  /* ============================================================
     2. PUBLIC API (UNIFIED WRAPPER)
     ============================================================ */

  async function getAll() {
    return DB.getAllReservations();
  }

  async function getByDate(date) {
    return DB.getByDate(date);
  }

  async function create(data) {
    return DB.insertReservation(data);
  }

  async function update(id, patch) {
    return DB.updateReservation(id, patch);
  }

  async function remove(id) {
    return DB.deleteReservation(id);
  }


  /* ============================================================
     3. REALTIME HOOK (FUTURE FIREBASE)
     ============================================================ */

  function subscribe(callback) {

    if (isFirebase()) {
      console.warn('[SYNC] Firebase realtime belum diaktifkan');
      return;
    }

    // fallback local → pakai Event Bus
    Events.on('reservation:changed', callback);
  }

  function unsubscribe(callback) {
    Events.off('reservation:changed', callback);
  }


  /* ============================================================
     4. MANUAL SYNC (PLACEHOLDER FIREBASE)
     ============================================================ */

  async function syncNow() {

    if (!isFirebase()) return;

    try {
      console.warn('[SYNC] Firebase sync belum diimplementasikan');
      Notify.info('Sync Firebase belum aktif');
    } catch (err) {
      Logger.error('Sync error', err);
      Notify.error('Gagal sync data');
    }
  }


  /* ============================================================
     5. AUTO SYNC (SAFE)
     ============================================================ */

  function startAutoSync(interval = 5000) {

    if (!isFirebase()) return;

    setInterval(() => {
      syncNow();
    }, interval);
  }


  /* ============================================================
     6. MIGRATION TOOL (LOCAL → FIREBASE)
     ============================================================ */

  async function migrateToFirebase() {

    if (!isFirebase()) {
      Notify.info('Aktifkan mode Firebase dulu');
      return;
    }

    const data = await DB.getAllReservations();

    console.log('[SYNC] Migrating data:', data.length);

    // 🔥 nanti push ke Firebase di sini

    Notify.info('Migrasi disiapkan (belum aktif)');
  }


  /* ============================================================
     7. SAFE WRAPPER (ANTI CRASH)
     ============================================================ */

  async function safeExec(fn, fallback = null) {
    try {
      return await fn();
    } catch (err) {
      Logger.error('[SYNC ERROR]', err);
      return fallback;
    }
  }


  /* ============================================================
     8. INIT
     ============================================================ */

  function init() {
    Logger.log('[SYNC] initialized | mode:', CONFIG.DATA_MODE);
  }


  return {
    init,

    // core
    getAll,
    getByDate,
    create,
    update,
    remove,

    // realtime
    subscribe,
    unsubscribe,

    // sync
    syncNow,
    startAutoSync,

    // migration
    migrateToFirebase,

    // safety
    safeExec
  };

})();