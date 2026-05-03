‘use strict’;

/* ============================================================
APP.JS — PROSERVA v1.2.1 (PATCHED)

FIXES APPLIED FROM AUDIT v1.2.0:
🔴 CRITICAL:
F1. escapeHtml didefinisikan di awal — mencegah ReferenceError di seluruh module
F2. patchCalendarRender menggunakan Calendar.getYear/getMonth (bukan selected date)
→ tanggal cell kalender kini benar
F3. bindCalendarClicks dipindah setelah render patch aktif
→ cell.dataset.date selalu ada saat klik
F4. Menu builder mencari #menu-builder (bukan #menu-container yang tidak ada)
F5. Form submit handler dikonsolidasi — hanya satu handler via UI Bridge
→ tidak ada double-submit conflict

🟡 STRUCTURAL:
F6. NotifSystem → Notify (nama module yang benar) di UI Bridge notif dropdown
F7. Boot sequence diperbaiki: Router.go() tidak double-render dengan UI.init()
F8. Detail view bisa diakses via DateController.select() saat klik tanggal

Semua fix dari v1.2.0 tetap dipertahankan.
============================================================ */

/* ============================================================
PART 0 — UTILITY: escapeHtml (FIX F1)
Didefinisikan PERTAMA sebelum semua module lain memakainya.
Mencegah ReferenceError runtime di _renderToast, CustomerUI,
buildEmptyState, dan semua tempat lain yang memanggil escapeHtml().
============================================================ */

function escapeHtml(str) {
return String(str == null ? ‘’ : str)
.replace(/&/g, ‘&’)
.replace(/</g, ‘<’)
.replace(/>/g, ‘>’)
.replace(/”/g, ‘"’)
.replace(/’/g, ‘'’);
}

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

  _validateModules();
  _syncSettingsToConfig();

  /* P1: Load remote feature flags sebelum inisialisasi lainnya */
  await FeatureFlags.loadRemote();

  Sync.init?.();
  Settings.init?.();
  UI.init?.();
  Form.init?.();
  Menu.init?.();
  Filter.init?.();
  Backup.init?.();

  _patchRouter();
  _bindGlobalEvents();

  /* F7: UI.init() sudah memanggil renderCalendar() secara internal.
     Kita tidak perlu emit reservation:changed di sini lagi karena
     itu akan memicu double-render. Router.go() saja sudah cukup
     untuk set view yang benar. reservation:changed hanya diemit
     jika ada perubahan data nyata. */
  const lastView = localStorage.getItem('psv_last_view') || 'calendar';
  await Router.go(lastView);

  EventBridge.emit('app:ready');

  Logger.log('[App] initialized successfully');

} catch (err) {
  Logger.error('[App] init error:', err);
  NotifySafe.error('Gagal memulai aplikasi');
}
```

}

function _validateModules() {
const required = [
‘Reservation’, ‘Calendar’, ‘UI’,
‘Form’, ‘Settings’, ‘Sync’
];
required.forEach(name => {
if (!window[name]) throw new Error(`[MODULE MISSING] ${name}`);
});
}

function _syncSettingsToConfig() {
try {
const s = Settings.get?.();
if (s?.maxCapacityPerDay) {
CONFIG.MAX_CAPACITY_PER_SLOT = s.maxCapacityPerDay;
}
} catch (err) {
Logger.warn(’[Settings Sync Failed]’);
}
}

function _patchRouter() {
if (!window.Router || !Router.go) return;
if (Router.**PATCHED**) return;

```
const original = Router.go.bind(Router);

/* C4: Navigation lock — cegah race condition klik cepat */
let navigating = false;

Router.go = async function (name) {
  if (navigating) {
    Logger.warn('[Router] navigation blocked — already navigating');
    return;
  }
  navigating = true;
  try {
    await original(name);
    localStorage.setItem('psv_last_view', name);
    EventBridge.emit('router:changed', name);
    for (const fn of RouterHooks) {
      try { await fn(name); } catch (e) { Logger.error('[RouterHook]', e); }
    }
    LazyView.handle(name);
  } catch (err) {
    ErrorHandler.capture(err, 'Router.go');
  } finally {
    navigating = false;
  }
};

Router.__PATCHED__ = true;
Logger.log('[Router] single patch active — navigation lock + router:changed');
```

}

function _bindGlobalEvents() {
document.addEventListener(‘keydown’, (e) => {
if (e.key === ‘Escape’) Form?.close?.();
});

```
window.addEventListener('focus', () => {
  RenderScheduler.schedule(() => UI.renderCalendar?.());
});
```

}

return { init };

})();

/* DOM ready boot */
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
if (!VIEWS.includes(name)) {
Logger.warn(’[Router] unknown view:’, name);
return;
}
if (currentView === name) return;
currentView = name;

```
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
const el = document.getElementById(‘page-title’);
if (!el) return;
const map = {
calendar: ‘Kalender’,    detail: ‘Detail Reservasi’,
menus: ‘Menu’,           locations: ‘Lokasi’,
customers: ‘Pelanggan’,  analysis: ‘Analisis’,
broadcast: ‘Broadcast’,  settings: ‘Pengaturan’
};
el.textContent = map[name] || ‘’;
}

function _closeSidebarIfOpen() {
const sidebar = document.getElementById(‘sidebar’);
const overlay = document.getElementById(‘sidebar-overlay’);
if (sidebar?.classList.contains(‘open’)) {
sidebar.classList.remove(‘open’);
overlay?.classList.remove(‘show’);
}
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

window.goView = (name) => Router.go(name);

/* ============================================================
PART 3 — CALENDAR ↔ DETAIL BRIDGE
============================================================ */

const DateController = (() => {

async function select(dateStr) {
if (!dateStr) return;
Logger.log(’[DateController] select →’, dateStr);
Calendar.select(dateStr);
_updateDetailHeader(dateStr);
await Router.go(‘detail’);
}

async function back() {
Logger.log(’[DateController] back to calendar’);
await Router.go(‘calendar’);
}

function _updateDetailHeader(dateStr) {
const el = document.getElementById(‘detail-title’);
if (!el) return;
const parts = dateStr.split(’-’);
if (parts.length !== 3) { el.textContent = dateStr; return; }
const months = [
‘Januari’,‘Februari’,‘Maret’,‘April’,‘Mei’,‘Juni’,
‘Juli’,‘Agustus’,‘September’,‘Oktober’,‘November’,‘Desember’
];
const y = parseInt(parts[0], 10);
const m = parseInt(parts[1], 10) - 1;
const d = parseInt(parts[2], 10);
el.textContent = `${d} ${months[m]} ${y}`;
}

return { select, back };

})();

/* F3: bindCalendarClicks — event delegation yang benar.
Kita delegasi klik ke #calendar-grid dan baca dataset.date dari cell.
dataset.date di-set oleh patchCalendarRender (di bawah) menggunakan
tahun & bulan yang benar dari Calendar module.
Karena ini event delegation, listener ini bekerja untuk semua cell
yang di-render ulang kapan pun, termasuk setelah navigasi bulan. */
(function bindCalendarClicks() {
const grid = document.getElementById(‘calendar-grid’);
if (!grid) return;
grid.addEventListener(‘click’, (e) => {
const cell = e.target.closest(’.cal-day’);
if (!cell || cell.classList.contains(‘empty’)) return;
const dateStr = cell.dataset.date;
if (dateStr) DateController.select(dateStr);
});
})();

/* F2: patchCalendarRender — set dataset.date menggunakan tahun & bulan
dari Calendar module (bukan dari tanggal yang sedang dipilih).
Calendar.getYear() dan Calendar.getMonth() mengembalikan state
bulan yang sedang ditampilkan di grid, sehingga cell.dataset.date
selalu akurat sesuai posisi cell di kalender. */
(function patchCalendarRender() {
if (!window.UI?.renderCalendar) return;
const original = UI.renderCalendar.bind(UI);
UI.renderCalendar = async function () {
await original();

```
/* Ambil tahun & bulan yang SEDANG DITAMPILKAN di kalender,
   bukan tanggal yang dipilih user */
const year  = Calendar.getYear?.()  ?? new Date().getFullYear();
const month = Calendar.getMonth?.() ?? new Date().getMonth();   // 0-based

document.querySelectorAll('#calendar-grid .cal-day').forEach(cell => {
  if (cell.classList.contains('empty')) return;
  const numEl = cell.querySelector('.cal-day-num');
  if (!numEl) return;
  const day = parseInt(numEl.textContent, 10);
  if (!day) return;
  cell.dataset.date = Utils.formatDate(year, month, day);
});
```

};
})();

window.selectDate     = (d) => DateController.select(d);
window.backToCalendar = ()  => DateController.back();

/* ============================================================
PART 4 — EVENT BRIDGE (UNIFIED + MEMORY-SAFE)
FIX C1: on() menyimpan wrapped listener → off() bisa bekerja
Cegah memory leak akibat anonymous listener yang menumpuk
============================================================ */

const EventBridge = (() => {

/* Map dari original handler → wrapped listener per event name */
const listenerMap = new Map();

function emit(name, payload) {
window.Events?.emit?.(name, payload);
document.dispatchEvent(new CustomEvent(name, { detail: payload }));
}

function on(name, handler) {
window.Events?.on?.(name, handler);

```
/* Buat key unik per (name + handler) */
const key = name + '::' + (handler.__eb_id__ = handler.__eb_id__ || Math.random().toString(36).slice(2));

/* Hindari duplikasi listener yang sama */
if (listenerMap.has(key)) return;

const wrapped = (e) => handler(e.detail);
listenerMap.set(key, { name, wrapped });
document.addEventListener(name, wrapped);
```

}

function off(name, handler) {
if (!handler?.**eb_id**) return;
const key = name + ‘::’ + handler.**eb_id**;
const entry = listenerMap.get(key);
if (!entry) return;
document.removeEventListener(entry.name, entry.wrapped);
listenerMap.delete(key);
}

/* Hapus semua listener untuk event name tertentu */
function offAll(name) {
for (const [key, entry] of listenerMap.entries()) {
if (entry.name === name) {
document.removeEventListener(entry.name, entry.wrapped);
listenerMap.delete(key);
}
}
}

return { emit, on, off, offAll };

})();

/* ============================================================
PART 5 — NOTIFICATION SYSTEM (NotifySafe)
============================================================ */

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
message    = ‘’,
type       = ‘info’,
duration   = 2500,
action     = null,
persistent = false
} = opts;

const container = _getToastContainer();
const toast = document.createElement(‘div’);
toast.className = `toast toast-${type}`;
toast.innerHTML = `<div class="toast-content"> <div class="toast-msg">${escapeHtml(message)}</div> ${action ? `<button class="toast-action">${escapeHtml(action.label)}</button>` : ‘’}

  </div>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

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

window.Notify = NotifySafe;

const NotificationUX = {
withUndo(label, undoFn) {
NotifySafe.action(`${label} dihapus`, ‘Undo’, undoFn);
},
errorFriendly(err) {
NotifySafe.error(err?.message || ‘Terjadi kesalahan’, { duration: 3000 });
}
};

window.notifySuccess = (m) => NotifySafe.success(m);
window.notifyError   = (m) => NotifySafe.error(m);
window.notifyInfo    = (m) => NotifySafe.info(m);
window.showToast     = (m, t = ‘info’) => NotifySafe[t]?.(m) ?? NotifySafe.info(m);

/* F6: NotifSystem → Notify
Di index.html UI Bridge, dropdown notifikasi memanggil NotifSystem.render()
tapi module yang tersedia namanya Notify. Alias ini memastikan kode di
index.html yang menggunakan NotifSystem tetap berfungsi tanpa perlu
mengubah HTML. */
window.NotifSystem = {
render(container, list) {
if (!container) return;
if (!list?.length) {
container.innerHTML = `<div class="notif-empty">Tidak ada notifikasi</div>`;
return;
}
container.innerHTML = list.map(n => `<div class="notif-item notif-${n.type || 'info'}"> <div class="notif-msg">${escapeHtml(n.message || '')}</div> ${n.time ?`<div class="notif-time">${escapeHtml(n.time)}</div>`: ''} </div>`).join(’’);
}
};

Logger.log(’[NotifySafe] unified notification system ready’);

/* ============================================================
PART 6 — ERROR HANDLING + SAFETY LAYER
============================================================ */

const ErrorHandler = (() => {

function log(error, context = ‘’, level = ‘error’) {
try {
if (level === ‘warn’)       Logger.warn(’[Warn]’,  context, error);
else if (level === ‘info’)  Logger.log(’[Info]’,  context, error);
else                        Logger.error(’[Error]’, context, error);
} catch (e) { console.error(error); }
}

function getMessage(error) {
if (!error) return ‘Terjadi kesalahan’;
if (typeof error === ‘string’) return error;
return error.message || ‘Terjadi kesalahan tidak terduga’;
}

function notify(error, level = ‘error’) {
if (level === ‘warn’ || level === ‘info’) {
NotifySafe.info(getMessage(error));
} else {
NotifySafe.error(getMessage(error));
}
}

function capture(error, context = ‘’, level = ‘error’) {
log(error, context, level);
notify(error, level);
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
PART 7 — FEATURE FLAGS
P1: Mendukung remote config dari /config.json (dengan fallback lokal)
============================================================ */

const FeatureFlags = (() => {

const defaults = {
WA:            true,
ANALYTICS:     true,
BROADCAST:     true,
AUTO_REMINDER: true,
OFFLINE_QUEUE: true
};

let flags = Object.assign({}, defaults, CONFIG?.FEATURES || {});

async function loadRemote() {
try {
const res = await fetch(’/config.json’, { cache: ‘no-cache’ });
if (!res.ok) return;
const remote = await res.json();
if (remote?.FEATURES && typeof remote.FEATURES === ‘object’) {
flags = Object.assign({}, defaults, CONFIG?.FEATURES || {}, remote.FEATURES);
Logger.log(’[FeatureFlags] remote config loaded:’, flags);
}
} catch (err) {
/* Gagal fetch remote config → pakai local defaults (tidak error fatal) */
Logger.warn(’[FeatureFlags] remote config unavailable, using local defaults’);
}
}

function isEnabled(key) { return !!flags[key]; }
function getAll()       { return { …flags }; }

return { isEnabled, getAll, loadRemote };

})();

/* ============================================================
PART 8 — SETTINGS + BUSINESS RULES
============================================================ */

const SettingsBridge = (() => {

let cache = null;

function load()    { cache = Settings.get(); return cache; }
function get()     { if (!cache) load(); return cache; }
function refresh() { cache = Settings.get(); return cache; }

return { load, get, refresh };

})();

const BusinessRules = (() => {

function isOpenNow()         { return Settings.isOpenNow(); }
function getMaxCapacity()    { return SettingsBridge.get()?.maxCapacityPerDay ?? CONFIG.MAX_CAPACITY_PER_SLOT ?? 20; }
function shouldAutoConfirm() { return !!SettingsBridge.get()?.autoConfirm; }
function isWAEnabled()       { return FeatureFlags.isEnabled(‘WA’) && !!SettingsBridge.get()?.enableWA; }
function getBusinessPhone()  { return SettingsBridge.get()?.phoneNumber || ‘’; }

async function canAcceptReservation(date, guests) {
const list  = await DataProvider.getByDate(date);
const total = list.reduce((sum, r) => {
if (r.status === Reservation.STATUS.CANCELLED) return sum;
return sum + (r.guests || 0);
}, 0);
return (total + guests) <= getMaxCapacity();
}

async function validateReservation(payload) {
if (!isOpenNow()) throw new Error(‘Restoran sedang tutup’);
const ok = await canAcceptReservation(payload.date, payload.guests);
if (!ok) throw new Error(‘Kapasitas penuh di tanggal tersebut’);
return true;
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

const SettingsUIBridge = (() => {

function apply() {
const s = SettingsBridge.get();
const nameEl = document.getElementById(‘biz-name’);
if (nameEl) nameEl.textContent = s.businessName;
const sub = document.getElementById(‘cal-subtitle’);
if (sub) sub.textContent = `Kelola reservasi ${s.businessName} dengan mudah`;
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
PART 9 — DATA PROVIDER
============================================================ */

const DataProvider = (() => {

async function getAllReservations() {
const cached = SmartCache.get(‘res_all’);
if (cached) return cached;
const data = await Reservation.getAll();
SmartCache.set(‘res_all’, data, 3000);
return data;
}

async function getByDate(date) {
const key    = `res_date_${date}`;
const cached = SmartCache.get(key);
if (cached) return cached;
const data = await Reservation.getByDate(date);
SmartCache.set(key, data, 3000);
return data;
}

async function getGroupedByDate() {
const cached = SmartCache.get(‘res_grouped’);
if (cached) return cached;
const list = await getAllReservations();
const map  = {};
list.forEach(r => {
if (!r.date) return;
if (!map[r.date]) map[r.date] = [];
map[r.date].push(r);
});
SmartCache.set(‘res_grouped’, map, 3000);
return map;
}

return { getAllReservations, getByDate, getGroupedByDate };

})();

const DataStore = DataProvider;

/* ============================================================
PART 10 — SMART CACHE
S1: Invalidasi granular per event type — tidak clear semua sekaligus
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

/* Invalidasi spesifik per tanggal — efisien untuk update 1 hari */
function invalidateDate(date) {
clear(`res_date_${date}`);
clear(‘res_all’);
clear(‘res_grouped’);
}

return { set, get, clear, invalidateDate };

})();

/* S1: Granular cache invalidation per event type */
EventBridge.on(‘reservation:created’, () => {
SmartCache.clear(‘res_all’);
SmartCache.clear(‘res_grouped’);
SmartCache.clear(‘anl_’);
});

EventBridge.on(‘reservation:deleted’, () => {
SmartCache.clear(‘res_all’);
SmartCache.clear(‘res_grouped’);
SmartCache.clear(‘anl_’);
});

EventBridge.on(‘reservation:updated’, (res) => {
/* Hanya invalidasi tanggal yang berubah, bukan semua cache */
if (res?.date) {
SmartCache.invalidateDate(res.date);
} else {
SmartCache.clear(‘res_’);
}
SmartCache.clear(‘anl_’);
});

/* Fallback: reservation:changed untuk backward compat */
EventBridge.on(‘reservation:changed’, () => {
SmartCache.clear(‘res_’);
SmartCache.clear(‘anl_’);
});

/* ============================================================
PART 11 — SERVICE LAYER + RENDER BUS
============================================================ */

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

const RefreshBus = (() => {

function refreshAll() {
RenderScheduler.schedule(async () => {
if (UI?.renderCalendar) await UI.renderCalendar();
const selected = Calendar?.getSelected?.();
if (selected && UI?.renderDetail) await UI.renderDetail(selected);
});
}

return { refreshAll };

})();

(function bindCentralRefresh() {
EventBridge.on(‘reservation:changed’, () => {
try {
RefreshBus.refreshAll();
} catch (err) {
ErrorHandler.capture(err, ‘centralRefresh’);
}
});
})();

const ReservationService = (() => {

async function create(data) {
const res = await Reservation.create(data);
AuditLog.record(‘reservation:create’, { id: res?.id, date: data.date, name: data.name });
EventBridge.emit(‘reservation:created’, res);
EventBridge.emit(‘reservation:changed’);
return res;
}

async function update(id, patch) {
const res = await Reservation.update(id, patch);
AuditLog.record(‘reservation:update’, { id, patch });
EventBridge.emit(‘reservation:updated’, res);
EventBridge.emit(‘reservation:changed’);
return res;
}

async function remove(id) {
await Reservation.remove(id);
AuditLog.record(‘reservation:delete’, { id });
EventBridge.emit(‘reservation:deleted’, id);
EventBridge.emit(‘reservation:changed’);
}

return { create, update, remove };

})();

/* ============================================================
PART 12 — OFFLINE QUEUE
C3: Retry limit (max 3) + exponential backoff — tidak stuck selamanya
============================================================ */

const OfflineQueue = (() => {

const QUEUE_KEY  = ‘psv_offline_queue’;
const MAX_RETRY  = 3;

function _load()   { return SafeStorage.get(QUEUE_KEY, []); }
function _save(q)  { SafeStorage.set(QUEUE_KEY, q); }

function push(op) {
if (!FeatureFlags.isEnabled(‘OFFLINE_QUEUE’)) return;
const q = _load();
q.push({ …op, queuedAt: Date.now(), retries: 0 });
_save(q);
Logger.warn(’[OfflineQueue] queued operation:’, op.type);
}

async function flush() {
if (!FeatureFlags.isEnabled(‘OFFLINE_QUEUE’)) return;
const q = _load();
if (!q.length) return;

```
Logger.log('[OfflineQueue] flushing', q.length, 'queued ops');

const failed = [];

for (const op of q) {

  /* C3: Skip jika sudah melebihi batas retry */
  if (op.retries >= MAX_RETRY) {
    Logger.warn('[OfflineQueue] max retries reached, dropping op:', op.type, op.queuedAt);
    AuditLog.record('offline:drop', { type: op.type, retries: op.retries });
    continue;
  }

  /* C3: Exponential backoff sebelum retry */
  if (op.retries > 0) {
    await new Promise(r => setTimeout(r, op.retries * 1000));
  }

  try {
    if (op.type === 'create') await ReservationService.create(op.data);
    if (op.type === 'update') await ReservationService.update(op.id, op.data);
    if (op.type === 'delete') await ReservationService.remove(op.id);
  } catch (err) {
    Logger.error('[OfflineQueue] replay failed:', op, err);
    op.retries++;
    failed.push(op);
  }
}

_save(failed);

if (!failed.length && q.length > 0) {
  NotifySafe.success('Data offline berhasil disinkronkan');
} else if (failed.length > 0) {
  NotifySafe.error(`${failed.length} operasi gagal disinkronkan`);
}
```

}

window.addEventListener(‘online’, () => {
NotifySafe.info(‘Koneksi kembali — menyinkronkan data…’);
flush();
});

return { push, flush };

})();

/* ============================================================
PART 13 — HARDENING: SANITIZER + DUPLICATE GUARD + ASYNC LOCK
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
name:   text(payload.name),
phone:  phone(payload.phone),
note:   text(payload.note),
date:   payload.date,
time:   payload.time,
guests: number(payload.guests, 1),
menus:  Array.isArray(payload.menus) ? payload.menus : []
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

const SafeReservation = (() => {

async function create(payload) {
const clean = Sanitizer.reservation(payload);

```
if (DuplicateGuard.isDuplicate(clean)) {
  NotifySafe.info('Reservasi sedang diproses');
  return null;
}

if (!navigator.onLine) {
  OfflineQueue.push({ type: 'create', data: clean });
  NotifySafe.info('Offline — reservasi akan disimpan saat online');
  return null;
}

return AsyncLock.run('create', async () => {
  try {
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
const clean = Sanitizer.reservation(patch);

```
if (!navigator.onLine) {
  OfflineQueue.push({ type: 'update', id, data: clean });
  NotifySafe.info('Offline — perubahan akan disimpan saat online');
  return null;
}

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
if (!navigator.onLine) {
OfflineQueue.push({ type: ‘delete’, id });
NotifySafe.info(‘Offline — penghapusan akan disinkronkan saat online’);
return null;
}

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

const safeCreateReservation = (d)     => SafeReservation.create(d);
const safeUpdateReservation = (id, d) => SafeReservation.update(id, d);
const safeDeleteReservation = (id)    => SafeReservation.remove(id);

/* ============================================================
PART 14 — FORM + DETAIL ACTIONS
============================================================ */

/* F5: Konsolidasi form submit handler.
Form module dari modules.js mengikat submit langsung ke Reservation.create()
tanpa melewati BusinessRules. Kita patch Form.init() agar menghapus binding
default-nya dan menggantinya dengan SafeReservation.create() yang sudah
include validasi, sanitasi, duplicate guard, dan offline queue.
Dengan ini hanya ada SATU submit handler — tidak ada double-submit. */
(function consolidateFormSubmit() {
if (!window.Form) return;
if (Form.**SUBMIT_PATCHED**) return;

/* Tunggu Form.init() selesai berjalan (dipanggil di App.init sebelum ini) */
const originalInit = Form.init?.bind(Form);

Form.init = function () {
/* Jalankan init asli (setup UI, field bindings, dll.) */
originalInit?.();

```
/* Override submit: lepas handler lama, pasang handler yang benar */
const formEl = document.getElementById('reservation-form');
if (!formEl) return;

/* Clone node → hapus semua event listener lama yang terikat */
const cleanForm = formEl.cloneNode(true);
formEl.parentNode.replaceChild(cleanForm, formEl);

/* Pasang satu-satunya handler submit via SafeReservation */
cleanForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const values = Form.getValues?.() ?? {};
  if (!values.name || !values.date) {
    NotifySafe.error('Nama dan tanggal wajib diisi');
    return;
  }
  try {
    await SafeReservation.create(values);
    Form.close?.();
  } catch (err) {
    /* Error sudah di-handle oleh SafeReservation — tidak perlu notify lagi */
  }
});

Logger.log('[Form] submit handler consolidated — single handler active');
```

};

Form.**SUBMIT_PATCHED** = true;
})();

(function patchFormGetValues() {
if (!window.Form || Form.**MENU_PATCHED**) return;

const origGetValues = Form.getValues?.bind(Form);

Form.getValues = function () {
const base = origGetValues?.() ?? {};
return { …base, menus: window.Menu?.getData?.() ?? [] };
};

Form.**MENU_PATCHED** = true;
})();

/* F4: Menu builder ID mismatch.
Menu.init() di modules.js mencari #menu-container dan #btn-add-menu
yang tidak ada di HTML. Yang ada adalah #menu-builder.
Patch ini membuat alias elemen agar Menu module bisa menemukan container-nya. */
(function patchMenuBuilderIds() {
const builder = document.getElementById(‘menu-builder’);
if (!builder) return;

/* Buat #menu-container alias jika belum ada */
if (!document.getElementById(‘menu-container’)) {
builder.id = ‘menu-container’;

```
/* Re-expose dengan id asli juga agar CSS/selector lain tetap bekerja */
builder.setAttribute('data-menu-builder', 'true');
```

}

/* Buat #btn-add-menu jika belum ada — cari tombol “tambah” di dalam builder */
if (!document.getElementById(‘btn-add-menu’)) {
/* Coba temukan tombol tambah existing berdasarkan teks atau data attribute */
const existingBtn = builder.querySelector(’[data-action=“add-menu”], .btn-add-menu, button’);
if (existingBtn && !existingBtn.id) {
existingBtn.id = ‘btn-add-menu’;
} else if (!existingBtn) {
/* Fallback: buat tombol baru */
const btn = document.createElement(‘button’);
btn.id        = ‘btn-add-menu’;
btn.className = ‘btn btn-sm’;
btn.textContent = ‘+ Tambah Menu’;
builder.prepend(btn);
}
}

Logger.log(’[Menu] builder IDs patched — #menu-container and #btn-add-menu ready’);
})();

/* S3: renderReservationCard diekspos ke UI agar VirtualList bisa pakai */
(function patchUIRenderCard() {
if (!window.UI || UI.**CARD_PATCHED**) return;

if (typeof UI.renderReservationCard !== ‘function’) {
/* Fallback jika UI belum mengekspos fungsi ini */
UI.renderReservationCard = function (r) {
const div = document.createElement(‘div’);
div.className = ‘res-card’;
div.dataset.id = r.id;
div.innerHTML = `<div class="res-card-header"> <strong>${escapeHtml(r.name || '-')}</strong> <span class="res-status status-${r.status || 'pending'}">${r.status || 'pending'}</span> </div> <div class="res-card-body"> <span>⏰ ${r.time || '-'}</span> <span>👥 ${r.guests || 0} orang</span> ${r.phone ?`<span>📱 ${escapeHtml(r.phone)}</span>`: ''} ${r.note  ?`<span>📝 ${escapeHtml(r.note)}</span>` : ''} </div> <div class="res-card-actions"> <button data-action="next">Lanjut</button> <button data-action="cancel">Batalkan</button> <button data-action="delete">Hapus</button> ${r.phone ?`<button data-action="wa">WA</button>` : ''} <button data-action="thank">Terima Kasih</button> <button data-action="reminder">Reminder</button> </div>`;
return div;
};
}

UI.**CARD_PATCHED** = true;
})();

(function bindDetailActions() {

const container = document.getElementById(‘reservation-list’);
if (!container) return;

async function _getById(id) {
try {
const list = await DataProvider.getAllReservations();
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

if (e.target.closest('[data-action="next"]')) {
  try {
    await Reservation.advanceStatus(id);
    NotifySafe.success('Status diperbarui');
  } catch (err) { NotifySafe.error('Gagal update status'); }
  return;
}

if (e.target.closest('[data-action="cancel"]')) {
  const ok = await ConfirmDialog.show({
    title:   'Batalkan Reservasi',
    message: 'Apakah kamu yakin ingin membatalkan reservasi ini?'
  });
  if (!ok) return;
  try {
    await Reservation.cancel(id);
    NotifySafe.info('Reservasi dibatalkan');
  } catch (err) { NotifySafe.error('Gagal membatalkan reservasi'); }
  return;
}

if (e.target.closest('[data-action="delete"]')) {
  const ok = await ConfirmDialog.show({
    title:   'Hapus Reservasi',
    message: 'Hapus reservasi ini? Tindakan tidak dapat dibatalkan.',
    danger:  true
  });
  if (!ok) return;
  await SafeReservation.remove(id);
  return;
}

if (e.target.closest('[data-action="wa"]')) {
  const r = await _getById(id);
  if (r) Communication?.sendConfirmation?.(r);
  return;
}

if (e.target.closest('[data-action="thank"]')) {
  const r = await _getById(id);
  if (r) Communication?.sendThankYou?.(r);
  return;
}

if (e.target.closest('[data-action="reminder"]')) {
  const r = await _getById(id);
  if (r) Communication?.sendReminder?.(r);
  return;
}
```

});

})();

window.contactWA = async (id) => {
const list = await DataProvider.getAllReservations();
const r = list.find(x => x.id === id);
if (r) Communication?.sendConfirmation?.(r);
};

/* ============================================================
PART 15 — WHATSAPP + COMMUNICATION ENGINE
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
const template = MessageTemplates[type];
if (!template) return ‘’;
return TemplateEngine.render(template, {
name:    data.name    || ‘Customer’,
biz:     SettingsBridge.get()?.businessName || ‘Usaha’,
date:    TemplateEngine.formatDate(data.date),
time:    data.time    || ‘’,
guests:  data.guests  || ‘’,
message: data.message || ‘’
});
}

return { build };

})();

const WhatsAppService = (() => {

function send(phone, message) {
if (!BusinessRules.isWAEnabled()) {
NotifySafe.error(‘Fitur WhatsApp dinonaktifkan’);
return;
}
if (!phone) phone = BusinessRules.getBusinessPhone();
if (!PhoneUtil.isValid(phone)) {
NotifySafe.error(‘Nomor tidak valid’);
return;
}
const url =
‘https://wa.me/’ +
PhoneUtil.normalize(phone) +
‘?text=’ + encodeURIComponent(message);
window.open(url, ‘_blank’, ‘noopener’);
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
if (!list?.length) { NotifySafe.error(‘Tidak ada penerima’); return; }
if (!message)      { NotifySafe.error(‘Pesan kosong’); return; }
list.forEach((c, i) => {
setTimeout(() => {
WhatsAppService.send(
c.phone,
MessageBuilder.build(‘broadcast’, { name: c.name, message })
);
}, i * 800);
});
NotifySafe.success(`Broadcast dimulai (${list.length} kontak)`);
}

return { sendConfirmation, sendReminder, sendThankYou, sendCustom, sendBroadcast };

})();

/*
S2: AutoReminder dengan tab-lock via localStorage
→ cegah double-send jika app dibuka di banyak tab sekaligus
*/
const AutoReminder = (() => {

const LOCK_KEY    = ‘psv_reminder_lock’;
const LOCK_TTL_MS = 90000; /* 90 detik — lebih dari 1 tick interval */
let started       = false;

function _acquireLock() {
const existing = SafeStorage.get(LOCK_KEY);
if (existing && Date.now() - existing < LOCK_TTL_MS) return false;
SafeStorage.set(LOCK_KEY, Date.now());
return true;
}

function _releaseLock() {
SafeStorage.remove(LOCK_KEY);
}

function start() {
if (!FeatureFlags.isEnabled(‘AUTO_REMINDER’)) return;
if (started) return;
started = true;

```
setInterval(async () => {

  /* S2: Hanya 1 tab yang boleh kirim reminder dalam satu waktu */
  if (!_acquireLock()) {
    Logger.log('[AutoReminder] lock held by another tab, skipping');
    return;
  }

  const today = Utils.today?.();
  if (!today) { _releaseLock(); return; }

  try {
    const list = await DataProvider.getByDate(today);
    const now  = new Date();

    for (const r of list) {
      if (!r.time || r.reminderSent) continue;

      const [h, m] = r.time.split(':').map(Number);
      const resTime = new Date();
      resTime.setHours(h, m, 0, 0);

      const diff = resTime - now;

      if (diff > 0 && diff < 3600000) {
        Communication.sendReminder(r);
        await Reservation.update(r.id, { reminderSent: true });
        EventBridge.emit('reservation:updated', { ...r, reminderSent: true });
      }
    }

  } catch (err) {
    Logger.warn('[AutoReminder]', err);
  } finally {
    _releaseLock();
  }

}, 60000);
```

}

return { start };

})();

AutoReminder.start();
Logger.log(’[Communication] engine ready’);

/* ============================================================
PART 16 — ANALYTICS CONTROLLER
============================================================ */

const AnalyticsController = (() => {

async function loadSummary() {
if (!FeatureFlags.isEnabled(‘ANALYTICS’)) return;

```
try {
  let data = SmartCache.get('anl_summary');
  if (!data) {
    data = await Analytics.getSummary();
    SmartCache.set('anl_summary', data, 30000);
  }

  const el = document.getElementById('anl-stats');
  if (!el) return;

  el.innerHTML = [
    { val: data.totalReservations, label: 'Total Reservasi' },
    { val: data.totalGuests,       label: 'Total Tamu' },
    { val: data.occupancy + '%',   label: 'Tingkat Okupansi' },
    { val: data.peakDay || '-',    label: 'Hari Tersibuk' }
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
if (!FeatureFlags.isEnabled(‘ANALYTICS’)) return;

```
try {
  let data = SmartCache.get('anl_daily');
  if (!data) {
    data = await Analytics.getDaily();
    SmartCache.set('anl_daily', data, 30000);
  }

  const el = document.getElementById('anl-daily');
  if (!el) return;

  if (!data.length) {
    el.innerHTML = UI.empty('Belum ada data analitik');
    return;
  }

  el.innerHTML = data.map(item => {
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

addRouteHook(async (name) => {
if (name === ‘analysis’) await AnalyticsController.loadAll();
});

EventBridge.on(‘reservation:changed’, () => {
if (Router?.getCurrent?.() === ‘analysis’) AnalyticsController.loadAll();
});

/* ============================================================
PART 17 — CUSTOMER MANAGEMENT
============================================================ */

const CustomerController = (() => {

let cache = [];

async function build() {
const list = await DataProvider.getAllReservations();
const map  = {};
list.forEach(r => {
const key = r.phone || (r.name + ‘_’ + r.date);
if (!map[key]) {
map[key] = { name: r.name || ‘Tanpa Nama’, phone: r.phone || ‘’, count: 0, lastDate: r.date };
}
map[key].count++;
if (r.date > map[key].lastDate) map[key].lastDate = r.date;
});
cache = Object.values(map).sort((a, b) => b.count - a.count);
return cache;
}

function get()         { return cache; }
function filter(query) {
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
if (!list.length) {
el.innerHTML = `<tr><td colspan="5">${UI.empty('Tidak ada data pelanggan')}</td></tr>`;
return;
}
el.innerHTML = list.map(c => `<tr> <td><strong>${_esc(c.name)}</strong></td> <td>${c.phone || '-'}</td> <td>${c.count}x</td> <td>${_fmt(c.lastDate)}</td> <td>${c.phone ? `<button class="btn-wa" data-phone="${c.phone}" data-name="${_esc(c.name)}">WA</button>` : '-'}</td> </tr>`).join(’’);
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
PART 18 — BROADCAST SYSTEM
============================================================ */

const BroadcastController = (() => {

let list = [];

async function load() {
list = (await CustomerController.build()).filter(c => c.phone);
return list;
}

function get()         { return list; }
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
if (!FeatureFlags.isEnabled(‘BROADCAST’)) { NotifySafe.error(‘Fitur broadcast dinonaktifkan’); return; }
if (!list.length) { NotifySafe.error(‘Tidak ada penerima’); return; }
if (!template)    { NotifySafe.error(‘Pesan kosong’); return; }
Communication.sendBroadcast(list, template);
}

return { load, get, filter, send, sendAll };

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
if (!list.length) {
el.innerHTML = UI.empty(‘Tidak ada data pelanggan’);
return;
}
el.innerHTML = list.map(c => ` <div class="bc-item" data-phone="${c.phone}" data-name="${_esc(c.name)}"> <div> <div class="bc-name">${_esc(c.name)}</div> <div class="bc-phone">${c.phone}</div> </div> <button class="btn-wa">Kirim</button> </div>`).join(’’);
}

function getMessage() { return document.getElementById(‘broadcast-msg’)?.value || ‘’; }

return { render, getMessage };

})();

(function bindBroadcastEvents() {
const search     = document.getElementById(‘bc-search’);
const listEl     = document.getElementById(‘bc-list’);
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
const ok = await ConfirmDialog.show({
title:   ‘Kirim Broadcast’,
message: `Kirim broadcast ke semua pelanggan (${BroadcastController.get?.()?.length ?? '?'} kontak)?`
});
if (!ok) return;
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
PART 19 — LAZY VIEW + VIRTUAL LIST
C2: VirtualList render dari DATA (bukan clone DOM)
→ event listener di card tidak hilang
============================================================ */

/*
C2: Prinsip benar: DATA → DOM
VirtualList.render menerima array data + fungsi renderItem yang
menghasilkan elemen DOM baru. Tidak boleh clone elemen yang sudah ada.
*/
const VirtualList = (() => {

function render(container, list, renderItem, limit = 50) {
if (!container) return;
const frag = document.createDocumentFragment();
list.slice(0, limit).forEach(item => {
const el = renderItem(item);
if (el) frag.appendChild(el);
});
container.innerHTML = ‘’;
container.appendChild(frag);

```
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

/*
C2: renderDetail dipatch untuk gunakan VirtualList dari DATA, bukan DOM.
UI.renderReservationCard dipanggil per item untuk membuat elemen baru.
*/
(function patchDetailRender() {
if (!window.UI?.renderDetail) return;
if (UI.**VIRTUAL_PATCHED**) return;

const original = UI.renderDetail.bind(UI);

UI.renderDetail = async function (date) {

```
/* Ambil data untuk tanggal yang dipilih */
const list = await DataProvider.getByDate(date).catch(() => []);

if (list.length <= 50) {
  /* List pendek: render normal via original */
  await original(date);
} else {
  /* C2: List panjang: render dari DATA menggunakan VirtualList */
  const container = document.getElementById('reservation-list');
  if (!container) { await original(date); return; }

  VirtualList.render(
    container,
    list,
    (item) => UI.renderReservationCard(item) /* data → DOM */
  );
}
```

};

UI.**VIRTUAL_PATCHED** = true;
})();

const LazyView = (() => {

const loaded = new Set();

function handle(name) {
if (loaded.has(name)) return;
if (name === ‘analysis’) {
AnalyticsController.loadAll();
loaded.add(name);
}
if (name === ‘broadcast’) {
BroadcastController.load().then(data => BroadcastUI.render(data));
loaded.add(name);
}
}

return { handle };

})();

/* ============================================================
PART 20 — UX MICRO INTERACTIONS
============================================================ */

const ButtonUX = {
setLoading(btn, state = true) {
if (!btn) return;
if (state) { btn.dataset._text = btn.innerHTML; btn.innerHTML = ‘⏳’; btn.disabled = true; }
else       { btn.innerHTML = btn.dataset._text || btn.innerHTML; btn.disabled = false; }
}
};

(function clickFeedback() {
document.addEventListener(‘click’, (e) => {
const btn = e.target.closest(’.btn’);
if (!btn) return;
btn.style.transform = ‘scale(0.96)’;
setTimeout(() => { btn.style.transform = ‘’; }, 120);
});
})();

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

/* P2: Empty state terpusat — tidak lagi scattered di masing-masing controller */
function buildEmptyState(title, subtitle = ‘’) {
return `<div class="empty-state" style="padding:24px;text-align:center;"> <div style="font-size:2rem;">📭</div> <div style="font-weight:600;">${escapeHtml(title)}</div> ${subtitle ? `<div style="opacity:0.6;font-size:0.85rem;">${escapeHtml(subtitle)}</div>` : ‘’}

  </div>`;
}

/* Ekspos ke UI agar semua module pakai satu fungsi empty state */
if (window.UI && !UI.empty) {
UI.empty = buildEmptyState;
}

Logger.log(’[UX] interaction layer active’);

/* ============================================================
PART 21 — AUDIT LOG (S4)
Traceability untuk aksi-aksi bisnis penting
============================================================ */

const AuditLog = (() => {

const LOG_KEY  = ‘psv_audit_log’;
const MAX_LOGS = 200;

function record(action, meta = {}) {
try {
const logs = SafeStorage.get(LOG_KEY, []);
logs.unshift({
action,
meta,
ts: Date.now(),
view: Router?.getCurrent?.() ?? null
});
/* Jaga ukuran log agar tidak membengkak */
if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
SafeStorage.set(LOG_KEY, logs);
} catch (err) {
Logger.warn(’[AuditLog] failed to record:’, action, err);
}
}

function getAll() {
return SafeStorage.get(LOG_KEY, []);
}

function clear() {
SafeStorage.remove(LOG_KEY);
Logger.log(’[AuditLog] cleared’);
}

return { record, getAll, clear };

})();

window.AuditLog = AuditLog;

/* ============================================================
PART 22 — MODULE REGISTRY + ARCHITECTURE
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

(function bindSyncLayer() {
if (!window.Sync?.subscribe) return;
Sync.subscribe(() => EventBridge.emit(‘reservation:changed’));
})();

window.AppAPI = {
create:  (d)     => SafeReservation.create(d),
update:  (id, d) => SafeReservation.update(id, d),
delete:  (id)    => SafeReservation.remove(id),
refresh: ()      => EventBridge.emit(‘reservation:changed’),
getAll:  ()      => DataProvider.getAllReservations(),
audit:   ()      => AuditLog.getAll(),
debug:   ()      => console.log({ modules: ModuleRegistry.list() })
};

setTimeout(() => {
Logger.log(’[HealthCheck] modules:’, ModuleRegistry.list().length);
}, 2000);

Logger.log(’[Architecture] clean & stable’);

/* ============================================================
PART 23 — PRODUCTION HARDENING
============================================================ */

(function setProductionMode() {
window.**PROD** = !CONFIG.DEBUG;
Logger.log(’[MODE]’, window.**PROD** ? ‘Production’ : ‘Development’);
})();

(function autoBackup() {
setInterval(async () => {
try {
const data = await DataProvider.getAllReservations();
if (!data?.length) return;
SafeStorage.set(‘psv_autobackup’, { t: Date.now(), data });
} catch (err) { Logger.warn(’[Backup] skipped’); }
}, 60000);
})();

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

(function networkMonitor() {
function update() {
if (!navigator.onLine) NotifySafe.info(‘Mode offline aktif’);
else {
Logger.log(’[Network] online’);
OfflineQueue.flush();
}
}
window.addEventListener(‘offline’, update);
window.addEventListener(‘online’, update);
})();

(function performanceWatch() {
const start = performance.now();
window.addEventListener(‘load’, () => {
const t = performance.now() - start;
if (t > 2500) Logger.warn(’[PERF] slow load:’, Math.round(t), ‘ms’);
});
})();

/* Public API (frozen) */
window.Proserva = Object.freeze({

create:   safeCreateReservation,
update:   (data) => safeUpdateReservation(data.id, data),
delete:   safeDeleteReservation,
getAll:   () => DataProvider.getAllReservations(),
backup:   () => Backup.exportData?.(),
restore:  (file) => Backup.importFile?.(file),
settings: () => Settings.get?.(),
refresh:  () => EventBridge.emit(‘reservation:changed’),
audit:    () => AuditLog.getAll(),
version:  ‘1.2.1’,

async health() {
try {
/* S5: Health check dengan latency measurement */
const t0   = performance.now();
const list = await DataProvider.getAllReservations();
const latencyMs = Math.round(performance.now() - t0);

```
  return {
    ok:       true,
    total:    list.length,
    mode:     CONFIG.DATA_MODE,
    prod:     window.__PROD__,
    latencyMs,
    features: FeatureFlags.getAll()
  };
} catch (err) {
  return { ok: false, error: err?.message };
}
```

}

});

window.recoverApp = function () {
try {
localStorage.removeItem(KEYS.reservations);
location.reload();
} catch (err) { Logger.error(’[RECOVERY FAILED]’, err); }
};

if (CONFIG.DEBUG) {
window.**DEV** = {
async seed() {
for (let i = 1; i <= 10; i++) {
await SafeReservation.create({
name:   ’Customer ’ + i,
phone:  ‘08123456789’,
date:   Utils.today(),
time:   ‘18:00’,
guests: Math.ceil(Math.random() * 5)
});
}
},
clear()  { localStorage.clear(); location.reload(); },
audit()  { console.table(AuditLog.getAll()); },
flags()  { console.log(FeatureFlags.getAll()); }
};
}

console.log(’%cProserva v1.2.1 🚀’, ‘color:#22c55e;font-weight:bold;’);

/* ============================================================
END OF APP.JS — PROSERVA v1.2.1
============================================================ */