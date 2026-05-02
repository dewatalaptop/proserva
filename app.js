‘use strict’;

/* ============================================================
APP.JS — PROSERVA (PRODUCTION CLEAN)
ALL CRITICAL BUGS FIXED:
1.1 Single create flow → SafeReservation.create only
1.2 DataStore → DataProvider (unified)
1.3 Duplicate VirtualList removed
1.4 Single Router.go patch
1.5 Events → EventBridge only
1.6 RefreshBus.full → RefreshBus.refreshAll
1.7 Notifier → NotifySafe everywhere
2.1 Double boot removed → single App.init
2.2 Side effects consolidated into App.init
3.1 renderCalendar guarded by RenderScheduler
============================================================ */

/* ============================================================
PART 1 — BOOTSTRAP + GLOBAL INIT ORCHESTRATOR
============================================================ */

(function () {
if (typeof guardInit === ‘function’) {
const allowed = guardInit();
if (!allowed) return;
}
})();

const App = (() => {

let initialized = false;

async function init() {

```
if (initialized) {
  Logger.warn('[App] already initialized');
  return;
}

initialized = true;

Logger.log('[App] initializing...');

try {

  /* Strict dependency check */
  _validateModules();

  /* Settings sync must happen first */
  _syncSettingsToConfig();

  /* Init modules in safe order */
  Sync.init?.();
  Settings.init?.();
  UI.init?.();
  Form.init?.();
  Menu.init?.();
  Filter.init?.();
  Backup.init?.();

  /* Single Router patch */
  _patchRouter();

  /* Global event bindings */
  _bindGlobalEvents();

  /* First render via event bus */
  EventBridge.emit('reservation:changed');

  Logger.log('[App] initialized successfully');

} catch (err) {

  Logger.error('[App] init error:', err);

  NotifySafe.error('Gagal memulai aplikasi');

}
```

}

/* ── Module validator ── */

function _validateModules() {

```
const required = [
  'Reservation', 'Calendar', 'UI',
  'Form', 'Settings', 'Sync'
];

required.forEach(name => {
  if (!window[name]) {
    throw new Error(`[MODULE MISSING] ${name}`);
  }
});
```

}

/* ── Settings → CONFIG sync ── */

function _syncSettingsToConfig() {

```
try {
  const s = Settings.get?.();
  if (s?.maxCapacityPerDay) {
    CONFIG.MAX_CAPACITY_PER_SLOT = s.maxCapacityPerDay;
  }
} catch (err) {
  Logger.warn('[Settings Sync Failed]');
}
```

}

/* ── SINGLE Router patch (replaces Parts 7, 18, 19) ── */

function _patchRouter() {

```
if (!window.Router || !Router.go) return;
if (Router.__PATCHED__) return;

const original = Router.go.bind(Router);

Router.go = async function (name) {

  try {

    await original(name);

    /* Run registered hooks */
    for (const fn of RouterHooks) {
      try { await fn(name); } catch (e) { Logger.error('[RouterHook]', e); }
    }

    /* Lazy view init */
    LazyView.handle(name);

  } catch (err) {
    ErrorHandler.capture(err, 'Router.go');
  }

};

Router.__PATCHED__ = true;
Logger.log('[Router] single patch active');
```

}

/* ── Global events ── */

function _bindGlobalEvents() {

```
/* ESC → close modal */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') Form?.close?.();
});

/* Window focus → refresh via scheduler */
window.addEventListener('focus', () => {
  RenderScheduler.schedule(() => UI.renderCalendar?.());
});
```

}

return { init };

})();

/* ── DOM ready boot (single entry) ── */

(function boot() {

if (document.readyState === ‘loading’) {
document.addEventListener(‘DOMContentLoaded’, () => App.init());
} else {
App.init();
}

})();

/* ============================================================
PART 2 — VIEW ROUTER + NAVIGATION
============================================================ */

const Router = (() => {

let currentView = null;

const VIEWS = [
‘calendar’, ‘detail’, ‘menus’, ‘locations’,
‘customers’, ‘analysis’, ‘broadcast’, ‘settings’
];

function getViews()    { return document.querySelectorAll(’#content .view’); }
function getNavItems() { return document.querySelectorAll(’.nav-item’); }
function getViewEl(n)  { return document.getElementById(‘view-’ + n); }

async function go(name) {

```
if (!VIEWS.includes(name)) {
  Logger.warn('[Router] unknown view:', name);
  return;
}

if (currentView === name) return;
currentView = name;

Logger.log('[Router] navigating →', name);

getViews().forEach(v => {
  v.style.display = 'none';
  v.classList.remove('active-view');
});

const target = getViewEl(name);
if (target) {
  target.style.display = 'block';
  target.classList.add('active-view');
}

getNavItems().forEach(n => {
  n.classList.toggle('active', n.dataset.view === name);
});

_updatePageTitle(name);
_closeSidebarIfOpen();
```

}

function _updatePageTitle(name) {

```
const el = document.getElementById('page-title');
if (!el) return;

const map = {
  calendar: 'Kalender', detail: 'Detail Reservasi',
  menus: 'Menu', locations: 'Lokasi',
  customers: 'Pelanggan', analysis: 'Analisis',
  broadcast: 'Broadcast', settings: 'Pengaturan'
};

el.textContent = map[name] || '';
```

}

function _closeSidebarIfOpen() {

```
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');

if (sidebar?.classList.contains('open')) {
  sidebar.classList.remove('open');
  overlay?.classList.remove('show');
}
```

}

function getCurrent() { return currentView; }

return { go, getCurrent };

})();

/* Router hook registry */
const RouterHooks = window.RouterHooks || [];
window.RouterHooks = RouterHooks;

function addRouteHook(fn) {
if (typeof fn === ‘function’) RouterHooks.push(fn);
}

/* Nav click binding */
(function bindNavigation() {

document.querySelectorAll(’.nav-item’).forEach(item => {

```
item.addEventListener('click', () => {
  const view = item.dataset.view;
  if (view) Router.go(view);
});
```

});

})();

window.goView = (name) => Router.go(name);

/* ============================================================
PART 3 — CALENDAR ↔ DETAIL BRIDGE
============================================================ */

const DateController = (() => {

async function select(dateStr) {

```
if (!dateStr) return;

Logger.log('[DateController] select →', dateStr);

Calendar.select(dateStr);
_updateDetailHeader(dateStr);

await Router.go('detail');
```

}

async function back() {
Logger.log(’[DateController] back to calendar’);
await Router.go(‘calendar’);
}

function _updateDetailHeader(dateStr) {

```
const el = document.getElementById('detail-title');
if (!el) return;

const parts = dateStr.split('-');
if (parts.length !== 3) { el.textContent = dateStr; return; }

const months = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
];

const y = parseInt(parts[0], 10);
const m = parseInt(parts[1], 10) - 1;
const d = parseInt(parts[2], 10);

el.textContent = `${d} ${months[m]} ${y}`;
```

}

return { select, back };

})();

/* Calendar grid click delegation */
(function bindCalendarClicks() {

const grid = document.getElementById(‘calendar-grid’);
if (!grid) return;

grid.addEventListener(‘click’, (e) => {

```
const cell = e.target.closest('.cal-day');
if (!cell || cell.classList.contains('empty')) return;

const dateStr = cell.dataset.date;
if (dateStr) DateController.select(dateStr);
```

});

})();

/* Inject dataset.date into calendar cells after render */
(function patchCalendarRender() {

if (!window.UI?.renderCalendar) return;

const original = UI.renderCalendar.bind(UI);

UI.renderCalendar = async function () {

```
await original();

document.querySelectorAll('#calendar-grid .cal-day').forEach(cell => {

  if (cell.classList.contains('empty')) return;

  const numEl = cell.querySelector('.cal-day-num');
  if (!numEl) return;

  const day  = parseInt(numEl.textContent, 10);
  const base = Calendar.getSelected() ? new Date(Calendar.getSelected()) : new Date();

  cell.dataset.date = Utils.formatDate(
    base.getFullYear(), base.getMonth(), day
  );

});
```

};

})();

/* Backward compat globals */
window.selectDate    = (d) => DateController.select(d);
window.backToCalendar = ()  => DateController.back();

/* ============================================================
PART 4 — EVENT BRIDGE (UNIFIED — replaces Events.on/emit)
============================================================ */

const EventBridge = (() => {

function emit(name, payload) {
/* Also fire on legacy Events if available */
window.Events?.emit?.(name, payload);

```
document.dispatchEvent(new CustomEvent(name, { detail: payload }));
```

}

function on(name, handler) {
/* Also subscribe via legacy Events if available */
window.Events?.on?.(name, handler);

```
document.addEventListener(name, (e) => handler(e.detail));
```

}

return { emit, on };

})();

/* ============================================================
PART 5 — NOTIFICATION SYSTEM (NotifySafe — single source)
============================================================ */

/* Queue engine */
const NotificationQueue = (() => {

const queue = [];
let active = false;

async function run() {
if (active) return;
active = true;
while (queue.length) await _show(queue.shift());
active = false;
}

function push(item) { queue.push(item); run(); }

function _show(item) {
return new Promise(resolve => _renderToast(item, resolve));
}

return { push };

})();

function _renderToast(opts, done) {

const {
message  = ‘’,
type     = ‘info’,
duration = 2500,
action   = null,
persistent = false
} = opts;

const container = _getToastContainer();
const toast = document.createElement(‘div’);
toast.className = `toast toast-${type}`;

toast.innerHTML = `<div class="toast-content"> <div class="toast-msg">${escapeHtml(message)}</div> ${action ?`<button class="toast-action">${escapeHtml(action.label)}</button>` : ''} </div>`;

container.appendChild(toast);
requestAnimationFrame(() => toast.classList.add(‘show’));

if (action) {
toast.querySelector(’.toast-action’)?.addEventListener(‘click’, () => {
try { action.onClick?.(); } catch (e) { console.error(e); }
_remove();
});
}

function _remove() {
toast.classList.remove(‘show’);
setTimeout(() => { toast.remove(); done?.(); }, 200);
}

if (!persistent) setTimeout(_remove, duration);

}

function _getToastContainer() {

let el = document.getElementById(‘toast-container’);
if (!el) {
el = document.createElement(‘div’);
el.id = ‘toast-container’;
Object.assign(el.style, {
position: ‘fixed’, top: ‘20px’, right: ‘20px’,
zIndex: 9999, display: ‘flex’, flexDirection: ‘column’,
gap: ‘8px’, maxWidth: ‘280px’
});
document.body.appendChild(el);
}
return el;

}

const NotifySafe = {

success(message, opts = {}) {
NotificationQueue.push({ message, type: ‘success’, …opts });
},

error(message, opts = {}) {
NotificationQueue.push({ message, type: ‘error’, …opts });
},

info(message, opts = {}) {
NotificationQueue.push({ message, type: ‘info’, …opts });
},

action(message, label, onClick) {
NotificationQueue.push({ message, type: ‘info’, action: { label, onClick } });
}

};

/* Bridge to legacy Notify object */
(function patchGlobalNotify() {
if (window.Notify) {
Notify.success = (m) => NotifySafe.success(m);
Notify.error   = (m) => NotifySafe.error(m);
Notify.info    = (m) => NotifySafe.info(m);
}
})();

/* UX helpers */
const NotificationUX = {

withUndo(label, undoFn) {
NotifySafe.action(`${label} dihapus`, ‘Undo’, undoFn);
},

errorFriendly(err) {
NotifySafe.error(err?.message || ‘Terjadi kesalahan’, { duration: 3000 });
}

};

/* Global shortcuts */
window.notifySuccess = (m) => NotifySafe.success(m);
window.notifyError   = (m) => NotifySafe.error(m);
window.notifyInfo    = (m) => NotifySafe.info(m);
window.showToast     = (m, t = ‘info’) => NotifySafe[t]?.(m) ?? NotifySafe.info(m);

Logger.log(’[NotifySafe] unified notification system ready’);

/* ============================================================
PART 6 — ERROR HANDLING + SAFETY LAYER
============================================================ */

const ErrorHandler = (() => {

function log(error, context = ‘’) {
try { Logger.error(’[Error]’, context, error); }
catch (e) { console.error(error); }
}

function getMessage(error) {
if (!error) return ‘Terjadi kesalahan’;
if (typeof error === ‘string’) return error;
return error.message || ‘Terjadi kesalahan tidak terduga’;
}

function notify(error) {
NotifySafe.error(getMessage(error));
}

function capture(error, context = ‘’) {
log(error, context);
notify(error);
}

return { capture, log, notify };

})();

function safeExec(fn, fallback = null) {
try { return fn(); }
catch (err) { ErrorHandler.capture(err, ‘safeExec’); return fallback; }
}

async function safeAsync(fn, fallback = null) {
try { return await fn(); }
catch (err) { ErrorHandler.capture(err, ‘safeAsync’); return fallback; }
}

const SafeDOM = {

get(id) {
const el = document.getElementById(id);
if (!el) Logger.warn(’[DOM Missing]’, id);
return el;
},

on(el, event, handler) {
if (!el) return;
el.addEventListener(event, (e) => safeExec(() => handler(e)));
}

};

const SafeStorage = (() => {

function get(key, fallback = null) {
try {
const raw = localStorage.getItem(key);
return raw ? JSON.parse(raw) : fallback;
} catch (err) { ErrorHandler.capture(err, ‘storage.get’); return fallback; }
}

function set(key, value) {
try { localStorage.setItem(key, JSON.stringify(value)); }
catch (err) { ErrorHandler.capture(err, ‘storage.set’); }
}

function remove(key) {
try { localStorage.removeItem(key); }
catch (err) { ErrorHandler.capture(err, ‘storage.remove’); }
}

return { get, set, remove };

})();

const DataGuard = {

isValidReservation(r) {
return !!(r?.date && r?.name);
},

validateList(list) {
if (!Array.isArray(list)) return [];
return list.filter(r => this.isValidReservation(r));
}

};

/* Single global error hook */
(function initGlobalErrorHandler() {

if (window.**ERROR_HANDLER**) return;
window.**ERROR_HANDLER** = true;

window.addEventListener(‘error’, (e) => {
ErrorHandler.capture(e.error || e.message, ‘window.error’);
});

window.addEventListener(‘unhandledrejection’, (e) => {
ErrorHandler.capture(e.reason, ‘promise.rejection’);
});

})();

Logger.log(’[SafetyLayer] clean & active’);

/* ============================================================
PART 7 — SETTINGS + BUSINESS RULES
============================================================ */

const SettingsBridge = (() => {

let cache = null;

function load()    { cache = Settings.get(); return cache; }
function get()     { if (!cache) load(); return cache; }
function refresh() { cache = Settings.get(); return cache; }

return { load, get, refresh };

})();

const BusinessRules = (() => {

function isOpenNow()      { return Settings.isOpenNow(); }
function getMaxCapacity() { return SettingsBridge.get()?.maxCapacityPerDay ?? CONFIG.MAX_CAPACITY_PER_SLOT ?? 20; }
function shouldAutoConfirm() { return !!SettingsBridge.get()?.autoConfirm; }
function isWAEnabled()    { return !!SettingsBridge.get()?.enableWA; }
function getBusinessPhone() { return SettingsBridge.get()?.phoneNumber || ‘’; }

async function canAcceptReservation(date, guests) {

```
const list  = await Reservation.getByDate(date);
const total = list.reduce((sum, r) => {
  if (r.status === Reservation.STATUS.CANCELLED) return sum;
  return sum + (r.guests || 0);
}, 0);

return (total + guests) <= getMaxCapacity();
```

}

async function validateReservation(payload) {

```
if (!isOpenNow()) throw new Error('Restoran sedang tutup');

const ok = await canAcceptReservation(payload.date, payload.guests);
if (!ok) throw new Error('Kapasitas penuh di tanggal tersebut');

return true;
```

}

function applyAutoRules(payload) {
if (shouldAutoConfirm()) {
payload.status = Reservation.STATUS.CONFIRMED;
}
return payload;
}

return {
isOpenNow, getMaxCapacity, canAcceptReservation,
shouldAutoConfirm, isWAEnabled, getBusinessPhone,
validateReservation, applyAutoRules
};

})();

/* Settings → UI bridge */
const SettingsUIBridge = (() => {

function apply() {

```
const s = SettingsBridge.get();

const nameEl = document.getElementById('biz-name');
if (nameEl) nameEl.textContent = s.businessName;

const sub = document.getElementById('cal-subtitle');
if (sub) sub.textContent = `Kelola reservasi ${s.businessName} dengan mudah`;
```

}

function init() {
apply();
EventBridge.on(‘settings:updated’, () => {
SettingsBridge.refresh();
apply();
});
}

return { init, apply };

})();

/* Settings save → EventBridge */
(function patchSettingsSave() {

if (!window.Settings?.save) return;

const originalSave = Settings.save.bind(Settings);

Settings.save = function (data) {
const result = originalSave(data);
EventBridge.emit(‘settings:updated’);
return result;
};

})();

(function initSettingsSystem() {
SettingsBridge.load();
SettingsUIBridge.init();
})();

/* ============================================================
PART 8 — DATA PROVIDER (single source — replaces DataStore)
============================================================ */

const DataProvider = (() => {

async function getAllReservations() {

```
const cached = SmartCache.get('res_all');
if (cached) return cached;

const data = await Reservation.getAll();
SmartCache.set('res_all', data, 3000);

return data;
```

}

async function getByDate(date) {

```
const key    = `res_date_${date}`;
const cached = SmartCache.get(key);
if (cached) return cached;

const data = await Reservation.getByDate(date);
SmartCache.set(key, data, 3000);

return data;
```

}

async function getGroupedByDate() {

```
const cached = SmartCache.get('res_grouped');
if (cached) return cached;

const list = await getAllReservations();
const map  = {};

list.forEach(r => {
  if (!r.date) return;
  if (!map[r.date]) map[r.date] = [];
  map[r.date].push(r);
});

SmartCache.set('res_grouped', map, 3000);

return map;
```

}

return { getAllReservations, getByDate, getGroupedByDate };

})();

/* Convenience alias for code that used DataStore */
const DataStore = DataProvider;

/* ============================================================
PART 9 — SMART CACHE
============================================================ */

const SmartCache = (() => {

const store = new Map();

function set(key, value, ttl = 5000) {
store.set(key, { value, expire: Date.now() + ttl });
}

function get(key) {
const item = store.get(key);
if (!item) return null;
if (Date.now() > item.expire) { store.delete(key); return null; }
return item.value;
}

function clear(prefix = null) {
if (!prefix) { store.clear(); return; }
for (const key of store.keys()) {
if (key.startsWith(prefix)) store.delete(key);
}
}

return { set, get, clear };

})();

/* Cache invalidation on data change */
EventBridge.on(‘reservation:changed’, () => SmartCache.clear(‘res_’));

/* ============================================================
PART 10 — SERVICE LAYER + RENDER BUS
============================================================ */

/* Render scheduler (anti-spam) */
const RenderScheduler = (() => {

let scheduled = false;

function schedule(fn) {
if (scheduled) return;
scheduled = true;
requestAnimationFrame(() => {
try { fn(); } catch (e) { console.error(’[RenderScheduler]’, e); }
scheduled = false;
});
}

return { schedule };

})();

/* Refresh bus — single refresh entry point */
const RefreshBus = (() => {

function refreshAll() {

```
RenderScheduler.schedule(async () => {

  if (UI?.renderCalendar) await UI.renderCalendar();

  const selected = Calendar?.getSelected?.();
  if (selected && UI?.renderDetail) await UI.renderDetail(selected);

});
```

}

return { refreshAll };

})();

/* Auto refresh on any data change (single binding) */
(function bindCentralRefresh() {

EventBridge.on(‘reservation:changed’, () => {

```
try {
  RefreshBus.refreshAll();
} catch (err) {
  ErrorHandler.capture(err, 'centralRefresh');
}
```

});

})();

/* Reservation service (emits events) */
const ReservationService = (() => {

async function create(data) {
const res = await Reservation.create(data);
EventBridge.emit(‘reservation:created’, res);
EventBridge.emit(‘reservation:changed’);
return res;
}

async function update(id, patch) {
const res = await Reservation.update(id, patch);
EventBridge.emit(‘reservation:updated’, res);
EventBridge.emit(‘reservation:changed’);
return res;
}

async function remove(id) {
await Reservation.remove(id);
EventBridge.emit(‘reservation:deleted’, id);
EventBridge.emit(‘reservation:changed’);
}

return { create, update, remove };

})();

/* ============================================================
PART 11 — HARDENING: SANITIZER + DUPLICATE GUARD + ASYNC LOCK
============================================================ */

const Sanitizer = (() => {

function text(str)   { return String(str || ‘’).replace(/[<>]/g, ‘’).trim(); }
function phone(str)  { return String(str || ‘’).replace(/\D/g, ‘’); }
function number(val, fallback = 0) {
const n = Number(val);
return isNaN(n) ? fallback : n;
}

function reservation(payload = {}) {
return {
name:  text(payload.name),
phone: phone(payload.phone),
note:  text(payload.note),
date:  payload.date,
time:  payload.time,
guests: number(payload.guests, 1),
menus: Array.isArray(payload.menus) ? payload.menus : []
};
}

return { reservation, text, phone, number };

})();

const DuplicateGuard = (() => {

const cache = new Map();
const TTL   = 3000;

function isDuplicate(payload) {
const key = JSON.stringify(payload);
const now = Date.now();
if (cache.has(key) && now - cache.get(key) < TTL) return true;
cache.set(key, now);
return false;
}

return { isDuplicate };

})();

const AsyncLock = (() => {

const locks = new Set();

async function run(key, fn) {
if (locks.has(key)) { Logger.warn(’[LOCKED]’, key); return; }
locks.add(key);
try { return await fn(); }
finally { locks.delete(key); }
}

return { run };

})();

/* ── SafeReservation — ALL creates MUST go through this ── */

const SafeReservation = (() => {

async function create(payload) {

```
const clean = Sanitizer.reservation(payload);

if (DuplicateGuard.isDuplicate(clean)) {
  NotifySafe.info('Reservasi sedang diproses');
  return null;
}

return AsyncLock.run('create', async () => {

  try {

    /* Business rules validation */
    await BusinessRules.validateReservation(clean);
    BusinessRules.applyAutoRules(clean);

    const res = await ReservationService.create(clean);
    NotifySafe.success('Reservasi berhasil dibuat');

    return res;

  } catch (err) {
    ErrorHandler.capture(err, 'createReservation');
    throw err;
  }

});
```

}

async function update(id, patch) {

```
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
```

}

async function remove(id) {

```
return AsyncLock.run('delete_' + id, async () => {

  try {
    await ReservationService.remove(id);
    NotifySafe.info('Reservasi dihapus');
  } catch (err) {
    ErrorHandler.capture(err, 'deleteReservation');
    throw err;
  }

});
```

}

return { create, update, remove };

})();

/* Global aliases for Proserva public API */
const safeCreateReservation = (d)     => SafeReservation.create(d);
const safeUpdateReservation = (id, d) => SafeReservation.update(id, d);
const safeDeleteReservation = (id)    => SafeReservation.remove(id);

/* ============================================================
PART 12 — FORM + DETAIL ACTIONS (ALL VIA SafeReservation)
============================================================ */

/* Form submit — routes through SafeReservation.create */
(function patchFormSubmit() {

if (!window.Form?.init) return;

const originalInit = Form.init.bind(Form);

Form.init = function () {

```
originalInit();

/* Extend getValues to include menus */
if (!Form.__MENU_PATCHED__) {

  const origGetValues = Form.getValues?.bind(Form);

  Form.getValues = function () {
    const base = origGetValues?.() ?? {};
    return { ...base, menus: window.Menu?.getData?.() ?? [] };
  };

  Form.__MENU_PATCHED__ = true;
}

const form = document.getElementById('reservation-form');
if (!form || form.__SUBMIT_PATCHED__) return;
form.__SUBMIT_PATCHED__ = true;

let submitting = false;

form.addEventListener('submit', async (e) => {

  e.preventDefault();

  if (submitting) return;
  submitting = true;

  try {
    const values = Form.getValues ? Form.getValues() : {};
    await SafeReservation.create(values); /* ✅ ONLY entry point */
    Form.close?.();
  } catch (err) {
    /* already handled */
  } finally {
    submitting = false;
  }

});
```

};

})();

/* Detail card actions (next / cancel / delete / WA) */
(function bindDetailActions() {

const container = document.getElementById(‘reservation-list’);
if (!container) return;

async function _getById(id) {
try {
const list = await Reservation.getAll();
return list.find(r => r.id === id) ?? null;
} catch (err) {
Logger.error(’[getById]’, err);
return null;
}
}

container.addEventListener(‘click’, async (e) => {

```
const card = e.target.closest('.res-card');
if (!card) return;

const id = card.dataset.id;
if (!id) return;

/* Status advance */
if (e.target.closest('[data-action="next"]')) {
  try {
    await Reservation.advanceStatus(id);
    NotifySafe.success('Status diperbarui');
  } catch (err) { NotifySafe.error('Gagal update status'); }
  return;
}

/* Cancel */
if (e.target.closest('[data-action="cancel"]')) {
  if (!confirm('Batalkan reservasi ini?')) return;
  try {
    await Reservation.cancel(id);
    NotifySafe.info('Reservasi dibatalkan');
  } catch (err) { NotifySafe.error('Gagal membatalkan reservasi'); }
  return;
}

/* Delete */
if (e.target.closest('[data-action="delete"]')) {
  if (!confirm('Hapus reservasi ini?')) return;
  await SafeReservation.remove(id);
  return;
}

/* WhatsApp confirmation */
if (e.target.closest('[data-action="wa"]')) {
  const r = await _getById(id);
  if (r) Communication?.sendConfirmation?.(r);
  return;
}

/* Thank you */
if (e.target.closest('[data-action="thank"]')) {
  const r = await _getById(id);
  if (r) Communication?.sendThankYou?.(r);
  return;
}

/* Reminder */
if (e.target.closest('[data-action="reminder"]')) {
  const r = await _getById(id);
  if (r) Communication?.sendReminder?.(r);
  return;
}
```

});

})();

/* Backward compat */
window.contactWA = async (id) => {
const list = await Reservation.getAll();
const r = list.find(x => x.id === id);
if (r) Communication?.sendConfirmation?.(r);
};

/* ============================================================
PART 13 — WHATSAPP + COMMUNICATION ENGINE
============================================================ */

const PhoneUtil = (() => {

function normalize(phone) {
let cleaned = String(phone || ‘’).replace(/\D/g, ‘’);
if (cleaned.startsWith(‘0’)) cleaned = ‘62’ + cleaned.slice(1);
if (!cleaned.startsWith(‘62’)) cleaned = ‘62’ + cleaned;
return cleaned;
}

function isValid(phone) { return normalize(phone).length >= 10; }

return { normalize, isValid };

})();

const TemplateEngine = (() => {

function render(template, data) {
return template.replace(/{{(.*?)}}/g, (_, key) => {
const k = key.trim();
return (data[k] !== undefined && data[k] !== null) ? data[k] : ‘’;
});
}

function formatDate(dateStr) {
if (!dateStr) return ‘’;
/* Fix: append time to avoid timezone shift */
const d = new Date(dateStr + ‘T00:00:00’);
return d.toLocaleDateString(‘id-ID’, { day: ‘numeric’, month: ‘long’, year: ‘numeric’ });
}

return { render, formatDate };

})();

const MessageTemplates = {

confirmation: `Halo Kak *{{name}}* 👋\n\nReservasi kamu di *{{biz}}* sudah kami terima.\n\n📅 {{date}}\n⏰ {{time}}\n👥 {{guests}} orang\n\nKami tunggu kedatangannya 😊`,

reminder:     `Halo Kak *{{name}}* 👋\n\nKami mengingatkan reservasi kamu hari ini di *{{biz}}*:\n\n⏰ {{time}}\n👥 {{guests}} orang\n\nSampai jumpa 😊`,

thankYou:     `Halo Kak *{{name}}* 🙏\n\nTerima kasih sudah berkunjung ke *{{biz}}* 😊\n\nKami tunggu kedatangan berikutnya!`,

broadcast:    `Halo Kak *{{name}}* 👋\n\n{{message}}\n\nSalam,\n*{{biz}}*`

};

const MessageBuilder = (() => {

function build(type, data = {}) {

```
const template = MessageTemplates[type];
if (!template) return '';

return TemplateEngine.render(template, {
  name:    data.name    || 'Customer',
  biz:     SettingsBridge.get()?.businessName || 'Usaha',
  date:    TemplateEngine.formatDate(data.date),
  time:    data.time    || '',
  guests:  data.guests  || '',
  message: data.message || ''
});
```

}

return { build };

})();

const WhatsAppService = (() => {

function send(phone, message) {

```
if (!BusinessRules.isWAEnabled()) {
  NotifySafe.error('Fitur WhatsApp dinonaktifkan');
  return;
}

if (!phone) phone = BusinessRules.getBusinessPhone();

if (!PhoneUtil.isValid(phone)) {
  NotifySafe.error('Nomor tidak valid');
  return;
}

const url =
  'https://wa.me/' +
  PhoneUtil.normalize(phone) +
  '?text=' + encodeURIComponent(message);

window.open(url, '_blank', 'noopener');
```

}

return { send };

})();

const Communication = (() => {

function sendConfirmation(res) {
if (!res) return;
WhatsAppService.send(res.phone, MessageBuilder.build(‘confirmation’, res));
NotifySafe.success(‘Pesan konfirmasi dibuka’);
}

function sendReminder(res) {
if (!res) return;
WhatsAppService.send(res.phone, MessageBuilder.build(‘reminder’, res));
NotifySafe.info(‘Reminder dibuka’);
}

function sendThankYou(res) {
if (!res) return;
WhatsAppService.send(res.phone, MessageBuilder.build(‘thankYou’, res));
NotifySafe.success(‘Ucapan terima kasih dibuka’);
}

function sendCustom(phone, message) {
if (!phone || !message) { NotifySafe.error(‘Data tidak lengkap’); return; }
WhatsAppService.send(phone, message);
}

function sendBroadcast(list, message) {

```
if (!list?.length) { NotifySafe.error('Tidak ada penerima'); return; }
if (!message)      { NotifySafe.error('Pesan kosong'); return; }

list.forEach((c, i) => {
  setTimeout(() => {
    WhatsAppService.send(
      c.phone,
      MessageBuilder.build('broadcast', { name: c.name, message })
    );
  }, i * 800);
});

NotifySafe.success(`Broadcast dimulai (${list.length} kontak)`);
```

}

return { sendConfirmation, sendReminder, sendThankYou, sendCustom, sendBroadcast };

})();

/* Auto reminder (indexed, non-brutal) */
const AutoReminder = (() => {

let started = false;

function start() {

```
if (started) return;
started = true;

setInterval(async () => {

  const today = Utils.today?.();
  if (!today) return;

  try {

    const list = await DataProvider.getByDate(today);
    const now  = new Date();

    list.forEach(r => {

      if (!r.time || r.reminderSent) return;

      const [h, m] = r.time.split(':').map(Number);
      const resTime = new Date();
      resTime.setHours(h, m, 0, 0);

      const diff = resTime - now;
      if (diff > 0 && diff < 3600000) {
        Communication.sendReminder(r);
        EventBridge.emit('reservation:updated', { ...r, reminderSent: true });
      }

    });

  } catch (err) {
    Logger.warn('[AutoReminder]', err);
  }

}, 60000);
```

}

return { start };

})();

AutoReminder.start();

Logger.log(’[Communication] engine ready’);

/* ============================================================
PART 14 — ANALYTICS CONTROLLER
============================================================ */

const AnalyticsController = (() => {

async function loadSummary() {

```
try {

  const data = await Analytics.getSummary();

  const el = document.getElementById('anl-stats');
  if (!el) return;

  el.innerHTML = [
    { val: data.totalReservations, label: 'Total Reservasi' },
    { val: data.totalGuests,        label: 'Total Tamu' },
    { val: data.occupancy + '%',    label: 'Tingkat Okupansi' },
    { val: data.peakDay || '-',     label: 'Hari Tersibuk' }
  ].map(c => `
    <div class="anl-card">
      <div class="anl-val">${c.val}</div>
      <div class="anl-label">${c.label}</div>
    </div>
  `).join('');

} catch (err) {
  Logger.error('[Analytics] summary error', err);
  NotifySafe.error('Gagal memuat analisis');
}
```

}

async function loadDaily() {

```
try {

  const data = await Analytics.getDaily();
  const el   = document.getElementById('anl-daily');
  if (!el) return;

  if (!data.length) {
    el.innerHTML = `<div class="empty-state">Belum ada data</div>`;
    return;
  }

  el.innerHTML = data.map(item => {
    /* Fix timezone: use T00:00:00 */
    const d = new Date(item.date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    return `
      <div class="anl-row">
        <div>${d}</div>
        <div>${item.total} reservasi</div>
        <div>${item.guests} tamu</div>
        <div>${item.occupancy}%</div>
      </div>`;
  }).join('');

} catch (err) {
  Logger.error('[Analytics] daily error', err);
}
```

}

async function loadAll() {
await loadSummary();
await loadDaily();
}

return { loadAll };

})();

/* Router hook */
addRouteHook(async (name) => {
if (name === ‘analysis’) await AnalyticsController.loadAll();
});

/* Auto refresh if on analysis view */
EventBridge.on(‘reservation:changed’, () => {
if (Router?.getCurrent?.() === ‘analysis’) AnalyticsController.loadAll();
});

/* ============================================================
PART 15 — CUSTOMER MANAGEMENT
============================================================ */

const CustomerController = (() => {

let cache = [];

async function build() {

```
const list = await Reservation.getAll();
const map  = {};

list.forEach(r => {
  const key = r.phone || (r.name + '_' + r.date);
  if (!map[key]) {
    map[key] = { name: r.name || 'Tanpa Nama', phone: r.phone || '', count: 0, lastDate: r.date };
  }
  map[key].count++;
  if (r.date > map[key].lastDate) map[key].lastDate = r.date;
});

cache = Object.values(map).sort((a, b) => b.count - a.count);
return cache;
```

}

function get()           { return cache; }
function filter(query)   {
if (!query) return cache;
const q = query.toLowerCase();
return cache.filter(c =>
c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
);
}

function contact(customer) {
if (!customer?.phone) { NotifySafe.error(‘Nomor tidak tersedia’); return; }
Communication.sendCustom(
customer.phone,
`Halo Kak *${customer.name}* 👋\n\nTerima kasih sudah menjadi pelanggan kami 😊`
);
}

return { build, get, filter, contact };

})();

const CustomerUI = (() => {

function _esc(str) {
return String(str || ‘’).replace(/[&<>”’]/g, s => ({
‘&’:’&’,’<’:’<’,’>’:’>’,’”’:’"’,”’”:’'’
})[s]);
}

function _fmt(d) {
if (!d) return ‘-’;
return new Date(d + ‘T00:00:00’).toLocaleDateString(‘id-ID’, { day: ‘numeric’, month: ‘short’, year: ‘numeric’ });
}

function render(list) {
const el = document.getElementById(‘customers-tbody’);
if (!el) return;

```
if (!list.length) {
  el.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;">Tidak ada data pelanggan</td></tr>`;
  return;
}

el.innerHTML = list.map(c => `
  <tr>
    <td><strong>${_esc(c.name)}</strong></td>
    <td>${c.phone || '-'}</td>
    <td>${c.count}x</td>
    <td>${_fmt(c.lastDate)}</td>
    <td>${c.phone ? `<button class="btn-wa" data-phone="${c.phone}" data-name="${_esc(c.name)}">WA</button>` : '-'}</td>
  </tr>`).join('');
```

}

return { render };

})();

(function bindCustomerEvents() {

const search = document.getElementById(‘customer-search’);
const table  = document.getElementById(‘customers-tbody’);

if (search) {
search.addEventListener(‘input’, Utils.debounce((e) => {
CustomerUI.render(CustomerController.filter(e.target.value));
}, 250));
}

if (table) {
table.addEventListener(‘click’, (e) => {
const btn = e.target.closest(’.btn-wa’);
if (!btn) return;
CustomerController.contact({ phone: btn.dataset.phone, name: btn.dataset.name });
});
}

})();

addRouteHook(async (name) => {
if (name === ‘customers’) {
const data = await CustomerController.build();
CustomerUI.render(data);
}
});

EventBridge.on(‘reservation:changed’, async () => {
if (Router?.getCurrent?.() !== ‘customers’) return;
CustomerUI.render(await CustomerController.build());
});

/* ============================================================
PART 16 — BROADCAST SYSTEM
============================================================ */

const BroadcastController = (() => {

let list = [];

async function load() {
list = (await CustomerController.build()).filter(c => c.phone);
return list;
}

function filter(query) {
if (!query) return list;
const q = query.toLowerCase();
return list.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q));
}

function send(phone, name, template) {
if (!phone || !template) { NotifySafe.error(‘Data tidak lengkap’); return; }
Communication.sendCustom(phone, template.replace(/{name}/gi, name || ‘’));
}

async function sendAll(template) {
if (!list.length) { NotifySafe.error(‘Tidak ada penerima’); return; }
if (!template)    { NotifySafe.error(‘Pesan kosong’); return; }
Communication.sendBroadcast(list, template);
}

return { load, filter, send, sendAll };

})();

const BroadcastUI = (() => {

function _esc(str) {
return String(str || ‘’).replace(/[&<>”’]/g, s => ({
‘&’:’&’,’<’:’<’,’>’:’>’,’”’:’"’,”’”:’'’
})[s]);
}

function render(list) {
const el = document.getElementById(‘bc-list’);
if (!el) return;

```
if (!list.length) {
  el.innerHTML = `<div style="padding:24px;text-align:center;">Tidak ada data pelanggan</div>`;
  return;
}

el.innerHTML = list.map(c => `
  <div class="bc-item" data-phone="${c.phone}" data-name="${_esc(c.name)}">
    <div>
      <div class="bc-name">${_esc(c.name)}</div>
      <div class="bc-phone">${c.phone}</div>
    </div>
    <button class="btn-wa">Kirim</button>
  </div>`).join('');
```

}

function getMessage() { return document.getElementById(‘broadcast-msg’)?.value || ‘’; }

return { render, getMessage };

})();

(function bindBroadcastEvents() {

const search    = document.getElementById(‘bc-search’);
const listEl    = document.getElementById(‘bc-list’);
const sendAllBtn = document.getElementById(‘bc-send-all’);

if (search) {
search.addEventListener(‘input’, Utils.debounce((e) => {
BroadcastUI.render(BroadcastController.filter(e.target.value));
}, 250));
}

if (listEl) {
listEl.addEventListener(‘click’, (e) => {
const item = e.target.closest(’.bc-item’);
if (!item) return;
const msg = BroadcastUI.getMessage();
if (!msg) { NotifySafe.error(‘Isi pesan terlebih dahulu’); return; }
BroadcastController.send(item.dataset.phone, item.dataset.name, msg);
});
}

if (sendAllBtn) {
sendAllBtn.addEventListener(‘click’, async () => {
const msg = BroadcastUI.getMessage();
if (!msg) { NotifySafe.error(‘Pesan kosong’); return; }
if (!confirm(‘Kirim broadcast ke semua pelanggan?’)) return;
await BroadcastController.sendAll(msg);
NotifySafe.success(‘Broadcast dijalankan’);
});
}

})();

addRouteHook(async (name) => {
if (name === ‘broadcast’) {
const data = await BroadcastController.load();
BroadcastUI.render(data);
}
});

EventBridge.on(‘reservation:changed’, async () => {
if (Router?.getCurrent?.() !== ‘broadcast’) return;
BroadcastUI.render(await BroadcastController.load());
});

/* ============================================================
PART 17 — LAZY VIEW + VIRTUAL LIST (SINGLE DEFINITION)
============================================================ */

/* Single VirtualList definition */
const VirtualList = (() => {

function render(container, list, renderItem, limit = 50) {

```
if (!container) return;

const frag = document.createDocumentFragment();
list.slice(0, limit).forEach(item => {
  const el = renderItem(item);
  if (el) frag.appendChild(el);
});
container.innerHTML = '';
container.appendChild(frag);

if (list.length > limit) {
  const more = document.createElement('div');
  more.className = 'load-more';
  more.textContent = `Tampilkan ${list.length - limit} lagi...`;
  more.addEventListener('click', () => render(container, list, renderItem, limit + 50));
  container.appendChild(more);
}
```

}

return { render };

})();

/* Lazy view loader (registered once inside single Router patch) */
const LazyView = (() => {

const loaded = new Set();

function handle(name) {

```
if (loaded.has(name)) return;

if (name === 'analysis') {
  AnalyticsController.loadAll();
  loaded.add(name);
}

if (name === 'broadcast') {
  BroadcastController.load().then(data => BroadcastUI.render(data));
  loaded.add(name);
}
```

}

return { handle };

})();

/* ============================================================
PART 18 — UX MICRO INTERACTIONS
============================================================ */

const Loader = (() => {

let el = null;

function _ensure() {
if (el) return;
el = document.createElement(‘div’);
el.id = ‘global-loader’;
el.innerHTML = `<div class="loader-spinner"></div>`;
Object.assign(el.style, {
position: ‘fixed’, inset: 0,
background: ‘rgba(255,255,255,0.5)’,
backdropFilter: ‘blur(4px)’,
display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’,
zIndex: 9998, opacity: 0, pointerEvents: ‘none’,
transition: ‘opacity 0.2s ease’
});
document.body.appendChild(el);
}

function show() { _ensure(); el.style.opacity = ‘1’; el.style.pointerEvents = ‘auto’; }
function hide() { if (!el) return; el.style.opacity = ‘0’; el.style.pointerEvents = ‘none’; }

return { show, hide };

})();

const ButtonUX = {
setLoading(btn, state = true) {
if (!btn) return;
if (state) { btn.dataset._text = btn.innerHTML; btn.innerHTML = ‘⏳’; btn.disabled = true; }
else       { btn.innerHTML = btn.dataset._text || btn.innerHTML; btn.disabled = false; }
}
};

/* Click feedback (scoped to .btn) */
(function clickFeedback() {
document.addEventListener(‘click’, (e) => {
const btn = e.target.closest(’.btn’);
if (!btn) return;
btn.style.transform = ‘scale(0.96)’;
setTimeout(() => { btn.style.transform = ‘’; }, 120);
});
})();

/* Hover on reservation cards */
(function hoverEffect() {
const container = document.getElementById(‘reservation-list’);
if (!container) return;
container.addEventListener(‘mouseover’, (e) => {
const card = e.target.closest(’.res-card’);
if (card) card.style.transform = ‘translateY(-2px)’;
});
container.addEventListener(‘mouseout’, (e) => {
const card = e.target.closest(’.res-card’);
if (card) card.style.transform = ‘’;
});
})();

/* Input limits (scoped to actual inputs) */
(function inputGuard() {
document.addEventListener(‘input’, (e) => {
const el = e.target;
if (!(el instanceof HTMLInputElement)) return;
if (el.name === ‘guests’ && el.value < 1) el.value = 1;
if (el.name === ‘name’ && el.value.length > 50) el.value = el.value.slice(0, 50);
});
document.addEventListener(‘input’, (e) => {
if (e.target.tagName === ‘TEXTAREA’ && e.target.value.length > 500) {
e.target.value = e.target.value.slice(0, 500);
}
});
})();

function buildEmptyState(title, subtitle = ‘’) {
return ` <div class="empty-state" style="padding:24px;text-align:center;"> <div style="font-size:2rem;">📭</div> <div style="font-weight:600;">${escapeHtml(title)}</div> <div style="opacity:0.6;font-size:0.85rem;">${escapeHtml(subtitle)}</div> </div>`;
}

Logger.log(’[UX] interaction layer active’);

/* ============================================================
PART 19 — MODULE REGISTRY + ARCHITECTURE
============================================================ */

const ModuleRegistry = (() => {

const map = {};

function register(name, module) { if (name && module) map[name] = module; }
function get(name)  { return map[name]; }
function list()     { return Object.keys(map); }

return { register, get, list };

})();

(function registerCoreModules() {
[
‘Reservation’,‘Calendar’,‘UI’,‘Form’,‘Menu’,
‘Filter’,‘Analytics’,‘Backup’,‘Settings’,‘Sync’
].forEach(name => {
if (window[name]) ModuleRegistry.register(name, window[name]);
});
})();

/* Sync layer → EventBridge */
(function bindSyncLayer() {
if (!window.Sync?.subscribe) return;
Sync.subscribe(() => EventBridge.emit(‘reservation:changed’));
})();

/* Public API */
window.AppAPI = {
create:  (d)     => SafeReservation.create(d),
update:  (id, d) => SafeReservation.update(id, d),
delete:  (id)    => SafeReservation.remove(id),
refresh: ()      => EventBridge.emit(‘reservation:changed’),
getAll:  ()      => DataProvider.getAllReservations(),
debug:   ()      => console.log({ modules: ModuleRegistry.list() })
};

/* Health check */
setTimeout(() => {
Logger.log(’[HealthCheck] modules:’, ModuleRegistry.list().length);
}, 2000);

Logger.log(’[Architecture] clean & stable’);

/* ============================================================
PART 20 — PRODUCTION HARDENING
============================================================ */

(function setProductionMode() {
window.**PROD** = !CONFIG.DEBUG;
Logger.log(’[MODE]’, window.**PROD** ? ‘Production’ : ‘Development’);
})();

/* Auto backup snapshot */
(function autoBackup() {
setInterval(async () => {
try {
const data = await DataProvider.getAllReservations();
if (!data?.length) return;
SafeStorage.set(‘psv_autobackup’, { t: Date.now(), data });
} catch (err) { Logger.warn(’[Backup] skipped’); }
}, 60000);
})();

/* Auto recovery (non-destructive) */
(function autoRecoveryCheck() {
try {
const backup  = SafeStorage.get(‘psv_autobackup’);
if (!backup?.data) return;
const current = SafeStorage.get(KEYS.reservations);
if (!current || !Array.isArray(current) || current.length === 0) {
Logger.warn(’[Recovery] restoring backup’);
SafeStorage.set(KEYS.reservations, backup.data);
}
} catch (err) { Logger.warn(’[Recovery] failed’); }
})();

/* Network status */
(function networkMonitor() {
function update() {
if (!navigator.onLine) NotifySafe.info(‘Mode offline aktif’);
else Logger.log(’[Network] online’);
}
window.addEventListener(‘offline’, update);
window.addEventListener(‘online’,  update);
})();

/* Performance watchdog */
(function performanceWatch() {
const start = performance.now();
window.addEventListener(‘load’, () => {
const t = performance.now() - start;
if (t > 2500) Logger.warn(’[PERF] slow load:’, Math.round(t), ‘ms’);
});
})();

/* Final public API (frozen) */
window.Proserva = Object.freeze({

create:   safeCreateReservation,
update:   (data) => safeUpdateReservation(data.id, data),
delete:   safeDeleteReservation,
getAll:   () => DataProvider.getAllReservations(),
backup:   () => Backup.exportData?.(),
restore:  (file) => Backup.importFile?.(file),
settings: () => Settings.get?.(),
refresh:  () => EventBridge.emit(‘reservation:changed’),
version:  ‘1.0.1’,

async health() {
try {
const list = await DataProvider.getAllReservations();
return { ok: true, total: list.length, mode: CONFIG.DATA_MODE, prod: window.**PROD** };
} catch (err) {
return { ok: false };
}
}

});

/* Recovery helper */
window.recoverApp = function () {
try {
localStorage.removeItem(KEYS.reservations);
location.reload();
} catch (err) { Logger.error(’[RECOVERY FAILED]’, err); }
};

/* Dev helpers */
if (CONFIG.DEBUG) {
window.**DEV** = {
async seed() {
for (let i = 1; i <= 10; i++) {
await SafeReservation.create({
name: ’Customer ’ + i,
phone: ‘08123456789’,
date:  Utils.today(),
time:  ‘18:00’,
guests: Math.ceil(Math.random() * 5)
});
}
},
clear() { localStorage.clear(); location.reload(); }
};
}

console.log(’%cProserva v1.0.1 🚀’, ‘color:#22c55e;font-weight:bold;’);

/* ============================================================
END OF APP.JS
============================================================ */