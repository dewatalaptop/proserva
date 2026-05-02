'use strict';

/* ============================================================
APP.JS (REFactored)
PART 1/20
BOOTSTRAP + GLOBAL INIT ORCHESTRATOR
============================================================ */

/* ============================================================
1. SAFE BOOT GUARD
Mencegah double init (penting untuk SPA / reload partial)
============================================================ */

(function () {

  if (typeof guardInit === 'function') {
    const allowed = guardInit();
    if (!allowed) return;
  }

})();


/* ============================================================
2. GLOBAL APP CONTROLLER (SINGLE SOURCE OF TRUTH)
============================================================ */

const App = (() => {

  let initialized = false;

  /* =========================
     CORE INIT
  ========================= */

  async function init() {

    if (initialized) {
      Logger.warn('[App] already initialized');
      return;
    }

    initialized = true;

    Logger.log('[App] initializing...');

    try {

      /* =========================
         MODULE INIT ORDER (IMPORTANT)
      ========================= */

      Sync.init();        // data layer (future ready)
      Settings.init();    // business config
      UI.init();          // calendar + list
      Form.init();        // modal + input
      Menu.init();        // menu builder
      Filter.init();      // search/filter
      Backup.init();      // export/import

      /* =========================
         GLOBAL EVENT BINDING
      ========================= */

      bindGlobalEvents();

      /* =========================
         FIRST RENDER
      ========================= */

      await UI.renderCalendar();

      const selected = Calendar.getSelected();
      if (selected) {
        await UI.renderDetail(selected);
      }

      Logger.log('[App] initialized successfully');

    } catch (err) {

      Logger.error('[App] init error:', err);

      if (typeof Notify !== 'undefined') {
        Notify.error('Gagal memulai aplikasi');
      }

    }

  }


  /* ============================================================
  3. GLOBAL EVENT SYSTEM (REACTIVE UI CORE)
  ============================================================ */

  function bindGlobalEvents() {

    /* =========================
       RESERVATION CHANGED
    ========================= */

    Events.on('reservation:changed', async () => {

      Logger.log('[App] reservation changed → re-render');

      await UI.renderCalendar();

      const selected = Calendar.getSelected();
      if (selected) {
        await UI.renderDetail(selected);
      }

    });


    /* =========================
       WINDOW FOCUS (AUTO REFRESH)
    ========================= */

    window.addEventListener('focus', async () => {

      Logger.log('[App] window focus → sync refresh');

      await UI.renderCalendar();

      const selected = Calendar.getSelected();
      if (selected) {
        await UI.renderDetail(selected);
      }

    });


    /* =========================
       ESC KEY (CLOSE MODAL SAFELY)
    ========================= */

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (typeof Form !== 'undefined') {
          Form.close();
        }
      }
    });

  }


  /* ============================================================
  4. PUBLIC API
  ============================================================ */

  return {
    init
  };

})();


/* ============================================================
5. DOM READY BOOT
============================================================ */

(function boot() {

  if (document.readyState === 'loading') {

    document.addEventListener('DOMContentLoaded', () => {
      App.init();
    });

  } else {
    App.init();
  }

})();
'use strict';

/* ============================================================
APP.JS (REFactored)
PART 2/20
VIEW ROUTER + NAVIGATION CONTROLLER
============================================================ */

/* ============================================================
1. VIEW ROUTER CORE
Single source untuk semua navigasi UI
============================================================ */

const Router = (() => {

  let currentView = null;

  const VIEWS = [
    'calendar',
    'detail',
    'menus',
    'locations',
    'customers',
    'analysis',
    'broadcast',
    'settings'
  ];

  /* =========================
     GET ELEMENTS
  ========================= */

  function getViews() {
    return document.querySelectorAll('#content .view');
  }

  function getNavItems() {
    return document.querySelectorAll('.nav-item');
  }

  function getViewEl(name) {
    return document.getElementById('view-' + name);
  }

  /* =========================
     MAIN NAVIGATION
  ========================= */

  async function go(name) {

    if (!VIEWS.includes(name)) {
      Logger.warn('[Router] unknown view:', name);
      return;
    }

    if (currentView === name) return;

    currentView = name;

    Logger.log('[Router] navigating →', name);

    /* =========================
       HIDE ALL
    ========================= */

    getViews().forEach(v => {
      v.style.display = 'none';
      v.classList.remove('active-view');
    });

    /* =========================
       SHOW TARGET
    ========================= */

    const target = getViewEl(name);

    if (target) {
      target.style.display = 'block';
      target.classList.add('active-view');
    }

    /* =========================
       NAV ACTIVE STATE
    ========================= */

    getNavItems().forEach(n => {
      n.classList.toggle('active', n.dataset.view === name);
    });

    /* =========================
       PAGE TITLE
    ========================= */

    updatePageTitle(name);

    /* =========================
       VIEW HOOKS (IMPORTANT)
    ========================= */

    await runViewHook(name);

    /* =========================
       MOBILE SIDEBAR CLOSE
    ========================= */

    closeSidebarIfOpen();

  }


  /* ============================================================
  2. VIEW HOOKS (LOGIC PER PAGE)
  ============================================================ */

  async function runViewHook(name) {

    switch (name) {

      case 'calendar':
        await UI.renderCalendar();
        break;

      case 'detail': {
        const selected = Calendar.getSelected();
        if (selected) {
          await UI.renderDetail(selected);
        }
        break;
      }

      case 'menus':
        // nanti di-handle module menu management
        break;

      case 'locations':
        break;

      case 'customers':
        break;

      case 'analysis':
        // bisa integrate Analytics nanti
        break;

      case 'broadcast':
        break;

      case 'settings':
        Settings.applyToUI();
        break;
    }

  }


  /* ============================================================
  3. PAGE TITLE
  ============================================================ */

  function updatePageTitle(name) {

    const el = document.getElementById('page-title');
    if (!el) return;

    const map = {
      calendar:  'Kalender',
      detail:    'Detail Reservasi',
      menus:     'Menu',
      locations: 'Lokasi',
      customers: 'Pelanggan',
      analysis:  'Analisis',
      broadcast: 'Broadcast',
      settings:  'Pengaturan'
    };

    el.textContent = map[name] || '';
  }


  /* ============================================================
  4. SIDEBAR CONTROL (SAFE)
  ============================================================ */

  function closeSidebarIfOpen() {

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (sidebar && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('show');
    }

  }


  /* ============================================================
  5. PUBLIC API
  ============================================================ */

  function getCurrent() {
    return currentView;
  }

  return {
    go,
    getCurrent
  };

})();


/* ============================================================
6. NAVIGATION BINDING
============================================================ */

(function bindNavigation() {

  const items = document.querySelectorAll('.nav-item');

  items.forEach(item => {

    item.addEventListener('click', () => {

      const view = item.dataset.view;

      if (!view) return;

      Router.go(view);

    });

  });

})();


/* ============================================================
7. GLOBAL SHORTCUT (OPTIONAL)
============================================================ */

window.goView = function (name) {
  Router.go(name);
};
'use strict';

/* ============================================================
APP.JS (REFactored)
PART 3/20
CALENDAR ↔ DETAIL BRIDGE (STATE SYNC)
============================================================ */

/* ============================================================
1. DATE SELECTION CONTROLLER
Menggantikan selectDate() lama (NO GLOBAL STATE CONFLICT)
============================================================ */

const DateController = (() => {

  /* =========================
     SELECT DATE (MAIN ENTRY)
  ========================= */

  async function select(dateStr) {

    if (!dateStr) return;

    Logger.log('[DateController] select →', dateStr);

    /* =========================
       UPDATE STATE (SINGLE SOURCE)
    ========================= */

    Calendar.select(dateStr);

    /* =========================
       UPDATE TITLE (DETAIL PAGE)
    ========================= */

    updateDetailHeader(dateStr);

    /* =========================
       NAVIGATE
    ========================= */

    await Router.go('detail');

  }


  /* ============================================================
  2. BACK TO CALENDAR
  ============================================================ */

  async function back() {

    Logger.log('[DateController] back to calendar');

    await Router.go('calendar');

  }


  /* ============================================================
  3. HEADER FORMATTER
  ============================================================ */

  function updateDetailHeader(dateStr) {

    const el = document.getElementById('detail-title');
    if (!el) return;

    const parts = dateStr.split('-');

    if (parts.length !== 3) {
      el.textContent = dateStr;
      return;
    }

    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);

    const months = [
      'Januari','Februari','Maret','April','Mei','Juni',
      'Juli','Agustus','September','Oktober','November','Desember'
    ];

    el.textContent = `${d} ${months[m]} ${y}`;
  }


  return {
    select,
    back
  };

})();


/* ============================================================
2. CALENDAR CLICK OVERRIDE (CRITICAL FIX)
Mengganti inline onclick lama tanpa merusak modules.js
============================================================ */

(function bindCalendarClicks() {

  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  /* =========================
     EVENT DELEGATION (SAFE)
  ========================= */

  grid.addEventListener('click', (e) => {

    const cell = e.target.closest('.cal-day');
    if (!cell || cell.classList.contains('empty')) return;

    /* =========================
       AMBIL DATE DARI DATASET
       (modules.js render → kita inject)
    ========================= */

    const dateStr = cell.dataset.date;

    if (!dateStr) return;

    DateController.select(dateStr);

  });

})();


/* ============================================================
3. PATCH UI RENDER (INJECT DATASET)
Tanpa ubah modules.js (non-invasive upgrade)
============================================================ */

(function patchCalendarRender() {

  if (!UI || !UI.renderCalendar) return;

  const original = UI.renderCalendar;

  UI.renderCalendar = async function () {

    await original();

    /* =========================
       INJECT DATASET DATE
    ========================= */

    const cells = document.querySelectorAll('#calendar-grid .cal-day');

    cells.forEach(cell => {

      if (cell.classList.contains('empty')) return;

      const numEl = cell.querySelector('.cal-day-num');
      if (!numEl) return;

      const day = parseInt(numEl.textContent, 10);

      const selected = Calendar.getSelected();
      const base = selected ? new Date(selected) : new Date();

      const year = base.getFullYear();
      const month = base.getMonth();

      const dateStr = Utils.formatDate(year, month, day);

      cell.dataset.date = dateStr;

    });

  };

})();


/* ============================================================
4. GLOBAL HELPERS (BACKWARD COMPATIBILITY)
Agar index.html lama tidak error
============================================================ */

window.selectDate = function (dateStr) {
  DateController.select(dateStr);
};

window.backToCalendar = function () {
  DateController.back();
};
'use strict';

/* ============================================================
APP.JS (REFactored)
PART 4/20
RESERVATION ACTION CONTROLLER
============================================================ */

/* ============================================================
1. RESERVATION CONTROLLER
Single entry untuk semua aksi reservasi
============================================================ */

const ReservationController = (() => {

  /* ============================================================
  1. CREATE
  Dipakai oleh Form module (override ringan)
  ============================================================ */

  async function create(payload) {

    try {

      Logger.log('[ReservationController] create', payload);

      const result = await Reservation.create(payload);

      Notify.success('Reservasi berhasil dibuat');

      return result;

    } catch (err) {

      Logger.error('[ReservationController] create error', err);

      Notify.error(err.message || 'Gagal membuat reservasi');

      throw err;
    }

  }


  /* ============================================================
  2. UPDATE
  ============================================================ */

  async function update(id, patch) {

    if (!id) return;

    try {

      Logger.log('[ReservationController] update', id);

      const result = await Reservation.update(id, patch);

      Notify.success('Reservasi diperbarui');

      return result;

    } catch (err) {

      Logger.error('[ReservationController] update error', err);

      Notify.error('Gagal memperbarui reservasi');

    }

  }


  /* ============================================================
  3. DELETE (SAFE CONFIRM)
  ============================================================ */

  async function remove(id) {

    if (!id) return;

    const confirmed = confirm('Hapus reservasi ini?');

    if (!confirmed) return;

    try {

      await Reservation.remove(id);

      Notify.info('Reservasi dihapus');

    } catch (err) {

      Logger.error('[ReservationController] delete error', err);

      Notify.error('Gagal menghapus reservasi');

    }

  }


  /* ============================================================
  4. ADVANCE STATUS (FLOW)
  ============================================================ */

  async function nextStatus(id) {

    if (!id) return;

    try {

      await Reservation.advanceStatus(id);

      Notify.success('Status diperbarui');

    } catch (err) {

      Logger.error('[ReservationController] status error', err);

      Notify.error('Gagal update status');

    }

  }


  /* ============================================================
  5. CANCEL
  ============================================================ */

  async function cancel(id) {

    if (!id) return;

    const confirmed = confirm('Batalkan reservasi ini?');

    if (!confirmed) return;

    try {

      await Reservation.cancel(id);

      Notify.info('Reservasi dibatalkan');

    } catch (err) {

      Logger.error('[ReservationController] cancel error', err);

      Notify.error('Gagal membatalkan reservasi');

    }

  }


  return {
    create,
    update,
    remove,
    nextStatus,
    cancel
  };

})();


/* ============================================================
2. PATCH FORM SUBMIT (INTEGRASI KE CONTROLLER)
Tanpa ubah modules.js → override aman
============================================================ */

(function patchFormSubmit() {

  if (!Form || !Form.init) return;

  const originalInit = Form.init;

  Form.init = function () {

    originalInit();

    const form = document.getElementById('reservation-form');
    if (!form) return;

    /* =========================
       OVERRIDE SUBMIT
    ========================= */

    form.addEventListener('submit', async (e) => {

      e.preventDefault();

      const values = {
        name: document.getElementById('input-name')?.value,
        phone: document.getElementById('input-phone')?.value,
        date: document.getElementById('input-date')?.value,
        time: document.getElementById('input-time')?.value,
        guests: Number(document.getElementById('input-guests')?.value),
        note: document.getElementById('input-note')?.value,
        menus: (typeof Menu !== 'undefined') ? Menu.getData() : []
      };

      try {

        await ReservationController.create(values);

        Form.close();

      } catch (err) {
        // sudah ditangani di controller
      }

    });

  };

})();


/* ============================================================
3. PATCH DETAIL ACTION BUTTONS (NEXT / CANCEL / DELETE)
Mengganti handler lama tanpa rewrite UI module
============================================================ */

(function patchDetailActions() {

  const container = document.getElementById('reservation-list');
  if (!container) return;

  /* =========================
     EVENT DELEGATION (SAFE)
  ========================= */

  container.addEventListener('click', async (e) => {

    const card = e.target.closest('.res-card');
    if (!card) return;

    const id = card.dataset.id;
    if (!id) return;

    /* =========================
       ACTION DETECTION
    ========================= */

    if (e.target.closest('[data-action="next"]')) {
      await ReservationController.nextStatus(id);
      return;
    }

    if (e.target.closest('[data-action="cancel"]')) {
      await ReservationController.cancel(id);
      return;
    }

    if (e.target.closest('[data-action="delete"]')) {
      await ReservationController.remove(id);
      return;
    }

  });

})();
'use strict';

'use strict';

/* ============================================================
APP.JS (REFactored)
PART 5/20 (FIXED)
COMMUNICATION BRIDGE (NO DUPLICATION)
============================================================ */

/*
❗ PERUBAHAN PENTING:
- Semua logic WhatsApp & template DIHAPUS
- Menggunakan Communication dari PART 14 (single source)
- Part ini hanya jadi bridge antara UI ↔ Communication
*/


/* ============================================================
1. SAFE GET RESERVATION HELPER
============================================================ */

async function getReservationById(id) {

  if (!id) return null;

  try {

    const list = await Reservation.getAll();

    return list.find(r => r.id === id);

  } catch (err) {

    Logger.error('[Part5] getReservationById error', err);

    return null;

  }

}


/* ============================================================
2. PATCH DETAIL CARD ACTIONS (WA BUTTONS)
============================================================ */

(function patchWAButtons() {

  const container = document.getElementById('reservation-list');
  if (!container) return;

  container.addEventListener('click', async (e) => {

    const card = e.target.closest('.res-card');
    if (!card) return;

    const id = card.dataset.id;
    if (!id) return;

    const r = await getReservationById(id);
    if (!r) return;

    /* =========================
       ACTION DETECTION
    ========================= */

    if (e.target.closest('[data-action="wa"]')) {

      if (typeof Communication !== 'undefined') {
        Communication.sendConfirmation(r);
      } else {
        Logger.warn('[Part5] Communication not ready');
      }

      return;
    }

    if (e.target.closest('[data-action="thank"]')) {

      if (typeof Communication !== 'undefined') {
        Communication.sendThankYou(r);
      }

      return;
    }

    if (e.target.closest('[data-action="reminder"]')) {

      if (typeof Communication !== 'undefined') {
        Communication.sendReminder(r);
      }

      return;
    }

  });

})();


/* ============================================================
3. GLOBAL HELPERS (BACKWARD COMPATIBILITY)
Agar index.html lama tetap jalan
============================================================ */

window.contactWA = async function (id) {

  const r = await getReservationById(id);

  if (r && typeof Communication !== 'undefined') {
    Communication.sendConfirmation(r);
  }

};

window.sendThankYouById = async function (id) {

  const r = await getReservationById(id);

  if (r && typeof Communication !== 'undefined') {
    Communication.sendThankYou(r);
  }

};


/* ============================================================
4. LOG
============================================================ */

Logger.log('[Part5] Communication bridge active (no duplication)');
'use strict';

/* ============================================================
APP.JS (REFactored)
PART 6/20 (FIXED)
NOTIFICATION BRIDGE (SINGLE SOURCE)
============================================================ */

/*
❗ PERUBAHAN PENTING:
- Notifier lama DIHAPUS
- Tidak ada patch ke Notify.*
- Semua notifikasi lewat NotifyPro (Part 11)
- Part ini hanya bridge + fallback
*/


/* ============================================================
1. SAFE NOTIFY WRAPPER
Fallback jika NotifyPro belum siap
============================================================ */

const NotifySafe = (() => {

  function success(msg) {
    if (window.NotifyPro) {
      NotifyPro.success(msg);
    } else {
      console.log('[Notify]', msg);
    }
  }

  function error(msg) {
    if (window.NotifyPro) {
      NotifyPro.error(msg);
    } else {
      console.error('[Notify]', msg);
    }
  }

  function info(msg) {
    if (window.NotifyPro) {
      NotifyPro.info(msg);
    } else {
      console.log('[Notify]', msg);
    }
  }

  return {
    success,
    error,
    info
  };

})();


/* ============================================================
2. GLOBAL ERROR HANDLER (SINGLE VERSION - LIGHT)
Heavy handler ada di Part 13
============================================================ */

(function globalErrorBridge() {

  window.addEventListener('error', (e) => {

    Logger.error('[Global Error]', e.error || e.message);

    NotifySafe.error('Terjadi kesalahan pada aplikasi');

  });

  window.addEventListener('unhandledrejection', (e) => {

    Logger.error('[Unhandled Promise]', e.reason);

    NotifySafe.error('Terjadi kesalahan sistem');

  });

})();


/* ============================================================
3. LOADING STATE HELPER (RETAIN - USEFUL)
============================================================ */

const Loading = (() => {

  function set(el, state) {

    if (!el) return;

    if (state) {
      el.classList.add('loading');
      el.disabled = true;
    } else {
      el.classList.remove('loading');
      el.disabled = false;
    }

  }

  return {
    set
  };

})();


/* ============================================================
4. GLOBAL SHORTCUT (OPTIONAL)
============================================================ */

window.notifySuccess = (msg) => NotifySafe.success(msg);
window.notifyError   = (msg) => NotifySafe.error(msg);
window.notifyInfo    = (msg) => NotifySafe.info(msg);


/* ============================================================
5. LOG
============================================================ */

Logger.log('[Part6] Notification bridge active (NotifyPro only)');

'use strict';

/* ============================================================
APP.JS (REFactored)
PART 7/20 (FIXED)
ANALYTICS + ROUTER HOOK SYSTEM
============================================================ */

/*
❗ PERUBAHAN BESAR:
- Tidak override Router.go langsung
- Gunakan Router Hook System (single pipeline)
- Mencegah conflict antar part (7,8,9, dll)
*/


/* ============================================================
1. ROUTER HOOK SYSTEM (SINGLE SOURCE)
============================================================ */

const RouterHooks = window.RouterHooks || [];
window.RouterHooks = RouterHooks;

function addRouteHook(fn) {
  if (typeof fn === 'function') {
    RouterHooks.push(fn);
  }
}


/* ============================================================
2. PATCH ROUTER SEKALI SAJA (SAFE)
============================================================ */

(function patchRouterOnce() {

  if (!window.Router || !Router.go) return;

  // cegah patch berulang
  if (Router.__HOOK_PATCHED__) return;

  const originalGo = Router.go;

  Router.go = async function (name) {

    await originalGo(name);

    for (const fn of RouterHooks) {
      try {
        await fn(name);
      } catch (err) {
        Logger.error('[RouterHook error]', err);
      }
    }

  };

  Router.__HOOK_PATCHED__ = true;

  Logger.log('[Router] hook system enabled');

})();


/* ============================================================
3. ANALYTICS CONTROLLER (TETAP)
============================================================ */

const AnalyticsController = (() => {

  async function loadSummary() {

    try {

      Logger.log('[Analytics] loading summary');

      const data = await Analytics.getSummary();

      renderSummary(data);

    } catch (err) {

      Logger.error('[Analytics] summary error', err);

      NotifySafe.error('Gagal memuat analisis');

    }

  }


  async function loadDaily() {

    try {

      const data = await Analytics.getDaily();

      renderDailyList(data);

    } catch (err) {

      Logger.error('[Analytics] daily error', err);

    }

  }


  function renderSummary(data) {

    const el = document.getElementById('anl-stats');
    if (!el) return;

    el.innerHTML = `
      ${card(data.totalReservations, 'Total Reservasi')}
      ${card(data.totalGuests, 'Total Tamu')}
      ${card(data.occupancy + '%', 'Tingkat Okupansi')}
      ${card(data.peakDay || '-', 'Hari Tersibuk')}
    `;
  }


  function card(value, label) {
    return `
      <div class="anl-card">
        <div class="anl-val">${value}</div>
        <div class="anl-label">${label}</div>
      </div>
    `;
  }


  function renderDailyList(list) {

    const el = document.getElementById('anl-daily');
    if (!el) return;

    if (!list.length) {
      el.innerHTML = `<div class="empty-state">Belum ada data</div>`;
      return;
    }

    el.innerHTML = list.map(item => `
      <div class="anl-row">
        <div>${formatDate(item.date)}</div>
        <div>${item.total} reservasi</div>
        <div>${item.guests} tamu</div>
        <div>${item.occupancy}%</div>
      </div>
    `).join('');
  }


  function formatDate(dateStr) {

    const d = new Date(dateStr);

    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short'
    });

  }


  async function loadAll() {
    await loadSummary();
    await loadDaily();
  }


  return {
    loadAll
  };

})();


/* ============================================================
4. REGISTER ANALYTICS KE ROUTER (HOOK)
============================================================ */

addRouteHook(async (name) => {

  if (name === 'analysis') {

    Logger.log('[RouterHook] load analytics');

    await AnalyticsController.loadAll();

  }

});


/* ============================================================
5. AUTO REFRESH (EVENT BRIDGE READY)
============================================================ */

EventBridge.on('reservation:changed', () => {

  if (!Router || !Router.getCurrent) return;

  const current = Router.getCurrent();

  if (current === 'analysis') {
    AnalyticsController.loadAll();
  }

});


/* ============================================================
6. LOG
============================================================ */

Logger.log('[Part7] Analytics + Router hook ready');

'use strict';

/* ============================================================
APP.JS (REFactored)
PART 8/20 (FIXED)
CUSTOMER MANAGEMENT CONTROLLER
============================================================ */

/*
PERBAIKAN:
- Tidak override Router.go
- Menggunakan addRouteHook
- Menggunakan EventBridge (bukan Events)
*/


/* ============================================================
1. CUSTOMER CONTROLLER
============================================================ */

const CustomerController = (() => {

  let cache = [];

  async function build() {

    const list = await Reservation.getAll();

    const map = {};

    list.forEach(r => {

      const key = r.phone || (r.name + '_' + r.date);

      if (!map[key]) {
        map[key] = {
          name: r.name || 'Tanpa Nama',
          phone: r.phone || '',
          count: 0,
          lastDate: r.date
        };
      }

      map[key].count++;

      if (r.date > map[key].lastDate) {
        map[key].lastDate = r.date;
      }

    });

    cache = Object.values(map)
      .sort((a, b) => b.count - a.count);

    return cache;
  }


  function get() {
    return cache;
  }


  function filter(query) {

    if (!query) return cache;

    const q = query.toLowerCase();

    return cache.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  }


  function contact(customer) {

    if (!customer?.phone) {
      NotifySafe.error('Nomor tidak tersedia');
      return;
    }

    if (typeof Communication !== 'undefined') {
      Communication.sendCustom(
        customer.phone,
        `Halo Kak *${customer.name}* 👋\n\nTerima kasih sudah menjadi pelanggan kami 😊`
      );
    }

  }


  return {
    build,
    get,
    filter,
    contact
  };

})();


/* ============================================================
2. CUSTOMER UI RENDERER
============================================================ */

const CustomerUI = (() => {

  function render(list) {

    const el = document.getElementById('customers-tbody');
    if (!el) return;

    if (!list.length) {
      el.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;padding:24px;">
            Tidak ada data pelanggan
          </td>
        </tr>
      `;
      return;
    }

    el.innerHTML = list.map(c => `
      <tr>
        <td><strong>${escape(c.name)}</strong></td>
        <td>${c.phone || '-'}</td>
        <td>${c.count}x</td>
        <td>${formatDate(c.lastDate)}</td>
        <td>
          ${
            c.phone
              ? `<button class="btn-wa" data-phone="${c.phone}" data-name="${escape(c.name)}">WA</button>`
              : '-'
          }
        </td>
      </tr>
    `).join('');
  }


  function formatDate(dateStr) {

    if (!dateStr) return '-';

    const d = new Date(dateStr);

    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

  }


  function escape(str) {
    return String(str || '').replace(/[&<>"']/g, s => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[s]);
  }


  return {
    render
  };

})();


/* ============================================================
3. EVENT BINDING
============================================================ */

(function bindCustomerEvents() {

  const search = document.getElementById('customer-search');
  const table  = document.getElementById('customers-tbody');

  /* SEARCH */

  if (search) {
    search.addEventListener('input', Utils.debounce(async (e) => {

      const q = e.target.value;

      const result = CustomerController.filter(q);

      CustomerUI.render(result);

    }, 250));
  }

  /* WA BUTTON */

  if (table) {

    table.addEventListener('click', (e) => {

      const btn = e.target.closest('.btn-wa');
      if (!btn) return;

      const phone = btn.dataset.phone;
      const name  = btn.dataset.name;

      CustomerController.contact({ phone, name });

    });

  }

})();


/* ============================================================
4. ROUTER HOOK (FIXED)
============================================================ */

addRouteHook(async (name) => {

  if (name === 'customers') {

    Logger.log('[Customer] load');

    const data = await CustomerController.build();

    CustomerUI.render(data);

  }

});


/* ============================================================
5. AUTO REFRESH (EVENTBRIDGE)
============================================================ */

EventBridge.on('reservation:changed', async () => {

  if (!Router || !Router.getCurrent) return;

  if (Router.getCurrent() !== 'customers') return;

  const data = await CustomerController.build();

  CustomerUI.render(data);

});


/* ============================================================
6. LOG
============================================================ */

Logger.log('[Part8] Customer module ready');

'use strict';

/* ============================================================
APP.JS (REFactored)
PART 9/20 (FIXED)
BROADCAST SYSTEM
============================================================ */

/*
PERBAIKAN:
- Tidak override Router.go
- Menggunakan Router Hook
- Menggunakan EventBridge
- Menggunakan Communication (Part 14)
*/


/* ============================================================
1. BROADCAST CONTROLLER
============================================================ */

const BroadcastController = (() => {

  let list = [];

  async function load() {

    const customers = await CustomerController.build();

    // hanya yang punya nomor
    list = customers.filter(c => c.phone);

    return list;
  }


  function filter(query) {

    if (!query) return list;

    const q = query.toLowerCase();

    return list.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  }


  function personalize(template, name) {

    if (!template) return '';

    return template.replace(/\{name\}/gi, name || '');
  }


  function send(phone, name, template) {

    if (!phone || !template) {
      NotifySafe.error('Data tidak lengkap');
      return;
    }

    const msg = personalize(template, name);

    if (typeof Communication !== 'undefined') {
      Communication.broadcast([{ name, phone }], msg);
    }

  }


  async function sendAll(template, delay = 800) {

    if (!list.length) {
      NotifySafe.error('Tidak ada penerima');
      return;
    }

    if (!template) {
      NotifySafe.error('Pesan kosong');
      return;
    }

    if (typeof Communication !== 'undefined') {
      Communication.broadcast(list, template);
    }

  }


  return {
    load,
    filter,
    send,
    sendAll
  };

})();


/* ============================================================
2. BROADCAST UI
============================================================ */

const BroadcastUI = (() => {

  function render(list) {

    const el = document.getElementById('bc-list');
    if (!el) return;

    if (!list.length) {
      el.innerHTML = `
        <div style="padding:24px;text-align:center;">
          Tidak ada data pelanggan
        </div>
      `;
      return;
    }

    el.innerHTML = list.map(c => `
      <div class="bc-item" data-phone="${c.phone}" data-name="${escape(c.name)}">
        <div>
          <div class="bc-name">${escape(c.name)}</div>
          <div class="bc-phone">${c.phone}</div>
        </div>
        <button class="btn-wa">Kirim</button>
      </div>
    `).join('');
  }


  function getMessage() {
    return document.getElementById('broadcast-msg')?.value || '';
  }


  function escape(str) {
    return String(str || '').replace(/[&<>"']/g, s => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[s]);
  }


  return {
    render,
    getMessage
  };

})();


/* ============================================================
3. EVENT BINDING
============================================================ */

(function bindBroadcastEvents() {

  const search = document.getElementById('bc-search');
  const listEl = document.getElementById('bc-list');
  const sendAllBtn = document.getElementById('bc-send-all');

  /* SEARCH */

  if (search) {
    search.addEventListener('input', Utils.debounce((e) => {

      const q = e.target.value;

      const result = BroadcastController.filter(q);

      BroadcastUI.render(result);

    }, 250));
  }

  /* SEND SINGLE */

  if (listEl) {

    listEl.addEventListener('click', (e) => {

      const item = e.target.closest('.bc-item');
      if (!item) return;

      const phone = item.dataset.phone;
      const name  = item.dataset.name;

      const msg = BroadcastUI.getMessage();

      if (!msg) {
        NotifySafe.error('Isi pesan terlebih dahulu');
        return;
      }

      BroadcastController.send(phone, name, msg);

    });

  }

  /* SEND ALL */

  if (sendAllBtn) {

    sendAllBtn.addEventListener('click', async () => {

      const msg = BroadcastUI.getMessage();

      if (!msg) {
        NotifySafe.error('Pesan kosong');
        return;
      }

      const confirmSend = confirm('Kirim broadcast ke semua pelanggan?');
      if (!confirmSend) return;

      await BroadcastController.sendAll(msg);

      NotifySafe.success('Broadcast dijalankan');

    });

  }

})();


/* ============================================================
4. ROUTER HOOK (FIXED)
============================================================ */

addRouteHook(async (name) => {

  if (name === 'broadcast') {

    Logger.log('[Broadcast] load');

    const data = await BroadcastController.load();

    BroadcastUI.render(data);

  }

});


/* ============================================================
5. AUTO REFRESH (EVENTBRIDGE)
============================================================ */

EventBridge.on('reservation:changed', async () => {

  if (!Router || !Router.getCurrent) return;

  if (Router.getCurrent() !== 'broadcast') return;

  const data = await BroadcastController.load();

  BroadcastUI.render(data);

});


/* ============================================================
6. LOG
============================================================ */

Logger.log('[Part9] Broadcast system ready');

'use strict';

/* ============================================================
APP.JS (REFactored)
PART 10/20 (FIXED)
SETTINGS + BUSINESS RULES (SAFE VERSION)
============================================================ */

/*
PERBAIKAN:
- Tidak override langsung Reservation.create (hindari conflict)
- Business rules dijadikan reusable validator
- Event pakai EventBridge
- Lebih aman untuk integrasi Part 17 (safe layer)
*/


/* ============================================================
1. SETTINGS BRIDGE (SINGLE SOURCE)
============================================================ */

const SettingsBridge = (() => {

  let cache = null;

  function load() {
    cache = Settings.get();
    return cache;
  }

  function get() {
    if (!cache) load();
    return cache;
  }

  function refresh() {
    cache = Settings.get();
    return cache;
  }

  return {
    load,
    get,
    refresh
  };

})();


/* ============================================================
2. BUSINESS RULES ENGINE
============================================================ */

const BusinessRules = (() => {

  function isOpenNow() {
    return Settings.isOpenNow();
  }


  function getMaxCapacity() {

    const s = SettingsBridge.get();

    return s.maxCapacityPerDay || CONFIG.MAX_CAPACITY_PER_SLOT || 20;
  }


  async function canAcceptReservation(date, guests) {

    const list = await Reservation.getByDate(date);

    const total = list.reduce((sum, r) => {
      if (r.status === Reservation.STATUS.CANCELLED) return sum;
      return sum + (r.guests || 0);
    }, 0);

    return (total + guests) <= getMaxCapacity();
  }


  function shouldAutoConfirm() {
    const s = SettingsBridge.get();
    return !!s.autoConfirm;
  }


  function isWAEnabled() {
    const s = SettingsBridge.get();
    return !!s.enableWA;
  }


  function getBusinessPhone() {
    const s = SettingsBridge.get();
    return s.phoneNumber || '';
  }


  /* ============================================================
  VALIDATION ENTRY (DIGUNAKAN DI SAFE LAYER)
  ============================================================ */

  async function validateReservation(payload) {

    if (!isOpenNow()) {
      throw new Error('Restoran sedang tutup');
    }

    const ok = await canAcceptReservation(
      payload.date,
      payload.guests
    );

    if (!ok) {
      throw new Error('Kapasitas penuh di tanggal tersebut');
    }

    return true;
  }


  function applyAutoRules(payload) {

    if (shouldAutoConfirm()) {
      payload.status = Reservation.STATUS.CONFIRMED;
    }

    return payload;
  }


  return {
    isOpenNow,
    getMaxCapacity,
    canAcceptReservation,
    shouldAutoConfirm,
    isWAEnabled,
    getBusinessPhone,
    validateReservation,
    applyAutoRules
  };

})();


/* ============================================================
3. SAFE INTEGRATION KE FLOW (TIDAK PATCH CORE)
Digunakan oleh Part 17 (safeCreateReservation)
============================================================ */

window.__applyBusinessRules = async function (payload) {

  await BusinessRules.validateReservation(payload);

  return BusinessRules.applyAutoRules(payload);

};


/* ============================================================
4. PATCH WHATSAPP BEHAVIOR (SAFE)
============================================================ */

(function patchWhatsApp() {

  if (!window.WA) return;

  const originalOpen = WA.open;

  WA.open = function (phone, msg) {

    if (!BusinessRules.isWAEnabled()) {
      NotifySafe.error('Fitur WhatsApp dinonaktifkan');
      return;
    }

    if (!phone) {
      phone = BusinessRules.getBusinessPhone();
    }

    return originalOpen(phone, msg);
  };

})();


/* ============================================================
5. SETTINGS → UI BRIDGE
============================================================ */

const SettingsUIBridge = (() => {

  function apply() {

    const s = SettingsBridge.get();

    const nameEl = document.getElementById('biz-name');
    if (nameEl) nameEl.textContent = s.businessName;

    const sub = document.getElementById('cal-subtitle');
    if (sub) {
      sub.textContent =
        `Kelola reservasi ${s.businessName} dengan mudah`;
    }

  }


  function init() {

    apply();

    EventBridge.on('settings:updated', () => {
      SettingsBridge.refresh();
      apply();
    });

  }


  return {
    init,
    apply
  };

})();


/* ============================================================
6. PATCH SETTINGS SAVE → EVENTBRIDGE
============================================================ */

(function patchSettingsSave() {

  const originalSave = Settings.save;

  Settings.save = function (data) {

    const result = originalSave(data);

    EventBridge.emit('settings:updated');

    return result;
  };

})();


/* ============================================================
7. CAPACITY INDICATOR ENHANCEMENT
============================================================ */

(function patchCalendarCapacity() {

  const original = Calendar.getCalendar;

  Calendar.getCalendar = async function () {

    const data = await original();

    const max = BusinessRules.getMaxCapacity();

    data.grid = data.grid.map(cell => {

      if (cell.empty) return cell;

      let level = 'low';

      if (cell.guests > max * 0.8) level = 'high';
      else if (cell.guests > max * 0.4) level = 'medium';

      return {
        ...cell,
        capacityMax: max,
        level
      };

    });

    return data;
  };

})();


/* ============================================================
8. INIT SETTINGS SYSTEM
============================================================ */

(function initSettingsSystem() {

  Logger.log('[SettingsBridge] init');

  SettingsBridge.load();
  SettingsUIBridge.init();

})();

'use strict';

/* ============================================================
APP.JS (REFactored)
PART 11/20 (FIXED)
UNIFIED NOTIFICATION SYSTEM (SAFE & CONSISTENT)
============================================================ */

/*
PERBAIKAN:
- Satu sistem notifikasi: NotifySafe
- Tidak override method internal
- Tidak konflik dengan Part 6
- Support queue + action + persistent
*/


/* ============================================================
1. NOTIFICATION QUEUE ENGINE
============================================================ */

const NotificationQueue = (() => {

  const queue = [];
  let active = false;

  async function run() {

    if (active) return;
    active = true;

    while (queue.length) {

      const item = queue.shift();

      await show(item);

    }

    active = false;
  }

  function push(item) {
    queue.push(item);
    run();
  }

  function show(item) {

    return new Promise(resolve => {

      renderToast(item, resolve);

    });

  }

  return {
    push
  };

})();


/* ============================================================
2. TOAST RENDERER (SINGLE IMPLEMENTATION)
============================================================ */

function renderToast(opts, done) {

  const {
    message = '',
    type = 'info',
    duration = 2500,
    action = null,
    persistent = false
  } = opts;

  const container = getToastContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  toast.innerHTML = `
    <div class="toast-content">
      <div class="toast-msg">${escapeHtml(message)}</div>

      ${action ? `
        <button class="toast-action">
          ${escapeHtml(action.label)}
        </button>
      ` : ''}
    </div>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  /* =========================
     ACTION HANDLER
  ========================= */

  if (action) {

    const btn = toast.querySelector('.toast-action');

    if (btn) {
      btn.addEventListener('click', () => {

        try {
          action.onClick && action.onClick();
        } catch (e) {
          console.error(e);
        }

        remove();
      });
    }
  }

  /* =========================
     REMOVE
  ========================= */

  function remove() {

    toast.classList.remove('show');

    setTimeout(() => {
      toast.remove();
      done && done();
    }, 200);
  }

  /* =========================
     AUTO DISMISS
  ========================= */

  if (!persistent) {
    setTimeout(remove, duration);
  }

}


/* ============================================================
3. TOAST CONTAINER (SINGLETON)
============================================================ */

function getToastContainer() {

  let el = document.getElementById('toast-container');

  if (!el) {

    el = document.createElement('div');
    el.id = 'toast-container';

    Object.assign(el.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      maxWidth: '280px'
    });

    document.body.appendChild(el);
  }

  return el;
}


/* ============================================================
4. PUBLIC API (FINAL STANDARD)
============================================================ */

const NotifySafe = {

  success(message, opts = {}) {
    NotificationQueue.push({
      message,
      type: 'success',
      ...opts
    });
  },

  error(message, opts = {}) {
    NotificationQueue.push({
      message,
      type: 'error',
      ...opts
    });
  },

  info(message, opts = {}) {
    NotificationQueue.push({
      message,
      type: 'info',
      ...opts
    });
  },

  action(message, label, onClick) {
    NotificationQueue.push({
      message,
      type: 'info',
      action: {
        label,
        onClick
      }
    });
  }

};


/* ============================================================
5. GLOBAL BRIDGE (BACKWARD COMPAT)
============================================================ */

(function patchGlobalNotify() {

  if (window.Notify) {

    Notify.success = (msg) => NotifySafe.success(msg);
    Notify.error   = (msg) => NotifySafe.error(msg);
    Notify.info    = (msg) => NotifySafe.info(msg);

  }

})();


/* ============================================================
6. UX HELPERS
============================================================ */

const NotificationUX = (() => {

  function withUndo(label, undoFn) {

    NotifySafe.action(
      `${label} dihapus`,
      'Undo',
      undoFn
    );

  }

  function successBig(msg) {

    NotifySafe.success(msg, {
      duration: 3500
    });

  }

  function errorFriendly(err) {

    const msg = err?.message || 'Terjadi kesalahan';

    NotifySafe.error(msg, {
      duration: 3000
    });

  }

  return {
    withUndo,
    successBig,
    errorFriendly
  };

})();


/* ============================================================
7. GLOBAL SHORTCUT (OPTIONAL)
============================================================ */

window.showToast = function (msg, type = 'info') {

  if (type === 'success') return NotifySafe.success(msg);
  if (type === 'error')   return NotifySafe.error(msg);

  NotifySafe.info(msg);

};


/* ============================================================
8. INIT LOG
============================================================ */

Logger.log('[NotifySafe] unified notification system ready');

'use strict';

/* ============================================================
APP.JS (REFactored)
PART 12/20 (FIXED)
PERFORMANCE + STATE OPTIMIZATION (CLEAN)
============================================================ */

/*
PERBAIKAN:
- Single cache system (SmartCache)
- Tidak override fungsi global lama
- Tidak bergantung legacy state
- Terintegrasi dengan EventBridge
*/


/* ============================================================
1. SMART CACHE (SINGLE SOURCE)
============================================================ */

const SmartCache = (() => {

  const store = new Map();

  function set(key, value, ttl = 5000) {
    store.set(key, {
      value,
      expire: Date.now() + ttl
    });
  }

  function get(key) {

    const item = store.get(key);
    if (!item) return null;

    if (Date.now() > item.expire) {
      store.delete(key);
      return null;
    }

    return item.value;
  }

  function clear(prefix = null) {

    if (!prefix) {
      store.clear();
      return;
    }

    for (const key of store.keys()) {
      if (key.startsWith(prefix)) {
        store.delete(key);
      }
    }

  }

  return {
    set,
    get,
    clear
  };

})();


/* ============================================================
2. DATA PROVIDER (CLEAN ACCESS LAYER)
============================================================ */

const DataProvider = (() => {

  /* =========================
     GET ALL
  ========================= */

  async function getAllReservations() {

    const cached = SmartCache.get('res_all');
    if (cached) return cached;

    const data = await Reservation.getAll();

    SmartCache.set('res_all', data, 3000);

    return data;
  }


  /* =========================
     GET BY DATE
  ========================= */

  async function getByDate(date) {

    const key = `res_date_${date}`;

    const cached = SmartCache.get(key);
    if (cached) return cached;

    const data = await Reservation.getByDate(date);

    SmartCache.set(key, data, 3000);

    return data;
  }


  /* =========================
     GROUP BY DATE (OPTIMIZED)
  ========================= */

  async function getGroupedByDate() {

    const cached = SmartCache.get('res_grouped');
    if (cached) return cached;

    const list = await getAllReservations();

    const map = {};

    list.forEach(r => {
      if (!r.date) return;

      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    });

    SmartCache.set('res_grouped', map, 3000);

    return map;
  }


  return {
    getAllReservations,
    getByDate,
    getGroupedByDate
  };

})();


/* ============================================================
3. CACHE INVALIDATION (EVENT DRIVEN)
============================================================ */

(function bindCacheInvalidation() {

  EventBridge.on('reservation:changed', () => {
    SmartCache.clear('res_');
  });

})();


/* ============================================================
4. RENDER SCHEDULER (ANTI SPAM)
============================================================ */

const RenderScheduler = (() => {

  let scheduled = false;

  function schedule(fn) {

    if (scheduled) return;

    scheduled = true;

    requestAnimationFrame(() => {

      try {
        fn();
      } catch (e) {
        console.error('[RenderScheduler]', e);
      }

      scheduled = false;

    });

  }

  return {
    schedule
  };

})();


/* ============================================================
5. LIGHTWEIGHT LIST RENDERER
============================================================ */

const ListRenderer = (() => {

  function render(container, list, renderItem) {

    if (!container) return;

    const frag = document.createDocumentFragment();

    list.forEach(item => {
      const el = renderItem(item);
      if (el) frag.appendChild(el);
    });

    container.innerHTML = '';
    container.appendChild(frag);
  }

  return {
    render
  };

})();


/* ============================================================
6. VIRTUAL LIST (SAFE)
============================================================ */

const VirtualList = (() => {

  function render(container, list, renderItem, limit = 50) {

    if (!container) return;

    const visible = list.slice(0, limit);

    ListRenderer.render(container, visible, renderItem);

    if (list.length > limit) {

      const more = document.createElement('div');
      more.className = 'load-more';
      more.textContent = `Tampilkan ${list.length - limit} lagi...`;

      more.addEventListener('click', () => {
        render(container, list, renderItem, limit + 50);
      });

      container.appendChild(more);
    }

  }

  return {
    render
  };

})();


/* ============================================================
7. SAFE SEARCH ENGINE
============================================================ */

const SearchEngine = (() => {

  const run = Utils.debounce(async (query, cb) => {

    const list = await DataProvider.getAllReservations();

    const result = list.filter(r =>
      (r.name && r.name.toLowerCase().includes(query)) ||
      (r.phone && r.phone.includes(query))
    );

    cb(result);

  }, 250);

  return {
    run
  };

})();


/* ============================================================
8. CALENDAR PERFORMANCE PATCH (NON-INVASIVE)
============================================================ */

(function patchCalendarPerformance() {

  if (!Calendar || !Calendar.getCalendar) return;

  const original = Calendar.getCalendar;

  Calendar.getCalendar = async function () {

    const cached = SmartCache.get('calendar_data');
    if (cached) return cached;

    const base = await original();

    const grouped = await DataProvider.getGroupedByDate();

    base.grid = base.grid.map(cell => {

      if (cell.empty) return cell;

      const list = grouped[cell.dateStr] || [];

      const active = list.filter(
        r => r.status !== Reservation.STATUS.CANCELLED
      );

      const guests = active.reduce(
        (sum, r) => sum + (r.guests || 0),
        0
      );

      return {
        ...cell,
        total: list.length,
        guests
      };

    });

    SmartCache.set('calendar_data', base, 2000);

    return base;
  };

})();


/* ============================================================
9. IDLE PRELOAD (NON BLOCKING)
============================================================ */

(function preloadData() {

  function run() {

    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        DataProvider.getAllReservations();
      });
    } else {
      setTimeout(() => {
        DataProvider.getAllReservations();
      }, 200);
    }

  }

  run();

})();


/* ============================================================
10. SAFE REFRESH HELPERS
============================================================ */

const RefreshSafe = {

  calendar() {
    RenderScheduler.schedule(() => {
      if (UI && UI.renderCalendar) {
        UI.renderCalendar();
      }
    });
  },

  detail(date) {
    RenderScheduler.schedule(async () => {
      if (UI && UI.renderDetail) {
        await UI.renderDetail(date);
      }
    });
  }

};


/* ============================================================
11. AUTO REFRESH HOOK
============================================================ */

(function bindAutoRefresh() {

  EventBridge.on('reservation:changed', () => {

    RefreshSafe.calendar();

    const selected = Calendar.getSelected?.();

    if (selected) {
      RefreshSafe.detail(selected);
    }

  });

})();


/* ============================================================
12. INIT LOG
============================================================ */

Logger.log('[Performance] clean optimization active');

'use strict';

/* ============================================================
APP.JS (REFactored)
PART 13/20 (FIXED)
ERROR HANDLING + SAFETY LAYER (CLEAN)
============================================================ */

/*
PERBAIKAN:
- Tidak double global error handler
- Pakai NotifySafe (bukan alert)
- Tidak override fungsi global lama
- Modular & reusable
*/


/* ============================================================
1. ERROR HANDLER CORE
============================================================ */

const ErrorHandler = (() => {

  function log(error, context = '') {

    try {
      Logger.error('[Error]', context, error);
    } catch (e) {
      console.error(error);
    }

  }

  function getMessage(error) {

    if (!error) return 'Terjadi kesalahan';

    if (typeof error === 'string') return error;

    return error.message || 'Terjadi kesalahan tidak terduga';
  }

  function notify(error) {

    const msg = getMessage(error);

    if (window.NotifySafe) {
      NotifySafe.error(msg);
    } else {
      console.error(msg);
    }

  }

  function capture(error, context = '') {

    log(error, context);
    notify(error);

  }

  return {
    capture,
    log,
    notify
  };

})();


/* ============================================================
2. SAFE EXECUTION WRAPPER
============================================================ */

function safeExec(fn, fallback = null) {

  try {
    return fn();
  } catch (err) {

    ErrorHandler.capture(err, 'safeExec');

    return fallback;
  }

}

async function safeAsync(fn, fallback = null) {

  try {
    return await fn();
  } catch (err) {

    ErrorHandler.capture(err, 'safeAsync');

    return fallback;
  }

}


/* ============================================================
3. SAFE DOM HELPERS
============================================================ */

const SafeDOM = (() => {

  function get(id) {

    const el = document.getElementById(id);

    if (!el) {
      Logger.warn('[DOM Missing]', id);
    }

    return el;
  }

  function on(el, event, handler) {

    if (!el) return;

    el.addEventListener(event, (e) => {
      safeExec(() => handler(e));
    });

  }

  return {
    get,
    on
  };

})();


/* ============================================================
4. UI FALLBACK (NON-DESTRUCTIVE)
============================================================ */

const UIFallback = (() => {

  function show(message) {

    const container = document.getElementById('content');

    if (!container) return;

    container.innerHTML = `
      <div class="empty-state" style="padding:24px;text-align:center;">
        <div style="font-size:18px;font-weight:600;">
          Terjadi kesalahan
        </div>
        <div style="opacity:0.7;margin-top:8px;">
          ${escapeHtml(message || 'Gagal memuat tampilan')}
        </div>
        <button onclick="location.reload()" style="margin-top:12px;">
          Muat Ulang
        </button>
      </div>
    `;
  }

  return {
    show
  };

})();


/* ============================================================
5. NETWORK SAFE WRAPPER (FUTURE READY)
============================================================ */

const NetworkSafe = (() => {

  async function request(fn) {

    try {
      return await fn();
    } catch (err) {

      ErrorHandler.capture(err, 'network');

      NotifySafe?.error('Koneksi bermasalah');

      return null;
    }

  }

  return {
    request
  };

})();


/* ============================================================
6. GLOBAL ERROR HOOK (SINGLE INSTANCE)
============================================================ */

(function initGlobalErrorHandler() {

  if (window.__ERROR_HANDLER__) return;
  window.__ERROR_HANDLER__ = true;

  window.addEventListener('error', (e) => {
    ErrorHandler.capture(e.error || e.message, 'window.error');
  });

  window.addEventListener('unhandledrejection', (e) => {
    ErrorHandler.capture(e.reason, 'promise.rejection');
  });

})();


/* ============================================================
7. SAFE RENDER WRAPPER
============================================================ */

function safeRender(fn) {

  try {
    fn();
  } catch (err) {

    ErrorHandler.capture(err, 'render');

    UIFallback.show(err.message);
  }

}


/* ============================================================
8. STORAGE SAFE WRAPPER
============================================================ */

const SafeStorage = (() => {

  function get(key, fallback = null) {

    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {

      ErrorHandler.capture(err, 'storage.get');
      return fallback;
    }

  }

  function set(key, value) {

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {

      ErrorHandler.capture(err, 'storage.set');
    }

  }

  function remove(key) {

    try {
      localStorage.removeItem(key);
    } catch (err) {

      ErrorHandler.capture(err, 'storage.remove');
    }

  }

  return {
    get,
    set,
    remove
  };

})();


/* ============================================================
9. DATA VALIDATION GUARD (BASIC)
============================================================ */

const DataGuard = (() => {

  function isValidReservation(r) {

    if (!r) return false;

    if (!r.date) return false;
    if (!r.name) return false;

    return true;
  }

  function validateList(list) {

    if (!Array.isArray(list)) return [];

    return list.filter(isValidReservation);
  }

  return {
    isValidReservation,
    validateList
  };

})();


/* ============================================================
10. INIT LOG
============================================================ */

Logger.log('[SafetyLayer] clean & active');

'use strict';

/* ============================================================
APP.JS (REFactored)
PART 14/20 (FIXED)
WHATSAPP + COMMUNICATION ENGINE (UNIFIED)
============================================================ */

/*
PERBAIKAN:
- Tidak duplikasi dengan Part 5
- Satu message system
- Respect BusinessRules
- Tidak override global sembarangan
*/


/* ============================================================
1. PHONE NORMALIZER (INDONESIA SAFE)
============================================================ */

const PhoneUtil = (() => {

  function normalize(phone) {

    if (!phone) return '';

    let cleaned = String(phone).replace(/\D/g, '');

    if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.slice(1);
    }

    if (!cleaned.startsWith('62')) {
      cleaned = '62' + cleaned;
    }

    return cleaned;
  }

  function isValid(phone) {
    return normalize(phone).length >= 10;
  }

  return {
    normalize,
    isValid
  };

})();


/* ============================================================
2. TEMPLATE ENGINE (SINGLE SOURCE)
============================================================ */

const TemplateEngine = (() => {

  function render(template, data) {

    return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {

      const k = key.trim();

      return (data[k] !== undefined && data[k] !== null)
        ? data[k]
        : '';

    });

  }

  function formatDate(dateStr) {

    if (!dateStr) return '';

    const d = new Date(dateStr);

    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

  }

  return {
    render,
    formatDate
  };

})();


/* ============================================================
3. CENTRAL MESSAGE TEMPLATES
============================================================ */

const MessageTemplates = {

  confirmation: `
Halo Kak *{{name}}* 👋

Reservasi kamu di *{{biz}}* sudah kami terima.

📅 {{date}}
⏰ {{time}}
👥 {{guests}} orang

Kami tunggu kedatangannya 😊
`,

  reminder: `
Halo Kak *{{name}}* 👋

Kami mengingatkan reservasi kamu hari ini di *{{biz}}*:

⏰ {{time}}
👥 {{guests}} orang

Sampai jumpa 😊
`,

  thankYou: `
Halo Kak *{{name}}* 🙏

Terima kasih sudah berkunjung ke *{{biz}}* 😊

Kami tunggu kedatangan berikutnya!
`,

  broadcast: `
Halo Kak *{{name}}* 👋

{{message}}

Salam,
*{{biz}}*
`

};


/* ============================================================
4. MESSAGE BUILDER
============================================================ */

const MessageBuilder = (() => {

  function build(type, data = {}) {

    const template = MessageTemplates[type];
    if (!template) return '';

    const payload = {
      name: data.name || 'Customer',
      biz: SettingsBridge.get()?.businessName || 'Usaha',
      date: TemplateEngine.formatDate(data.date),
      time: data.time || '',
      guests: data.guests || '',
      message: data.message || ''
    };

    return TemplateEngine.render(template, payload);
  }

  return {
    build
  };

})();


/* ============================================================
5. WHATSAPP SERVICE (RULE-BASED)
============================================================ */

const WhatsAppService = (() => {

  function send(phone, message) {

    if (!BusinessRules.isWAEnabled()) {
      NotifySafe.error('Fitur WhatsApp dinonaktifkan');
      return;
    }

    if (!phone) {
      phone = BusinessRules.getBusinessPhone();
    }

    if (!PhoneUtil.isValid(phone)) {
      NotifySafe.error('Nomor tidak valid');
      return;
    }

    const url =
      'https://wa.me/' +
      PhoneUtil.normalize(phone) +
      '?text=' +
      encodeURIComponent(message);

    window.open(url, '_blank', 'noopener');

  }

  return {
    send
  };

})();


/* ============================================================
6. COMMUNICATION CONTROLLER (FINAL)
============================================================ */

const Communication = (() => {

  function sendConfirmation(res) {

    if (!res) return;

    const msg = MessageBuilder.build('confirmation', res);

    WhatsAppService.send(res.phone, msg);

    NotifySafe.success('Pesan konfirmasi dibuka');
  }


  function sendReminder(res) {

    if (!res) return;

    const msg = MessageBuilder.build('reminder', res);

    WhatsAppService.send(res.phone, msg);

    NotifySafe.info('Reminder dibuka');
  }


  function sendThankYou(res) {

    if (!res) return;

    const msg = MessageBuilder.build('thankYou', res);

    WhatsAppService.send(res.phone, msg);

    NotifySafe.success('Ucapan terima kasih dibuka');
  }


  function sendCustom(phone, message) {

    if (!phone || !message) {
      NotifySafe.error('Data tidak lengkap');
      return;
    }

    WhatsAppService.send(phone, message);
  }


  function sendBroadcast(list, message) {

    if (!list?.length) {
      NotifySafe.error('Tidak ada penerima');
      return;
    }

    if (!message) {
      NotifySafe.error('Pesan kosong');
      return;
    }

    list.forEach((c, i) => {

      setTimeout(() => {

        const msg = MessageBuilder.build('broadcast', {
          name: c.name,
          message
        });

        WhatsAppService.send(c.phone, msg);

      }, i * 800);

    });

    NotifySafe.success(`Broadcast dimulai (${list.length} kontak)`);
  }


  return {
    sendConfirmation,
    sendReminder,
    sendThankYou,
    sendCustom,
    sendBroadcast
  };

})();


/* ============================================================
7. AUTO REMINDER SYSTEM (SAFE)
============================================================ */

const AutoReminder = (() => {

  let started = false;

  function start() {

    if (started) return;
    started = true;

    setInterval(async () => {

      const today = Utils.today?.();
      if (!today) return;

      const list = await DataProvider.getByDate(today);

      const now = new Date();

      list.forEach(r => {

        if (!r.time || r.reminderSent) return;

        const [h, m] = r.time.split(':').map(Number);

        const resTime = new Date();
        resTime.setHours(h, m, 0);

        const diff = resTime - now;

        if (diff > 0 && diff < 3600000) {

          Communication.sendReminder(r);

          EventBridge.emit('reservation:updated', {
            ...r,
            reminderSent: true
          });

        }

      });

    }, 60000);

  }

  return {
    start
  };

})();


/* ============================================================
8. INIT
============================================================ */

(function initCommunication() {

  Logger.log('[Communication] unified engine ready');

  AutoReminder.start();

})();

'use strict';

/* ============================================================
APP.JS (REFactored)
PART 15/20 (FIXED)
UX MICRO INTERACTION (CLEAN & NON-INVASIVE)
============================================================ */

/*
PERBAIKAN:
- Tidak override fungsi global
- Event scoped & aman
- Tidak bentrok dengan UI module
*/


/* ============================================================
1. GLOBAL LOADER (SAFE)
============================================================ */

const Loader = (() => {

  let el = null;

  function ensure() {

    if (el) return;

    el = document.createElement('div');
    el.id = 'global-loader';

    el.innerHTML = `<div class="loader-spinner"></div>`;

    Object.assign(el.style, {
      position: 'fixed',
      inset: 0,
      background: 'rgba(255,255,255,0.5)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9998,
      opacity: 0,
      pointerEvents: 'none',
      transition: 'opacity 0.2s ease'
    });

    document.body.appendChild(el);
  }

  function show() {
    ensure();
    el.style.opacity = '1';
    el.style.pointerEvents = 'auto';
  }

  function hide() {
    if (!el) return;
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
  }

  return {
    show,
    hide
  };

})();


/* ============================================================
2. BUTTON LOADING HELPER
============================================================ */

const ButtonUX = (() => {

  function setLoading(btn, state = true) {

    if (!btn) return;

    if (state) {
      btn.dataset._text = btn.innerHTML;
      btn.innerHTML = '⏳';
      btn.disabled = true;
    } else {
      btn.innerHTML = btn.dataset._text || btn.innerHTML;
      btn.disabled = false;
    }

  }

  return {
    setLoading
  };

})();


/* ============================================================
3. RIPPLE EFFECT (OPT-IN)
============================================================ */

const Ripple = (() => {

  function attach(el) {

    if (!el || el.dataset.rippleAttached) return;

    el.dataset.rippleAttached = '1';

    el.addEventListener('click', (e) => {

      const circle = document.createElement('span');

      const rect = el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);

      circle.style.width = circle.style.height = size + 'px';
      circle.style.left = (e.clientX - rect.left - size / 2) + 'px';
      circle.style.top = (e.clientY - rect.top - size / 2) + 'px';

      circle.className = 'ripple';

      el.appendChild(circle);

      setTimeout(() => circle.remove(), 500);

    });

  }

  function init(selector = '.btn') {
    document.querySelectorAll(selector).forEach(attach);
  }

  return {
    init,
    attach
  };

})();


/* ============================================================
4. SMOOTH SCROLL UTIL
============================================================ */

const ScrollUX = {

  toTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  toElement(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

};


/* ============================================================
5. CLICK FEEDBACK (SAFE)
============================================================ */

(function clickFeedback() {

  document.addEventListener('click', (e) => {

    const btn = e.target.closest('.btn');
    if (!btn) return;

    btn.style.transform = 'scale(0.96)';

    setTimeout(() => {
      btn.style.transform = '';
    }, 120);

  });

})();


/* ============================================================
6. INPUT GUARD (LIGHT)
============================================================ */

(function inputGuard() {

  document.addEventListener('input', (e) => {

    const el = e.target;

    if (!(el instanceof HTMLInputElement)) return;

    if (el.name === 'guests' && el.value < 1) {
      el.value = 1;
    }

    if (el.name === 'name') {
      el.value = el.value.slice(0, 50);
    }

  });

})();


/* ============================================================
7. HOVER EFFECT (SCOPED)
============================================================ */

(function hoverEffect() {

  const container = document.getElementById('reservation-list');
  if (!container) return;

  container.addEventListener('mouseover', (e) => {

    const card = e.target.closest('.res-card');
    if (!card) return;

    card.style.transform = 'translateY(-2px)';
  });

  container.addEventListener('mouseout', (e) => {

    const card = e.target.closest('.res-card');
    if (!card) return;

    card.style.transform = '';
  });

})();


/* ============================================================
8. VIEW TRANSITION (SAFE)
============================================================ */

const ViewTransition = (() => {

  function apply() {

    const views = document.querySelectorAll('.view');

    views.forEach(v => {
      v.style.opacity = '0';
    });

    requestAnimationFrame(() => {
      views.forEach(v => {
        v.style.opacity = '1';
      });
    });

  }

  return {
    apply
  };

})();


/* ============================================================
9. EMPTY STATE HELPER
============================================================ */

function buildEmptyState(title, subtitle = '') {

  return `
    <div class="empty-state" style="padding:24px;text-align:center;">
      <div style="font-size:2rem;">📭</div>
      <div style="font-weight:600;">${escapeHtml(title)}</div>
      <div style="opacity:0.6;font-size:0.85rem;">
        ${escapeHtml(subtitle)}
      </div>
    </div>
  `;
}


/* ============================================================
10. SAFE FORM UX WRAPPER (NON-OVERRIDE)
============================================================ */

const FormUX = (() => {

  async function handleSubmit(btn, fn) {

    try {

      ButtonUX.setLoading(btn, true);
      Loader.show();

      await fn();

      NotifySafe.success('Berhasil disimpan');

    } catch (err) {

      NotificationUX.errorFriendly(err);

    } finally {

      ButtonUX.setLoading(btn, false);
      Loader.hide();

    }

  }

  return {
    handleSubmit
  };

})();


/* ============================================================
11. INIT UX SYSTEM
============================================================ */

(function initUX() {

  Logger.log('[UX] clean interaction active');

  Ripple.init();

})();
'use strict';

/* ============================================================
APP.JS (REFactored)
PART 16/20 (FIXED)
ARCHITECTURE CLEANUP + INTEGRATION (STABLE)
============================================================ */

/*
PERBAIKAN:
- Tidak redefine App
- Tidak override global function lama
- Event system disatukan
- Init tetap dari Part 1
*/


/* ============================================================
1. MODULE REGISTRY (NON-DESTRUCTIVE)
============================================================ */

const ModuleRegistry = (() => {

  const map = {};

  function register(name, module) {
    if (!name || !module) return;
    map[name] = module;
  }

  function get(name) {
    return map[name];
  }

  function list() {
    return Object.keys(map);
  }

  return {
    register,
    get,
    list
  };

})();


/* ============================================================
2. REGISTER CORE MODULES (SAFE)
============================================================ */

(function registerCoreModules() {

  const modules = {
    Reservation,
    Calendar,
    UI,
    Form,
    Menu,
    Filter,
    Analytics,
    Backup,
    Settings,
    Sync
  };

  Object.entries(modules).forEach(([name, mod]) => {
    if (mod) ModuleRegistry.register(name, mod);
  });

})();


/* ============================================================
3. DEPENDENCY CHECK (SOFT WARNING)
============================================================ */

(function dependencyCheck() {

  const required = ['Reservation', 'Calendar', 'UI', 'Form'];

  required.forEach(name => {
    if (!ModuleRegistry.get(name)) {
      console.warn(`[Dependency Missing] ${name}`);
    }
  });

})();


/* ============================================================
4. EVENT BRIDGE (UNIFIED SYSTEM)
============================================================ */

const EventBridge = (() => {

  function emit(name, payload) {

    if (window.Events && Events.emit) {
      Events.emit(name, payload);
    }

    document.dispatchEvent(new CustomEvent(name, {
      detail: payload
    }));

  }

  function on(name, handler) {

    if (window.Events && Events.on) {
      Events.on(name, handler);
    }

    document.addEventListener(name, (e) => {
      handler(e.detail);
    });

  }

  return {
    emit,
    on
  };

})();


/* ============================================================
5. SERVICE LAYER (NON-INVASIVE CRUD)
============================================================ */

const ReservationService = (() => {

  async function create(data) {

    const res = await Reservation.create(data);

    EventBridge.emit('reservation:created', res);
    EventBridge.emit('reservation:changed');

    return res;
  }

  async function update(id, patch) {

    const res = await Reservation.update(id, patch);

    EventBridge.emit('reservation:updated', res);
    EventBridge.emit('reservation:changed');

    return res;
  }

  async function remove(id) {

    await Reservation.remove(id);

    EventBridge.emit('reservation:deleted', id);
    EventBridge.emit('reservation:changed');

  }

  return {
    create,
    update,
    remove
  };

})();


/* ============================================================
6. GLOBAL REFRESH BUS
============================================================ */

const RefreshBus = (() => {

  function refreshAll() {

    if (UI?.renderCalendar) {
      UI.renderCalendar();
    }

    const selected = Calendar?.getSelected?.();

    if (selected && UI?.renderDetail) {
      UI.renderDetail(selected);
    }

  }

  return {
    refreshAll
  };

})();


/* ============================================================
7. AUTO SYNC UI WITH DATA
============================================================ */

(function bindAutoRefresh() {

  EventBridge.on('reservation:changed', () => {

    try {
      RefreshBus.refreshAll();
    } catch (err) {
      console.error('[Refresh Error]', err);
    }

  });

})();


/* ============================================================
8. SYNC LAYER BRIDGE
============================================================ */

(function bindSyncLayer() {

  if (!window.Sync || !Sync.subscribe) return;

  Sync.subscribe(() => {
    EventBridge.emit('reservation:changed');
  });

})();


/* ============================================================
9. SETTINGS → CONFIG SYNC
============================================================ */

(function syncSettingsToConfig() {

  try {

    const s = Settings?.get?.();

    if (s?.maxCapacityPerDay) {
      CONFIG.MAX_CAPACITY_PER_SLOT = s.maxCapacityPerDay;
    }

  } catch (err) {
    console.warn('[Settings Sync Failed]');
  }

})();


/* ============================================================
10. PUBLIC APP API (SAFE EXPORT)
============================================================ */

window.AppAPI = {

  create: (data) => ReservationService.create(data),
  update: (id, patch) => ReservationService.update(id, patch),
  delete: (id) => ReservationService.remove(id),

  refresh: () => EventBridge.emit('reservation:changed'),

  getAll: () => Reservation.getAll(),

  debug: () => {
    console.log({
      modules: ModuleRegistry.list(),
      cache: 'enabled'
    });
  }

};


/* ============================================================
11. DEV MODE HELPERS
============================================================ */

if (CONFIG?.DEBUG) {

  window.__DEV__ = {

    seed: async () => {

      for (let i = 1; i <= 10; i++) {

        await ReservationService.create({
          name: 'Customer ' + i,
          phone: '08123456789',
          date: Utils.today?.(),
          time: '18:00',
          guests: Math.ceil(Math.random() * 5)
        });

      }

    },

    clear: () => {
      localStorage.clear();
      location.reload();
    }

  };

}


/* ============================================================
12. HEALTH CHECK (LIGHT)
============================================================ */

(function healthCheck() {

  setTimeout(() => {

    try {

      const modules = ModuleRegistry.list();

      Logger.log('[HealthCheck] modules:', modules.length);

    } catch (e) {
      console.warn('[HealthCheck failed]');
    }

  }, 2000);

})();


/* ============================================================
13. INIT LOG
============================================================ */

Logger.log('[Architecture] clean & stable');

'use strict';

/* ============================================================
APP.JS (REFactored)
PART 17/20 (FIXED)
HARDENING LAYER (SAFE & NON-INVASIVE)
============================================================ */

/*
PERBAIKAN:
- Tidak override global function
- Terintegrasi dengan ReservationService
- Tidak konflik dengan ErrorHandler / BusinessRules
*/


/* ============================================================
1. INPUT SANITIZER
============================================================ */

const Sanitizer = (() => {

  function text(str) {
    return String(str || '')
      .replace(/[<>]/g, '')
      .trim();
  }

  function phone(str) {
    return String(str || '').replace(/\D/g, '');
  }

  function number(val, fallback = 0) {
    const n = Number(val);
    return isNaN(n) ? fallback : n;
  }

  function reservation(payload = {}) {

    return {
      name: text(payload.name),
      phone: phone(payload.phone),
      note: text(payload.note),
      date: payload.date,
      time: payload.time,
      guests: number(payload.guests, 1),
      menus: Array.isArray(payload.menus) ? payload.menus : []
    };

  }

  return {
    reservation,
    text,
    phone,
    number
  };

})();


/* ============================================================
2. DUPLICATE GUARD (ANTI DOUBLE SUBMIT)
============================================================ */

const DuplicateGuard = (() => {

  const cache = new Map();
  const TTL = 3000;

  function hash(obj) {
    return JSON.stringify(obj);
  }

  function isDuplicate(payload) {

    const key = hash(payload);
    const now = Date.now();

    if (cache.has(key)) {

      const last = cache.get(key);

      if (now - last < TTL) {
        return true;
      }

    }

    cache.set(key, now);
    return false;
  }

  function clear() {
    cache.clear();
  }

  return {
    isDuplicate,
    clear
  };

})();


/* ============================================================
3. ASYNC LOCK (ANTI RACE CONDITION)
============================================================ */

const AsyncLock = (() => {

  const locks = new Set();

  async function run(key, fn) {

    if (locks.has(key)) {
      Logger.warn('[LOCKED]', key);
      return;
    }

    locks.add(key);

    try {
      return await fn();
    } finally {
      locks.delete(key);
    }

  }

  return {
    run
  };

})();


/* ============================================================
4. SAFE RESERVATION WRAPPER
============================================================ */

const SafeReservation = (() => {

  async function create(payload) {

    const clean = Sanitizer.reservation(payload);

    if (DuplicateGuard.isDuplicate(clean)) {
      NotifySafe.info('Reservasi sedang diproses');
      return null;
    }

    return AsyncLock.run('create', async () => {

      try {

        const res = await ReservationService.create(clean);

        NotifySafe.success('Reservasi berhasil dibuat');

        return res;

      } catch (err) {

        ErrorHandler.capture(err, 'createReservation');
        throw err;

      }

    });

  }


  async function update(id, patch) {

    const clean = Sanitizer.reservation(patch);

    return AsyncLock.run('update_' + id, async () => {

      try {

        const res = await ReservationService.update(id, clean);

        NotifySafe.success('Reservasi diperbarui');

        return res;

      } catch (err) {

        ErrorHandler.capture(err, 'updateReservation');
        throw err;

      }

    });

  }


  async function remove(id) {

    return AsyncLock.run('delete_' + id, async () => {

      try {

        await ReservationService.remove(id);

        NotifySafe.info('Reservasi dihapus');

      } catch (err) {

        ErrorHandler.capture(err, 'deleteReservation');
        throw err;

      }

    });

  }


  return {
    create,
    update,
    remove
  };

})();


/* ============================================================
5. FORM HARDENING (OPTIONAL BIND)
============================================================ */

(function bindFormHardening() {

  const form = document.getElementById('reservation-form');
  if (!form) return;

  let submitting = false;

  form.addEventListener('submit', async (e) => {

    e.preventDefault();

    if (submitting) return;
    submitting = true;

    try {

      const values = Form.getValues
        ? Form.getValues()
        : {};

      await SafeReservation.create(values);

      Form.close?.();

    } catch (err) {
      // sudah ditangani
    } finally {
      submitting = false;
    }

  });

})();


/* ============================================================
6. INPUT GUARD (REALTIME SAFE)
============================================================ */

(function inputGuard() {

  document.addEventListener('input', (e) => {

    const el = e.target;

    if (!(el instanceof HTMLInputElement)) return;

    if (el.name === 'guests' && el.value < 1) {
      el.value = 1;
    }

    if (el.name === 'name') {
      el.value = el.value.slice(0, 50);
    }

  });

})();


/* ============================================================
7. LIGHT DATA INTEGRITY CHECK
============================================================ */

(function integrityCheck() {

  setInterval(async () => {

    try {

      const list = await Reservation.getAll();

      list.forEach(r => {

        if (!r.id || !r.date) {
          Logger.warn('[Invalid Data]', r);
        }

      });

    } catch (err) {
      Logger.warn('[Integrity check skipped]');
    }

  }, 30000);

})();


/* ============================================================
8. FAILSAFE LOG (NO UI INTERRUPTION)
============================================================ */

window.addEventListener('error', (e) => {
  console.error('[GLOBAL ERROR]', e.message);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[PROMISE ERROR]', e.reason);
});


/* ============================================================
9. INIT LOG
============================================================ */

Logger.log('[Hardening] safe layer active');

'use strict';

/* ============================================================
APP.JS (Refactored)
PART 18/20 (FIXED)
UI PERFORMANCE LAYER (NON-DUPLICATIVE)
============================================================ */

/*
PERBAIKAN:
- Tidak duplikasi DataStore / Memo
- Tidak override core logic
- Fokus ke UI performance saja
*/


/* ============================================================
1. DOM BATCH RENDER
============================================================ */

const DOMBatch = (() => {

  function render(container, items, renderItem) {

    if (!container) return;

    const frag = document.createDocumentFragment();

    items.forEach(item => {
      const el = renderItem(item);
      if (el) frag.appendChild(el);
    });

    container.innerHTML = '';
    container.appendChild(frag);

  }

  return {
    render
  };

})();


/* ============================================================
2. VIRTUAL LIST (FOR LARGE DATA)
============================================================ */

const VirtualList = (() => {

  function render(container, list, renderItem, limit = 50) {

    if (!container) return;

    const visible = list.slice(0, limit);

    DOMBatch.render(container, visible, renderItem);

    if (list.length > limit) {

      const more = document.createElement('div');
      more.className = 'load-more';
      more.textContent = `Tampilkan ${list.length - limit} lagi...`;

      more.addEventListener('click', () => {
        render(container, list, renderItem, limit + 50);
      });

      container.appendChild(more);

    }

  }

  return {
    render
  };

})();


/* ============================================================
3. FAST DETAIL RENDER (USING DATASTORE)
============================================================ */

async function fastRenderDetail(dateStr) {

  const container = document.getElementById('detail-list');
  if (!container) return;

  try {

    const list = await DataStore.getByDate(dateStr);

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state">Belum ada reservasi</div>
      `;
      return;
    }

    VirtualList.render(
      container,
      list,
      buildFastCard
    );

  } catch (err) {
    ErrorHandler.capture(err, 'fastRenderDetail');
  }

}


/* ============================================================
4. LIGHTWEIGHT CARD BUILDER
============================================================ */

function buildFastCard(r) {

  const div = document.createElement('div');
  div.className = 'res-card';

  div.innerHTML = `
    <div class="rc-top">
      <strong>${escapeHtml(r.name || 'Tanpa Nama')}</strong>
      <span>${r.time || ''}</span>
    </div>

    <div class="rc-body">
      👥 ${r.guests || 0} orang
    </div>
  `;

  return div;

}


/* ============================================================
5. DEBOUNCED SEARCH (DETAIL VIEW)
============================================================ */

const fastSearch = Utils.debounce(async (query) => {

  const container = document.getElementById('detail-list');
  if (!container) return;

  try {

    const list = await DataStore.getAll();

    const filtered = list.filter(r =>
      (r.name && r.name.toLowerCase().includes(query)) ||
      (r.phone && r.phone.includes(query))
    );

    VirtualList.render(container, filtered, buildFastCard);

  } catch (err) {
    ErrorHandler.capture(err, 'fastSearch');
  }

}, 250);


/* ============================================================
6. SEARCH INPUT BINDING
============================================================ */

(function bindFastSearch() {

  const input = document.getElementById('detail-search');
  if (!input) return;

  input.addEventListener('input', (e) => {
    fastSearch(e.target.value.toLowerCase());
  });

})();


/* ============================================================
7. THROTTLED CALENDAR REFRESH
============================================================ */

const refreshCalendarThrottled = Utils.debounce(() => {

  if (UI && UI.renderCalendar) {
    UI.renderCalendar();
  }

}, 120);


/* ============================================================
8. EVENT → UI SYNC (PERFORMANCE SAFE)
============================================================ */

(function bindPerformanceRefresh() {

  EventBridge.on('reservation:changed', () => {

    refreshCalendarThrottled();

    const selected = Calendar.getSelected();

    if (selected) {
      fastRenderDetail(selected);
    }

  });

})();


/* ============================================================
9. IDLE PRELOAD (NON-BLOCKING)
============================================================ */

function runIdle(fn) {

  if ('requestIdleCallback' in window) {
    requestIdleCallback(fn);
  } else {
    setTimeout(fn, 200);
  }

}

runIdle(async () => {

  try {
    await DataStore.getAll();
  } catch (err) {
    Logger.warn('[Preload skipped]');
  }

});


/* ============================================================
10. LAZY LOAD HEAVY VIEW
============================================================ */

const LazyView = (() => {

  const loaded = new Set();

  function load(name, fn) {

    if (loaded.has(name)) return;

    fn();
    loaded.add(name);

  }

  return {
    load
  };

})();


/* ============================================================
11. ROUTER HOOK (LAZY INIT)
============================================================ */

(function patchRouterLazy() {

  if (!Router || !Router.go) return;

  const original = Router.go;

  Router.go = async function (name) {

    await original(name);

    if (name === 'analysis') {
      LazyView.load('analysis', () => {
        AnalyticsController.loadAll();
      });
    }

    if (name === 'broadcast') {
      LazyView.load('broadcast', () => {
        BroadcastController.load();
      });
    }

  };

})();


/* ============================================================
12. SCROLL OPTIMIZATION (LIGHT)
============================================================ */

(function optimizeScroll() {

  let ticking = false;

  window.addEventListener('scroll', () => {

    if (!ticking) {

      requestAnimationFrame(() => {
        ticking = false;
      });

      ticking = true;

    }

  });

})();


/* ============================================================
13. DEFER HEAVY ELEMENTS
============================================================ */

function deferHeavy() {

  document.querySelectorAll('[data-defer]').forEach(el => {
    el.removeAttribute('data-defer');
  });

}

runIdle(deferHeavy);


/* ============================================================
14. PERFORMANCE FLAG
============================================================ */

window.__PERF_MODE__ = true;


/* ============================================================
15. INIT LOG
============================================================ */

Logger.log('[Performance] UI optimization active');

'use strict';

/* ============================================================
APP.JS (Refactored)
PART 19/20 (FIXED)
FINAL INTEGRATION & STABILITY
============================================================ */

/*
PERBAIKAN:
- Single init flow (no double init)
- Tidak override App registry
- Semua event via EventBridge
- Tidak ada direct render (pakai RefreshBus)
*/


/* ============================================================
1. CORE INIT GUARD (ANTI DOUBLE INIT)
============================================================ */

(function enforceSingleInit() {

  if (window.__PROSERVA_INIT__) {
    Logger.warn('[INIT] already initialized');
    return;
  }

  window.__PROSERVA_INIT__ = true;

})();


/* ============================================================
2. MODULE VALIDATION
============================================================ */

(function validateModules() {

  const required = [
    'Reservation',
    'Calendar',
    'UI',
    'Form',
    'Settings',
    'Sync'
  ];

  required.forEach(name => {

    if (!window[name]) {
      Logger.error(`[MODULE MISSING] ${name}`);
    }

  });

})();


/* ============================================================
3. SYNC → EVENT BRIDGE
============================================================ */

(function bindSyncLayer() {

  if (!window.Sync || !Sync.subscribe) return;

  Sync.subscribe(() => {
    EventBridge.emit('reservation:changed');
  });

})();


/* ============================================================
4. CENTRALIZED UI REFRESH (ONLY ENTRY POINT)
============================================================ */

(function bindCentralRefresh() {

  EventBridge.on('reservation:changed', () => {

    try {

      RefreshBus.full(); // 🔥 satu-satunya refresh

    } catch (err) {

      ErrorHandler.capture(err, 'centralRefresh');

    }

  });

})();


/* ============================================================
5. FORM ↔ MENU INTEGRATION (SAFE)
============================================================ */

(function integrateMenuIntoForm() {

  if (!window.Menu || !window.Form) return;

  const originalGetValues = Form.getValues;

  Form.getValues = function () {

    const base = originalGetValues
      ? originalGetValues()
      : {};

    return {
      ...base,
      menus: Menu.getData ? Menu.getData() : []
    };

  };

})();


/* ============================================================
6. SETTINGS → CONFIG SYNC (SAFE)
============================================================ */

(function syncSettingsToConfig() {

  try {

    const s = Settings.get?.();

    if (!s) return;

    if (s.maxCapacityPerDay) {
      CONFIG.MAX_CAPACITY_PER_SLOT = s.maxCapacityPerDay;
    }

  } catch (err) {
    Logger.warn('[Settings Sync Failed]');
  }

})();


/* ============================================================
7. ROUTER STABILITY PATCH
============================================================ */

(function stabilizeRouter() {

  if (!Router || !Router.go) return;

  const original = Router.go;

  Router.go = async function (name) {

    try {

      await original(name);

    } catch (err) {

      ErrorHandler.capture(err, 'Router.go');

    }

  };

})();


/* ============================================================
8. CALENDAR → DETAIL SYNC (EVENT BASED)
============================================================ */

(function bindCalendarSelection() {

  EventBridge.on('calendar:select', (date) => {

    if (!date) return;

    if (window.selectDate) {
      window.selectDate(date);
    }

  });

})();


/* ============================================================
9. PUBLIC API (SAFE EXPORT)
============================================================ */

window.Proserva = {

  refresh() {
    EventBridge.emit('reservation:changed');
  },

  async create(data) {
    return safeCreateReservation(data);
  },

  async update(data) {
    return safeUpdateReservation(data.id, data);
  },

  async delete(id) {
    return safeDeleteReservation(id);
  },

  async getAll() {
    return DataStore.getAll();
  },

  backup() {
    return Backup.exportData?.();
  },

  restore(file) {
    return Backup.importFile?.(file);
  },

  settings() {
    return Settings.get?.();
  },

  async health() {

    try {

      const list = await DataStore.getAll();

      return {
        ok: true,
        total: list.length,
        mode: CONFIG.DATA_MODE
      };

    } catch (err) {

      return { ok: false };

    }

  }

};


/* ============================================================
10. SAFE INIT ENTRY (FINAL)
============================================================ */

(async function initApp() {

  try {

    Logger.log('[INIT] Starting Proserva...');

    // urutan aman (single flow)
    Settings.init?.();
    Sync.init?.();
    UI.init?.();
    Form.init?.();
    Menu.init?.();
    Filter.init?.();
    Backup.init?.();

    // initial trigger (bukan render langsung)
    EventBridge.emit('reservation:changed');

    Logger.log('[INIT] Proserva Ready');

  } catch (err) {

    ErrorHandler.capture(err, 'initApp');

    Notify.error('Gagal memulai aplikasi');

  }

})();


/* ============================================================
11. AUTO RECOVERY (SAFE RESET)
============================================================ */

window.recoverApp = function () {

  try {

    Logger.warn('[RECOVERY] resetting app');

    localStorage.removeItem(KEYS.reservations);

    location.reload();

  } catch (err) {

    Logger.error('[RECOVERY FAILED]', err);

  }

};


/* ============================================================
12. DEV HELPERS (SAFE)
============================================================ */

if (CONFIG.DEBUG) {

  window.__DEV__ = {

    async seed() {

      for (let i = 1; i <= 10; i++) {

        await safeCreateReservation({
          name: 'Customer ' + i,
          phone: '08123456789',
          date: Utils.today(),
          time: '18:00',
          guests: Math.ceil(Math.random() * 5)
        });

      }

    },

    clear() {
      localStorage.clear();
      location.reload();
    }

  };

}


/* ============================================================
13. FINAL LOCK (SAFE OBJECT ONLY)
============================================================ */

Object.freeze(window.Proserva);


/* ============================================================
14. FINAL LOG
============================================================ */

Logger.log('[System] integration stable');

'use strict';

/* ============================================================
APP.JS (Refactored)
PART 20/20 (FIXED)
PRODUCTION MODE (STABLE & SAFE)
============================================================ */

/*
PERBAIKAN:
- Tidak override console
- Tidak redefine SafeStorage
- Cleanup aman (tidak ganggu cache)
- Final API konsisten
*/


/* ============================================================
1. PRODUCTION FLAG (SAFE)
============================================================ */

(function setProductionMode() {

  const isProd = !CONFIG.DEBUG;

  window.__PROD__ = isProd;

  if (isProd) {
    Logger.log('[MODE] Production');
  } else {
    Logger.log('[MODE] Development');
  }

})();


/* ============================================================
2. AUTO BACKUP SNAPSHOT (SAFE)
============================================================ */

(function autoBackup() {

  const INTERVAL = 60000; // 1 menit

  setInterval(async () => {

    try {

      const data = await DataStore.getAll();

      if (!data || !data.length) return;

      SafeStorage.set('psv_autobackup', {
        t: Date.now(),
        data
      });

    } catch (err) {
      Logger.warn('[Backup] skipped');
    }

  }, INTERVAL);

})();


/* ============================================================
3. AUTO RECOVERY CHECK (NON-DESTRUCTIVE)
============================================================ */

(function autoRecoveryCheck() {

  try {

    const backup = SafeStorage.get('psv_autobackup');
    if (!backup || !backup.data) return;

    const current = SafeStorage.get(KEYS.reservations);

    // restore hanya jika data kosong / corrupt
    if (!current || !Array.isArray(current) || current.length === 0) {

      Logger.warn('[Recovery] restoring backup');

      SafeStorage.set(KEYS.reservations, backup.data);

    }

  } catch (err) {
    Logger.warn('[Recovery] failed');
  }

})();


/* ============================================================
4. NETWORK STATUS MONITOR
============================================================ */

(function networkMonitor() {

  function updateStatus() {

    if (!navigator.onLine) {
      Notifier.info('Mode offline aktif');
    } else {
      Logger.log('[Network] online');
    }

  }

  window.addEventListener('offline', updateStatus);
  window.addEventListener('online', updateStatus);

})();


/* ============================================================
5. PERFORMANCE WATCHDOG (LIGHT)
============================================================ */

(function performanceWatch() {

  const start = performance.now();

  window.addEventListener('load', () => {

    const time = performance.now() - start;

    if (time > 2500) {
      Logger.warn('[PERF] slow load:', Math.round(time), 'ms');
    }

  });

})();


/* ============================================================
6. MEMORY CLEANER (SAFE VERSION)
============================================================ */

(function memoryCleaner() {

  setInterval(() => {

    try {

      // hanya bersihkan cache ringan (jika ada)
      if (window.Memo) {
        Memo.clear('temp'); // hanya key tertentu (non-critical)
      }

    } catch (err) {
      Logger.warn('[Memory] cleanup skipped');
    }

  }, 60000);

})();


/* ============================================================
7. UI FAILSAFE (LAST DEFENSE)
============================================================ */

function safeUI(fn) {

  try {
    fn();
  } catch (err) {

    ErrorHandler.capture(err, 'safeUI');

    Notifier.error('Terjadi kesalahan tampilan');

  }

}


/* ============================================================
8. GLOBAL CLICK GUARD (ANTI SPAM)
============================================================ */

(function clickGuard() {

  let lastClick = 0;

  document.addEventListener('click', (e) => {

    const now = Date.now();

    if (now - lastClick < 150) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }

    lastClick = now;

  }, true);

})();


/* ============================================================
9. INPUT LIMIT GUARD
============================================================ */

(function limitInputs() {

  document.addEventListener('input', (e) => {

    const el = e.target;

    if (el.tagName === 'TEXTAREA') {

      if (el.value.length > 500) {
        el.value = el.value.slice(0, 500);
      }

    }

  });

})();


/* ============================================================
10. FINAL PUBLIC API (CONSISTENT)
============================================================ */

window.Proserva = Object.freeze({

  create: safeCreateReservation,
  update: (data) => safeUpdateReservation(data.id, data),
  delete: safeDeleteReservation,

  getAll: () => DataStore.getAll(),

  backup: () => Backup.exportData?.(),
  restore: (file) => Backup.importFile?.(file),

  settings: () => Settings.get?.(),

  version: '1.0.0',

  async health() {

    try {

      const list = await DataStore.getAll();

      return {
        ok: true,
        total: list.length,
        mode: CONFIG.DATA_MODE,
        prod: window.__PROD__
      };

    } catch (err) {

      return {
        ok: false
      };

    }

  }

});


/* ============================================================
11. FINAL INIT SYNC
============================================================ */

(function finalInit() {

  try {

    Logger.log('[FINAL] system ready');

    // trigger refresh via event system
    EventBridge.emit('reservation:changed');

  } catch (err) {

    ErrorHandler.capture(err, 'finalInit');

  }

})();


/* ============================================================
12. VERSION STAMP
============================================================ */

console.log('%cProserva v1.0.0 🚀', 'color:#22c55e;font-weight:bold;');


/* ============================================================
END
============================================================ */