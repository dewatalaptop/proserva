‘use strict’;

/* ============================================================
PROSERVA MODULES v2.1 — FULLY PATCHED
Sinkron dengan app.js v1.2.1 dan index.html (fixed)

DAFTAR FIX UTAMA:
M1. CONFIG tidak didefinisikan ulang — sudah ada di index.html
window.CONFIG = { DATA_MODE: ‘local’ }. Hanya tambahkan
properti yang belum ada agar tidak overwrite app.js.
M2. Calendar.getYear() dan Calendar.getMonth() ditambahkan
agar patchCalendarRender di app.js bisa membaca state bulan.
M3. Calendar.select() menyimpan state dan sync ke STATE global.
M4. UI.renderCalendar() tidak lagi bind click langsung ke cell —
app.js sudah pakai event delegation via #calendar-grid.
Klik di sini hanya menjadi fallback lokal (tidak trigger Router).
M5. Form.init() tidak lagi bind submit ke Reservation.create()
langsung — consolidateFormSubmit di app.js akan override ini.
Form.getValues() diekspos agar SafeReservation bisa ambil data.
M6. Menu module mencari #menu-builder (bukan #menu-container)
saat berada di konteks modal. patchMenuBuilderIds di app.js
sudah membuat alias, jadi Menu.init() akan menemukan container.
M7. Semua string literal menggunakan tanda kutip ASCII (tidak ada
smart quotes / curly quotes).
M8. Logger didefinisikan sebelum CONFIG agar tidak crash saat boot.
M9. UI.renderReservationCard() diekspos agar VirtualList di app.js
bisa memanggil fungsi ini per item.
M10. Calendar.resetToToday() memperbarui STATE.selectedDate.
M11. Filter.init() tidak bind submit form — hanya filter UI.
M12. Backup dan Settings menggunakan KEYS yang didefinisikan di
modul ini, bukan dari variabel luar yang belum tentu ada.
============================================================ */

/* ============================================================
BAGIAN 1 — SAFE LOGGER
Didefinisikan PERTAMA karena semua modul lain memakainya.
============================================================ */

const Logger = (() => {

function log(…args) {
if (typeof CONFIG !== ‘undefined’ && !CONFIG.DEBUG) return;
console.log(’[Proserva]’, …args);
}

function warn(…args) {
if (typeof CONFIG !== ‘undefined’ && !CONFIG.DEBUG) return;
console.warn(’[Proserva]’, …args);
}

function error(…args) {
console.error(’[Proserva]’, …args);
}

return { log, warn, error };

})();

/* ============================================================
BAGIAN 2 — CONFIG
M1: Tidak redeclare CONFIG (sudah ada di index.html sebagai
window.CONFIG). Kita hanya tambahkan properti default yang
belum ada agar tidak crash saat diakses modul lain.
============================================================ */

(function patchConfig() {
if (typeof window.CONFIG === ‘undefined’) {
window.CONFIG = {};
}
const defaults = {
DATA_MODE: ‘local’,
MAX_CAPACITY_PER_SLOT: 20,
DEBUG: true,
FEATURES: {}
};
Object.keys(defaults).forEach(function (k) {
if (window.CONFIG[k] === undefined) {
window.CONFIG[k] = defaults[k];
}
});
})();

/* ============================================================
BAGIAN 3 — GLOBAL STATE
============================================================ */

const STATE = {
selectedDate: null,
selectedMonth: new Date().getMonth(),
selectedYear: new Date().getFullYear(),
reservationsCache: null
};

/* ============================================================
BAGIAN 4 — UTILS (PURE, NO DEPENDENCY)
============================================================ */

const Utils = (() => {

function generateId() {
if (typeof crypto !== ‘undefined’ && crypto.randomUUID) {
return crypto.randomUUID();
}
/* Fallback untuk browser lama */
return ‘xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx’.replace(/[xy]/g, function (c) {
const r = Math.random() * 16 | 0;
const v = c === ‘x’ ? r : (r & 0x3 | 0x8);
return v.toString(16);
});
}

/* M2: formatDate menerima month sebagai 0-based (sama seperti Date API) */
function formatDate(year, month, day) {
const m = String(month + 1).padStart(2, ‘0’);
const d = String(day).padStart(2, ‘0’);
return year + ‘-’ + m + ‘-’ + d;
}

function today() {
const now = new Date();
return formatDate(now.getFullYear(), now.getMonth(), now.getDate());
}

function clamp(num, min, max) {
return Math.min(Math.max(num, min), max);
}

function debounce(fn, delay) {
delay = delay || 300;
let t;
return function () {
const args = arguments;
clearTimeout(t);
t = setTimeout(function () { fn.apply(null, args); }, delay);
};
}

return { generateId, formatDate, today, clamp, debounce };

})();

/* ============================================================
BAGIAN 5 — EVENT BUS
Digunakan oleh DB dan Sync untuk broadcast perubahan data.
app.js juga listen via Events.on() melalui Sync.subscribe().
============================================================ */

const Events = (() => {

const listeners = {};

function on(event, callback) {
if (!listeners[event]) listeners[event] = [];
/* Cegah duplikasi listener yang sama */
if (listeners[event].indexOf(callback) === -1) {
listeners[event].push(callback);
}
}

function off(event, callback) {
if (!listeners[event]) return;
listeners[event] = listeners[event].filter(function (cb) {
return cb !== callback;
});
}

function emit(event, data) {
if (!listeners[event]) return;
listeners[event].forEach(function (cb) {
try { cb(data); }
catch (err) { Logger.error(’[Events] listener error:’, err); }
});
}

return { on, off, emit };

})();

/* ============================================================
BAGIAN 6 — DOM HELPERS
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
el.classList.remove(‘hidden’);
}

function hide(el) {
if (!el) return;
el.classList.add(‘hidden’);
}

return { get, getAll, html, show, hide };

})();

/* ============================================================
BAGIAN 7 — SAFE INIT GUARD
============================================================ */

let **APP_INITIALIZED** = false;

function guardInit() {
if (**APP_INITIALIZED**) {
Logger.warn(‘App already initialized’);
return false;
}
**APP_INITIALIZED** = true;
return true;
}

/* ============================================================
BAGIAN 8 — STORAGE KEYS
Didefinisikan di sini agar Backup dan Settings bisa akses
tanpa bergantung pada variabel dari file lain.
============================================================ */

const KEYS = {
reservations: ‘psv_reservations_v1’,
settings: ‘psv_settings_v1’
};

/* ============================================================
BAGIAN 9 — LOCAL DB
============================================================ */

const LocalDB = (() => {

function read(key) {
try {
const raw = localStorage.getItem(key);
return raw ? JSON.parse(raw) : [];
} catch (err) {
Logger.error(‘LocalDB read error’, err);
return [];
}
}

function write(key, value) {
try {
localStorage.setItem(key, JSON.stringify(value));
} catch (err) {
Logger.error(‘LocalDB write error’, err);
}
}

return { read, write };

})();

/* ============================================================
BAGIAN 10 — DB ADAPTER
============================================================ */

const DB = (() => {

function invalidateCache() {
STATE.reservationsCache = null;
}

function setCache(data) {
STATE.reservationsCache = data;
}

function getCache() {
return STATE.reservationsCache;
}

async function getAllReservations() {
if (getCache()) return getCache();

```
let data;
if (CONFIG.DATA_MODE === 'local') {
  data = LocalDB.read(KEYS.reservations);
} else {
  data = []; /* placeholder firebase */
}

/* Pastikan selalu array */
if (!Array.isArray(data)) data = [];

setCache(data);
return data;
```

}

async function insertReservation(item) {
const data = await getAllReservations();
data.push(item);

```
if (CONFIG.DATA_MODE === 'local') {
  LocalDB.write(KEYS.reservations, data);
}

invalidateCache();
Events.emit('reservation:changed');
return item;
```

}

async function updateReservation(id, patch) {
const data = await getAllReservations();
const idx = data.findIndex(function (r) { return r.id === id; });
if (idx === -1) return null;

```
data[idx] = Object.assign({}, data[idx], patch);

if (CONFIG.DATA_MODE === 'local') {
  LocalDB.write(KEYS.reservations, data);
}

invalidateCache();
Events.emit('reservation:changed');
return data[idx];
```

}

async function deleteReservation(id) {
let data = await getAllReservations();
data = data.filter(function (r) { return r.id !== id; });

```
if (CONFIG.DATA_MODE === 'local') {
  LocalDB.write(KEYS.reservations, data);
}

invalidateCache();
Events.emit('reservation:changed');
```

}

async function getByDate(date) {
const data = await getAllReservations();
return data.filter(function (r) { return r.date === date; });
}

async function getByStatus(status) {
const data = await getAllReservations();
return data.filter(function (r) { return r.status === status; });
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
BAGIAN 11 — RESERVATION MODULE
============================================================ */

const Reservation = (() => {

const STATUS = {
PENDING:   ‘pending’,
CONFIRMED: ‘confirmed’,
ONGOING:   ‘ongoing’,
COMPLETED: ‘completed’,
CANCELLED: ‘cancelled’
};

function validate(payload) {
if (!payload.name || String(payload.name).trim().length < 2) {
throw new Error(‘Nama minimal 2 karakter’);
}
if (!payload.date) {
throw new Error(‘Tanggal wajib diisi’);
}
if (!payload.time) {
throw new Error(‘Waktu wajib diisi’);
}
if (!payload.guests || Number(payload.guests) < 1) {
throw new Error(‘Jumlah tamu tidak valid’);
}
return true;
}

function normalize(payload) {
return {
id:        Utils.generateId(),
name:      String(payload.name || ‘’).trim(),
phone:     String(payload.phone || ‘’),
note:      String(payload.note || ‘’),
date:      payload.date,
time:      payload.time,
guests:    Number(payload.guests) || 1,
table:     payload.table || null,
status:    STATUS.PENDING,
menus:     Array.isArray(payload.menus) ? payload.menus : [],
reminderSent: false,
createdAt: Date.now(),
updatedAt: Date.now()
};
}

async function checkCapacity(date, guests) {
const list = await DB.getByDate(date);
const totalGuests = list.reduce(function (sum, r) {
if (r.status === STATUS.CANCELLED) return sum;
return sum + (r.guests || 0);
}, 0);

```
const max = CONFIG.MAX_CAPACITY_PER_SLOT || 20;
if ((totalGuests + guests) > max) {
  throw new Error('Kapasitas penuh untuk tanggal tersebut');
}
return true;
```

}

async function create(payload) {
validate(payload);
await checkCapacity(payload.date, Number(payload.guests));
const data = normalize(payload);
return DB.insertReservation(data);
}

async function update(id, patch) {
patch.updatedAt = Date.now();
return DB.updateReservation(id, patch);
}

async function remove(id) {
return DB.deleteReservation(id);
}

function getNextStatus(current) {
switch (current) {
case STATUS.PENDING:   return STATUS.CONFIRMED;
case STATUS.CONFIRMED: return STATUS.ONGOING;
case STATUS.ONGOING:   return STATUS.COMPLETED;
default:               return current;
}
}

async function advanceStatus(id) {
const list = await DB.getAllReservations();
const item = list.find(function (r) { return r.id === id; });
if (!item) return null;
return update(id, { status: getNextStatus(item.status) });
}

async function cancel(id) {
return update(id, { status: STATUS.CANCELLED });
}

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
BAGIAN 12 — CALENDAR MODULE
M2: Tambahkan getYear() dan getMonth() agar patchCalendarRender
di app.js bisa membaca tahun & bulan yang sedang ditampilkan.
M3: select() sync ke STATE global.
M10: resetToToday() update STATE.selectedDate.
============================================================ */

const Calendar = (() => {

/* State internal — bulan yang sedang DITAMPILKAN di grid */
let _current = new Date();
let _selectedDate = null;

/* –– helpers –– */

function _fmt(date) {
/* Format ke YYYY-MM-DD tanpa timezone shift */
const y = date.getFullYear();
const m = String(date.getMonth() + 1).padStart(2, ‘0’);
const d = String(date.getDate()).padStart(2, ‘0’);
return y + ‘-’ + m + ‘-’ + d;
}

function _isToday(date) {
return _fmt(new Date()) === _fmt(date);
}

/* –– grid generator –– */

function _generateGrid(baseDate) {
const year     = baseDate.getFullYear();
const month    = baseDate.getMonth();
const firstDay = new Date(year, month, 1).getDay(); /* 0=Minggu */
const daysInMonth = new Date(year, month + 1, 0).getDate();
const grid = [];

```
for (let i = 0; i < 42; i++) {
  const dayIndex = i - firstDay + 1;

  if (dayIndex < 1 || dayIndex > daysInMonth) {
    grid.push({ empty: true });
    continue;
  }

  const date    = new Date(year, month, dayIndex);
  const dateStr = _fmt(date);

  grid.push({
    date:     date,
    dateStr:  dateStr,
    day:      dayIndex,
    today:    _isToday(date),
    selected: _selectedDate === dateStr,
    empty:    false
  });
}

return grid;
```

}

/* –– capacity classifier –– */

function _capacityLevel(totalGuests) {
const max = CONFIG.MAX_CAPACITY_PER_SLOT || 20;
if (totalGuests <= max * 0.4) return ‘low’;
if (totalGuests <= max * 0.8) return ‘medium’;
return ‘high’;
}

/* –– attach reservation data –– */

async function _attachReservations(grid) {
const reservations = await Reservation.getAll();
const map = {};

```
reservations.forEach(function (r) {
  if (!map[r.date]) map[r.date] = [];
  map[r.date].push(r);
});

return grid.map(function (cell) {
  if (cell.empty) return cell;

  const list = map[cell.dateStr] || [];
  const activeList = list.filter(function (r) {
    return r.status !== Reservation.STATUS.CANCELLED;
  });
  const totalGuests = activeList.reduce(function (sum, r) {
    return sum + (r.guests || 0);
  }, 0);

  return Object.assign({}, cell, {
    reservations: list,
    total:        list.length,
    guests:       totalGuests,
    level:        _capacityLevel(totalGuests),
    preview:      activeList.slice(0, 3).map(function (r) { return r.name; })
  });
});
```

}

/* –– public API –– */

async function getCalendar() {
const grid     = _generateGrid(_current);
const enriched = await _attachReservations(grid);
return {
month: _current.getMonth(),
year:  _current.getFullYear(),
grid:  enriched
};
}

function nextMonth() {
_current = new Date(_current.getFullYear(), _current.getMonth() + 1, 1);
/* Sync ke STATE global */
STATE.selectedMonth = _current.getMonth();
STATE.selectedYear  = _current.getFullYear();
}

function prevMonth() {
_current = new Date(_current.getFullYear(), _current.getMonth() - 1, 1);
STATE.selectedMonth = _current.getMonth();
STATE.selectedYear  = _current.getFullYear();
}

/* M3: select() sync ke STATE */
function select(dateStr) {
_selectedDate          = dateStr;
STATE.selectedDate     = dateStr;
}

function getSelected() {
return _selectedDate;
}

/* M2: Getter untuk tahun & bulan yang SEDANG DITAMPILKAN
Dipanggil oleh patchCalendarRender di app.js */
function getYear() {
return _current.getFullYear();
}

function getMonth() {
return _current.getMonth(); /* 0-based, sama seperti Date API */
}

/* M10: resetToToday() update STATE */
function resetToToday() {
_current           = new Date();
_selectedDate      = _fmt(_current);
STATE.selectedDate = _selectedDate;
STATE.selectedMonth = _current.getMonth();
STATE.selectedYear  = _current.getFullYear();
}

return {
getCalendar,
nextMonth,
prevMonth,
select,
getSelected,
getYear,
getMonth,
resetToToday
};

})();

/* ============================================================
BAGIAN 13 — UI CONTROLLER
M4: renderCalendar() TIDAK lagi bind click langsung di tiap cell.
app.js sudah pakai event delegation di #calendar-grid melalui
bindCalendarClicks() + patchCalendarRender(). Klik di sini
hanya untuk navigasi internal (update selected visual) tanpa
memicu Router.go() — itu urusan app.js.
M9: renderReservationCard() diekspos untuk VirtualList di app.js.
============================================================ */

const UI = (() => {

/* –– element cache –– */
function _el(id) {
return document.getElementById(id);
}

/* –– month formatter –– */
function _formatMonth(month, year) {
const names = [
‘Januari’, ‘Februari’, ‘Maret’, ‘April’, ‘Mei’, ‘Juni’,
‘Juli’, ‘Agustus’, ‘September’, ‘Oktober’, ‘November’, ‘Desember’
];
return names[month] + ’ ’ + year;
}

/* –– escapeHtml (fallback jika app.js belum load) –– */
function _esc(str) {
if (typeof escapeHtml === ‘function’) return escapeHtml(str);
return String(str == null ? ‘’ : str)
.replace(/&/g, ‘&’)
.replace(/</g, ‘<’)
.replace(/>/g, ‘>’)
.replace(/”/g, ‘"’)
.replace(/’/g, ‘'’);
}

/* –– empty state helper –– */
function empty(title, subtitle) {
subtitle = subtitle || ‘’;
return ‘<div class="empty-state"><strong>’ + _esc(title) + ‘</strong>’ +
(subtitle ? ‘<span>’ + _esc(subtitle) + ‘</span>’ : ‘’) + ‘</div>’;
}

/* ============================================================
RENDER CALENDAR
M4: Tidak bind click ke tiap cell — app.js pakai delegation.
Cell hanya diberi class dan konten visual.
dataset.date di-set di sini juga sebagai fallback sebelum
patchCalendarRender di app.js berjalan.
============================================================ */

async function renderCalendar() {
const monthLabel = _el(‘calendar-month’);
const grid       = _el(‘calendar-grid’);
if (!grid) return;

```
const data = await Calendar.getCalendar();

if (monthLabel) {
  monthLabel.textContent = _formatMonth(data.month, data.year);
}

grid.innerHTML = '';

data.grid.forEach(function (day) {
  const div = document.createElement('div');
  div.className = 'cal-day';

  if (day.empty) {
    div.classList.add('empty');
    grid.appendChild(div);
    return;
  }

  /* State classes */
  if (day.today)    div.classList.add('today');
  if (day.selected) div.classList.add('selected');
  if (day.level)    div.classList.add(day.level);

  /* M4: Set dataset.date untuk event delegation di app.js */
  div.dataset.date = day.dateStr;

  /* Konten */
  div.innerHTML =
    '<div class="cal-day-num">' + day.day + '</div>' +
    (day.total > 0
      ? '<div class="cal-res-pill">' + day.total + ' reservasi</div>'
      : '') +
    '<div class="cal-mini-names">' +
      (day.preview || []).map(function (n) {
        return '<div class="cal-mini-name">' + _esc(n) + '</div>';
      }).join('') +
    '</div>';

  grid.appendChild(div);
});

Logger.log('[UI] calendar rendered', data.month + 1 + '/' + data.year);
```

}

/* ============================================================
RENDER RESERVATION CARD
M9: Diekspos sebagai UI.renderReservationCard() agar VirtualList
di app.js bisa memanggil fungsi ini per item.
Mengembalikan elemen DOM (bukan string HTML).
============================================================ */

function renderReservationCard(item) {
const card = document.createElement(‘div’);
card.className = ‘res-card’;
card.dataset.id     = item.id;
card.dataset.status = item.status;

```
const initials = item.name ? item.name.charAt(0).toUpperCase() : '?';

card.innerHTML =
  '<div class="rc-top">' +
    '<div class="rc-name">' +
      '<div class="rc-avatar">' + _esc(initials) + '</div>' +
      _esc(item.name || '-') +
    '</div>' +
    '<div class="rc-badges">' +
      '<div class="status status-' + _esc(item.status || 'pending') + '">' +
        _esc(item.status || 'pending') +
      '</div>' +
    '</div>' +
  '</div>' +
  '<div class="rc-info">' +
    '<div>\u23F0 ' + _esc(item.time || '-') + '</div>' +
    '<div>\uD83D\uDC65 ' + (item.guests || 0) + ' orang</div>' +
    (item.phone ? '<div>\uD83D\uDCF1 ' + _esc(item.phone) + '</div>' : '') +
    (item.note  ? '<div>\uD83D\uDCDD ' + _esc(item.note)  + '</div>' : '') +
  '</div>' +
  '<div class="rc-footer">' +
    '<button class="btn-primary" style="font-size:0.75rem;padding:5px 10px;" data-action="next">Lanjut</button>' +
    '<button class="btn-danger"  style="font-size:0.75rem;padding:5px 10px;" data-action="cancel">Batalkan</button>' +
    '<button class="btn-ghost"   style="font-size:0.75rem;padding:5px 10px;color:var(--danger);" data-action="delete">Hapus</button>' +
    (item.phone
      ? '<button class="btn-ghost" style="font-size:0.75rem;padding:5px 10px;" data-action="wa">WA</button>'
      : '') +
  '</div>';

return card;
```

}

/* ============================================================
RENDER DETAIL LIST
Dipanggil oleh DateController.select() via app.js.
Jika list > 50 item, VirtualList di app.js akan override ini.
============================================================ */

async function renderDetail(dateStr) {
const container = _el(‘reservation-list’);
if (!container) return;

```
if (!dateStr) {
  container.innerHTML = '';
  return;
}

container.innerHTML = empty('Memuat...', '');

try {
  const list = await Reservation.getByDate(dateStr);

  if (!list || !list.length) {
    container.innerHTML = empty('Belum ada reservasi', 'Tidak ada reservasi untuk tanggal ini');
    return;
  }

  container.innerHTML = '';

  list.forEach(function (item) {
    const card = renderReservationCard(item);

    /* Bind action buttons — app.js bindDetailActions() juga
       listen via delegation, tapi listener lokal ini sebagai
       fallback jika view-detail dirender sebelum app.js siap. */
    const nextBtn   = card.querySelector('[data-action="next"]');
    const cancelBtn = card.querySelector('[data-action="cancel"]');

    if (nextBtn) {
      nextBtn.addEventListener('click', async function () {
        try {
          await Reservation.advanceStatus(item.id);
          renderDetail(dateStr);
          renderCalendar();
        } catch (err) {
          Logger.error('[UI] advanceStatus error', err);
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', async function () {
        try {
          await Reservation.cancel(item.id);
          renderDetail(dateStr);
          renderCalendar();
        } catch (err) {
          Logger.error('[UI] cancel error', err);
        }
      });
    }

    container.appendChild(card);
  });

} catch (err) {
  Logger.error('[UI] renderDetail error', err);
  container.innerHTML = empty('Gagal memuat data');
}
```

}

/* –– navigation binding –– */

function _bindNav() {
const prevBtn = _el(‘btn-prev-month’);
const nextBtn = _el(‘btn-next-month’);

```
if (prevBtn) {
  prevBtn.addEventListener('click', async function () {
    Calendar.prevMonth();
    await renderCalendar();
  });
}

if (nextBtn) {
  nextBtn.addEventListener('click', async function () {
    Calendar.nextMonth();
    await renderCalendar();
  });
}
```

}

/* –– init –– */

async function init() {
Calendar.resetToToday();
_bindNav();
await renderCalendar();
/* Jangan render detail saat init — app.js Router.go(‘calendar’)
yang mengatur view aktif. renderDetail dipanggil saat user
klik tanggal via DateController.select() di app.js. */
Logger.log(’[UI] initialized’);
}

return {
init,
renderCalendar,
renderDetail,
renderReservationCard,
empty
};

})();

/* ============================================================
BAGIAN 14 — FORM MODULE
M5: handleSubmit() TIDAK langsung create ke Reservation.
consolidateFormSubmit() di app.js akan clone form dan
mengganti handler ini dengan SafeReservation.create().
Yang penting: getValues() dan close() tetap diekspos.
============================================================ */

const Form = (() => {

function _el(id) { return document.getElementById(id); }

/* –– modal control –– */

function open() {
const modal = _el(‘reservation-modal’);
if (modal) modal.classList.add(‘open’);
document.body.classList.add(‘lock-scroll’);
}

function close() {
const modal = _el(‘reservation-modal’);
if (modal) modal.classList.remove(‘open’);
document.body.classList.remove(‘lock-scroll’);
resetForm();
}

/* –– form utilities –– */

function getValues() {
return {
name:   (_el(‘input-name’)   ? _el(‘input-name’).value   : ‘’).trim(),
phone:  (_el(‘input-phone’)  ? _el(‘input-phone’).value  : ‘’).trim(),
date:    _el(‘input-date’)   ? _el(‘input-date’).value   : ‘’,
time:    _el(‘input-time’)   ? _el(‘input-time’).value   : ‘’,
guests:  Number(_el(‘input-guests’) ? _el(‘input-guests’).value : 0),
note:   (_el(‘input-note’)   ? _el(‘input-note’).value   : ‘’).trim(),
menus:   (typeof Menu !== ‘undefined’ && Menu.getData) ? Menu.getData() : []
};
}

function resetForm() {
const form = _el(‘reservation-form’);
if (form) {
form.reset();
form.dataset.editingId = ‘’;
}
clearErrors();
/* Reset menu builder juga */
if (typeof Menu !== ‘undefined’ && Menu.reset) {
Menu.reset();
}
}

/* –– error UI –– */

function showError(inputEl, message) {
if (!inputEl) return;
inputEl.classList.add(‘error’);
let err = inputEl.parentElement
? inputEl.parentElement.querySelector(’.form-error’)
: null;
if (!err) {
err = document.createElement(‘div’);
err.className = ‘form-error’;
if (inputEl.parentElement) inputEl.parentElement.appendChild(err);
}
err.textContent = message;
err.classList.add(‘show’);
}

function clearErrors() {
const form = _el(‘reservation-form’);
if (!form) return;
form.querySelectorAll(’.input’).forEach(function (i) {
i.classList.remove(‘error’);
});
form.querySelectorAll(’.form-error’).forEach(function (e) {
e.classList.remove(‘show’);
});
}

/* –– validation (UI level) –– */

function validateUI(values) {
clearErrors();
let valid = true;

```
if (!values.name || values.name.length < 2) {
  showError(_el('input-name'), 'Nama minimal 2 karakter');
  valid = false;
}
if (!values.date) {
  showError(_el('input-date'), 'Tanggal wajib diisi');
  valid = false;
}
if (!values.time) {
  showError(_el('input-time'), 'Waktu wajib diisi');
  valid = false;
}
if (!values.guests || values.guests < 1) {
  showError(_el('input-guests'), 'Jumlah tamu tidak valid');
  valid = false;
}

return valid;
```

}

/* –– submit handler (AKAN DI-OVERRIDE oleh app.js) ––
M5: Handler ini hanya placeholder. consolidateFormSubmit()
di app.js akan clone form dan memasang SafeReservation.create()
sebagai handler tunggal. Jika app.js belum aktif, handler ini
tetap bisa create langsung ke Reservation (fallback). */

async function _handleSubmit(e) {
e.preventDefault();

```
const values = getValues();
if (!validateUI(values)) return;

const submitBtn = _el('btn-submit');

try {
  if (submitBtn) submitBtn.classList.add('btn-loading');

  /* Gunakan SafeReservation jika tersedia (app.js sudah load) */
  if (typeof SafeReservation !== 'undefined') {
    const form = _el('reservation-form');
    const editingId = form ? (form.dataset.editingId || '') : '';
    if (editingId) {
      await SafeReservation.update(editingId, values);
    } else {
      await SafeReservation.create(values);
    }
  } else {
    /* Fallback langsung */
    await Reservation.create(values);
    if (typeof Events !== 'undefined') {
      Events.emit('reservation:changed');
    }
  }

  close();

} catch (err) {
  Logger.error('[Form] submit error', err);
  /* Jangan pakai alert — Notify sudah di-setup di index.html */
  if (typeof Notify !== 'undefined' && Notify.error) {
    Notify.error(err.message || 'Gagal menyimpan reservasi');
  }
} finally {
  if (submitBtn) submitBtn.classList.remove('btn-loading');
}
```

}

/* –– bind: hanya open/close modal, bukan submit ––
M5: Submit tidak di-bind di sini karena akan di-override app.js.
Kita bind submit juga sebagai fallback, tapi app.js nanti
clone form dan menghapus binding ini. */

function _bind() {
const openBtn  = _el(‘btn-open-modal’);
const closeBtn = _el(‘modal-close’);
const modal    = _el(‘reservation-modal’);
const form     = _el(‘reservation-form’);

```
/* open */
if (openBtn) {
  openBtn.addEventListener('click', open);
}

/* close buttons */
if (closeBtn) {
  closeBtn.addEventListener('click', close);
}

/* click outside modal */
if (modal) {
  modal.addEventListener('click', function (e) {
    if (e.target === modal) close();
  });
}

/* submit fallback — akan di-clone/replace oleh consolidateFormSubmit */
if (form) {
  form.addEventListener('submit', _handleSubmit);
}
```

}

function init() {
_bind();
Logger.log(’[Form] initialized’);
}

return {
init,
open,
close,
getValues,
resetForm,
clearErrors
};

})();

/* ============================================================
BAGIAN 15 — MENU SYSTEM
M6: Menu.init() mencari container dengan ID yang benar.
patchMenuBuilderIds di app.js mengubah #menu-builder
menjadi #menu-container di dalam modal, sehingga
document.getElementById(‘menu-container’) akan menemukan
elemen yang tepat di saat init() dipanggil SETELAH patch.
============================================================ */

const Menu = (() => {

let _items = [];

/* Mock menu data — future: dari Firestore/API */
const MENU_LIST = [
{ id: ‘m1’, name: ‘Ayam Bakar’,  price: 25000 },
{ id: ‘m2’, name: ‘Nasi Goreng’, price: 20000 },
{ id: ‘m3’, name: ‘Mie Goreng’,  price: 18000 },
{ id: ‘m4’, name: ‘Es Teh’,      price: 5000  },
{ id: ‘m5’, name: ‘Jus Jeruk’,   price: 10000 }
];

function _formatRupiah(num) {
return ’Rp ’ + (Number(num) || 0).toLocaleString(‘id-ID’);
}

function _getMenuById(id) {
return MENU_LIST.find(function (m) { return m.id === id; }) || MENU_LIST[0];
}

/* –– container resolver ––
M6: Cari container dengan prioritas:
1. #menu-container (sudah di-alias oleh patchMenuBuilderIds)
2. #menu-builder (fallback jika patch belum jalan) */
function _getContainer() {
return document.getElementById(‘menu-container’) ||
document.getElementById(‘menu-builder’);
}

function _getAddBtn() {
return document.getElementById(‘btn-add-menu’);
}

/* –– render –– */

function _render() {
const container = _getContainer();
if (!container) return;

```
container.innerHTML = '';

if (!_items.length) {
  container.innerHTML = '<div style="font-size:0.75rem;color:var(--ink-3);padding:6px 0;">Belum ada item menu. Klik tambah untuk menambahkan.</div>';
}

_items.forEach(function (item) {
  const menu = _getMenuById(item.menuId);
  const row  = document.createElement('div');
  row.className = 'menu-row';
  row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';

  /* Buat select options */
  const options = MENU_LIST.map(function (m) {
    return '<option value="' + m.id + '"' + (m.id === item.menuId ? ' selected' : '') + '>' +
      m.name + ' - ' + _formatRupiah(m.price) + '</option>';
  }).join('');

  row.innerHTML =
    '<select class="input menu-select" style="flex:1;font-size:0.8rem;">' + options + '</select>' +
    '<input type="number" class="input qty" value="' + item.qty + '" min="1" ' +
      'style="width:60px;font-size:0.8rem;" />' +
    '<div class="price" style="font-size:0.75rem;color:var(--ink-2);min-width:80px;text-align:right;">' +
      _formatRupiah(menu.price * item.qty) +
    '</div>' +
    '<button type="button" class="btn-icon remove" style="color:var(--danger);">' +
      '<i class="fas fa-times"></i>' +
    '</button>';

  /* Events */
  row.querySelector('.menu-select').addEventListener('change', function (e) {
    item.menuId = e.target.value;
    _render();
  });

  row.querySelector('.qty').addEventListener('input', function (e) {
    const qty = parseInt(e.target.value, 10);
    item.qty = qty > 0 ? qty : 1;
    _render();
  });

  row.querySelector('.remove').addEventListener('click', function () {
    _items = _items.filter(function (i) { return i.id !== item.id; });
    _render();
  });

  container.appendChild(row);
});

/* Total */
const total = _items.reduce(function (sum, i) {
  const m = _getMenuById(i.menuId);
  return sum + (m.price * i.qty);
}, 0);

const totalEl = document.getElementById('menu-total');
if (totalEl) totalEl.textContent = _formatRupiah(total);
```

}

/* –– public API –– */

function addItem(data) {
data = data || {};
_items.push({
id:     Utils.generateId(),
menuId: data.menuId || MENU_LIST[0].id,
qty:    Number(data.qty) > 0 ? Number(data.qty) : 1
});
_render();
}

function reset() {
_items = [];
_render();
}

function getData() {
return _items.map(function (i) {
const menu = _getMenuById(i.menuId);
return {
menuId:   menu.id,
name:     menu.name,
price:    menu.price,
qty:      i.qty,
subtotal: menu.price * i.qty
};
});
}

function init() {
/* M6: addBtn ditemukan setelah patchMenuBuilderIds di app.js
membuat elemen #btn-add-menu di dalam container. */
const addBtn = _getAddBtn();
if (addBtn) {
addBtn.addEventListener(‘click’, function () {
addItem();
});
}

```
/* Tidak tambah default item agar form tampil bersih */
_render();

Logger.log('[Menu] initialized, container:', _getContainer() ? _getContainer().id : 'NOT FOUND');
```

}

return {
init,
reset,
getData,
addItem
};

})();

/* ============================================================
BAGIAN 16 — FILTER ENGINE
M11: Filter.init() hanya bind filter UI (search, status, date).
Tidak bind form submit. Terintegrasi dengan EventBridge
dari app.js melalui event ‘filter:changed’.
============================================================ */

const Filter = (() => {

let _keyword = ‘’;
let _status  = ‘all’;
let _date    = null;

function apply(list) {
return list.filter(function (item) {
if (_keyword) {
const k = _keyword.toLowerCase();
const match =
(item.name  && item.name.toLowerCase().includes(k)) ||
(item.phone && item.phone.includes(k));
if (!match) return false;
}
if (_status !== ‘all’ && item.status !== _status) return false;
if (_date && item.date !== _date) return false;
return true;
});
}

function setKeyword(val) { _keyword = String(val || ‘’).trim(); }
function setStatus(val)  { _status  = val || ‘all’; }
function setDate(val)    { _date    = val || null; }

function reset() {
_keyword = ‘’;
_status  = ‘all’;
_date    = null;
const searchEl = document.getElementById(‘detail-search’);
const statusEl = document.getElementById(‘filter-status’);
const dateEl   = document.getElementById(‘filter-date’);
if (searchEl) searchEl.value = ‘’;
if (statusEl) statusEl.value = ‘all’;
if (dateEl)   dateEl.value   = ‘’;
}

async function trigger() {
let list;
if (_date) {
list = await Reservation.getByDate(_date);
} else {
list = await Reservation.getAll();
}

```
const filtered = apply(list);
_render(filtered);
```

}

function _render(list) {
const container = document.getElementById(‘reservation-list’);
if (!container) return;

```
if (!list || !list.length) {
  container.innerHTML = UI.empty
    ? UI.empty('Tidak ada hasil', 'Coba ubah kata kunci atau filter')
    : '<div class="empty-state">Tidak ada hasil</div>';
  return;
}

container.innerHTML = '';
list.forEach(function (item) {
  /* Gunakan renderReservationCard dari UI jika tersedia */
  if (UI && UI.renderReservationCard) {
    container.appendChild(UI.renderReservationCard(item));
  }
});
```

}

function init() {
/* M11: Hanya bind filter input — bukan form submit */
const searchEl = document.getElementById(‘detail-search’);
const statusEl = document.getElementById(‘filter-status’);
const dateEl   = document.getElementById(‘filter-date’);

```
if (searchEl) {
  searchEl.addEventListener('input', Utils.debounce(function (e) {
    setKeyword(e.target.value);
    trigger();
  }, 250));
}

if (statusEl) {
  statusEl.addEventListener('change', function (e) {
    setStatus(e.target.value);
    trigger();
  });
}

if (dateEl) {
  dateEl.addEventListener('change', function (e) {
    setDate(e.target.value);
    trigger();
  });
}

/* Listen event dari EventBridge (app.js) */
document.addEventListener('filter:changed', function (e) {
  const payload = e.detail || {};
  setKeyword(payload.keyword || '');
  setStatus(payload.status  || 'all');
  setDate(payload.date      || '');
  trigger();
});

Logger.log('[Filter] initialized');
```

}

return {
init,
apply,
reset,
trigger,
setKeyword,
setStatus,
setDate
};

})();

/* ============================================================
BAGIAN 17 — NOTIFY (TOAST)
Kompatibel dengan window.Notify yang di-setup app.js.
Jika app.js sudah mendefinisikan window.Notify, modul ini
tidak akan overwrite (cek di akhir).
============================================================ */

const _NotifyLocal = (() => {

let _container = null;

function _initContainer() {
if (_container) return;
_container = document.createElement(‘div’);
_container.id = ‘toast-container-local’;
Object.assign(_container.style, {
position:       ‘fixed’,
bottom:         ‘20px’,
right:          ‘20px’,
zIndex:         ‘9998’,
display:        ‘flex’,
flexDirection:  ‘column’,
gap:            ‘8px’,
maxWidth:       ‘300px’
});
document.body.appendChild(_container);
}

function _create(message, type, duration) {
_initContainer();
duration = duration || 2500;

```
const colors = {
  success: { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e' },
  error:   { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444' },
  info:    { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' }
};

const c = colors[type] || colors.info;

const toast = document.createElement('div');
Object.assign(toast.style, {
  background:    c.bg,
  color:         c.text,
  padding:       '10px 14px',
  borderRadius:  '12px',
  fontSize:      '0.8rem',
  fontWeight:    '500',
  backdropFilter:'blur(6px)',
  transform:     'translateY(10px)',
  opacity:       '0',
  transition:    'all 0.2s ease',
  fontFamily:    'inherit'
});

toast.textContent = message;
_container.appendChild(toast);

requestAnimationFrame(function () {
  toast.style.transform = 'translateY(0)';
  toast.style.opacity   = '1';
});

setTimeout(function () {
  toast.style.opacity   = '0';
  toast.style.transform = 'translateY(10px)';
  setTimeout(function () { toast.remove(); }, 200);
}, duration);
```

}

return {
success: function (m) { _create(m, ‘success’); },
error:   function (m) { _create(m, ‘error’); },
info:    function (m) { _create(m, ‘info’); }
};

})();

/* Hanya set window.Notify jika app.js belum set NotifySafe */
if (typeof window.Notify === ‘undefined’) {
window.Notify = _NotifyLocal;
}

/* Ekspos Notify sebagai variabel lokal untuk modul ini */
const Notify = window.Notify;

/* ============================================================
BAGIAN 18 — ANALYTICS
============================================================ */

const Analytics = (() => {

function _activeOnly(list) {
return (list || []).filter(function (r) {
return r.status !== Reservation.STATUS.CANCELLED;
});
}

function _totalGuests(list) {
return (list || []).reduce(function (sum, r) {
return sum + (r.guests || 0);
}, 0);
}

function _occupancyRate(list) {
const guests = _totalGuests(list);
const max    = CONFIG.MAX_CAPACITY_PER_SLOT || 20;
if (!max) return 0;
return Math.min(100, Math.round((guests / max) * 100));
}

function _statusBreakdown(list) {
const result = { pending: 0, confirmed: 0, ongoing: 0, completed: 0, cancelled: 0 };
(list || []).forEach(function (r) {
if (result[r.status] !== undefined) result[r.status]++;
});
return result;
}

function _groupByDate(list) {
const map = {};
(list || []).forEach(function (r) {
if (!r.date) return;
if (!map[r.date]) map[r.date] = [];
map[r.date].push(r);
});
return map;
}

function _peakDay(list) {
const grouped = _groupByDate(list);
let max = 0;
let best = null;
Object.keys(grouped).forEach(function (date) {
const count = _activeOnly(grouped[date]).length;
if (count > max) { max = count; best = date; }
});
return best;
}

function dailyStats(list) {
const grouped = _groupByDate(list);
return Object.keys(grouped).map(function (date) {
const dayList = _activeOnly(grouped[date]);
return {
date:      date,
total:     dayList.length,
guests:    _totalGuests(dayList),
occupancy: _occupancyRate(dayList)
};
}).sort(function (a, b) { return a.date.localeCompare(b.date); });
}

async function getSummary() {
const list   = await Reservation.getAll();
const active = _activeOnly(list);
return {
totalReservations: active.length,
totalGuests:       _totalGuests(active),
occupancy:         _occupancyRate(active),
peakDay:           _peakDay(active),
status:            _statusBreakdown(list)
};
}

async function getDaily() {
const list = await Reservation.getAll();
return dailyStats(list);
}

return { getSummary, getDaily, dailyStats };

})();

/* ============================================================
BAGIAN 19 — BACKUP
============================================================ */

const Backup = (() => {

async function exportData() {
const data = await DB.getAllReservations();
const payload = {
app:        ‘PROSERVA’,
version:    1,
exportedAt: new Date().toISOString(),
data:       data
};

```
const blob = new Blob(
  [JSON.stringify(payload, null, 2)],
  { type: 'application/json' }
);
const url = URL.createObjectURL(blob);
const a   = document.createElement('a');
a.href     = url;
a.download = 'proserva-backup-' + Date.now() + '.json';
a.click();
URL.revokeObjectURL(url);

Notify.success('Backup berhasil diunduh');
```

}

function importFile(file) {
return new Promise(function (resolve, reject) {
const reader = new FileReader();
reader.onload = async function (e) {
try {
const json = JSON.parse(e.target.result);
if (!json || json.app !== ‘PROSERVA’) throw new Error(‘File backup tidak valid’);
if (!Array.isArray(json.data))        throw new Error(‘Format data tidak valid’);

```
      LocalDB.write(KEYS.reservations, json.data);
      STATE.reservationsCache = null;

      Notify.success('Data berhasil di-restore');
      if (typeof UI !== 'undefined' && UI.renderCalendar) await UI.renderCalendar();
      resolve(true);
    } catch (err) {
      Notify.error('File tidak valid: ' + (err.message || ''));
      reject(err);
    }
  };
  reader.readAsText(file);
});
```

}

function clearAll() {
if (!confirm(‘Hapus semua data? Tindakan ini tidak dapat dibatalkan.’)) return;
localStorage.removeItem(KEYS.reservations);
STATE.reservationsCache = null;
Notify.info(‘Semua data dihapus’);
setTimeout(function () { location.reload(); }, 1000);
}

function init() {
const exportBtn   = document.getElementById(‘btn-export’);
const importInput = document.getElementById(‘input-import’);
const clearBtn    = document.getElementById(‘btn-clear’);

```
if (exportBtn) {
  exportBtn.addEventListener('click', exportData);
}
if (importInput) {
  importInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) importFile(file);
  });
}
if (clearBtn) {
  clearBtn.addEventListener('click', clearAll);
}
```

}

return { init, exportData, importFile, clearAll };

})();

/* ============================================================
BAGIAN 20 — SETTINGS
============================================================ */

const Settings = (() => {

const DEFAULT = {
businessName:      ‘Restoran Saya’,
openTime:          ‘10:00’,
closeTime:         ‘22:00’,
maxCapacityPerDay: 50,
slotDuration:      60,
currency:          ‘IDR’,
enableWA:          true,
phoneNumber:       ‘’,
autoConfirm:       false
};

function get() {
try {
const raw = localStorage.getItem(KEYS.settings);
if (!raw) return Object.assign({}, DEFAULT);
return Object.assign({}, DEFAULT, JSON.parse(raw));
} catch (err) {
Logger.warn(’[Settings] parse error’, err);
return Object.assign({}, DEFAULT);
}
}

function save(data) {
const merged = Object.assign({}, DEFAULT, get(), data);
LocalDB.write(KEYS.settings, merged);
Notify.success(‘Pengaturan disimpan’);
/* Sync kapasitas ke CONFIG agar modul lain pakai nilai terbaru */
if (merged.maxCapacityPerDay) {
CONFIG.MAX_CAPACITY_PER_SLOT = merged.maxCapacityPerDay;
}
return merged;
}

function reset() {
localStorage.removeItem(KEYS.settings);
Notify.info(‘Pengaturan direset’);
return Object.assign({}, DEFAULT);
}

function isOpenNow() {
const s   = get();
const now = new Date();
const cur = now.getHours() * 60 + now.getMinutes();
const parseTime = function (t) {
const parts = String(t || ‘00:00’).split(’:’).map(Number);
return parts[0] * 60 + (parts[1] || 0);
};
return cur >= parseTime(s.openTime) && cur <= parseTime(s.closeTime);
}

function formatCurrency(value) {
const s = get();
try {
return new Intl.NumberFormat(‘id-ID’, {
style:    ‘currency’,
currency: s.currency || ‘IDR’
}).format(value);
} catch (err) {
return ’Rp ’ + Number(value).toLocaleString(‘id-ID’);
}
}

function applyToUI() {
const s      = get();
const nameEl = document.getElementById(‘biz-name’);
if (nameEl) nameEl.textContent = s.businessName;
/* Sync kapasitas ke CONFIG */
if (s.maxCapacityPerDay) {
CONFIG.MAX_CAPACITY_PER_SLOT = s.maxCapacityPerDay;
}
}

function init() {
applyToUI();

```
/* Bind settings form jika ada */
const form = document.getElementById('settings-form');
if (!form) return;

const s = get();
if (form.businessName)      form.businessName.value      = s.businessName;
if (form.openTime)          form.openTime.value          = s.openTime;
if (form.closeTime)         form.closeTime.value         = s.closeTime;
if (form.maxCapacityPerDay) form.maxCapacityPerDay.value = s.maxCapacityPerDay;
if (form.slotDuration)      form.slotDuration.value      = s.slotDuration;
if (form.phoneNumber)       form.phoneNumber.value       = s.phoneNumber;
if (form.enableWA)          form.enableWA.checked        = s.enableWA;
if (form.autoConfirm)       form.autoConfirm.checked     = s.autoConfirm;

form.addEventListener('submit', function (e) {
  e.preventDefault();
  try {
    const data = {
      businessName:      form.businessName      ? form.businessName.value.trim() : '',
      openTime:          form.openTime          ? form.openTime.value            : '',
      closeTime:         form.closeTime         ? form.closeTime.value           : '',
      maxCapacityPerDay: form.maxCapacityPerDay ? Number(form.maxCapacityPerDay.value) : 20,
      slotDuration:      form.slotDuration      ? Number(form.slotDuration.value) : 60,
      phoneNumber:       form.phoneNumber       ? form.phoneNumber.value.trim()  : '',
      enableWA:          form.enableWA          ? form.enableWA.checked          : true,
      autoConfirm:       form.autoConfirm       ? form.autoConfirm.checked       : false
    };
    if (!data.businessName) throw new Error('Nama bisnis wajib diisi');
    save(data);
    applyToUI();
  } catch (err) {
    Notify.error(err.message || 'Gagal menyimpan pengaturan');
  }
});

Logger.log('[Settings] initialized');
```

}

return { init, get, save, reset, isOpenNow, formatCurrency, applyToUI };

})();

/* ============================================================
BAGIAN 21 — SYNC LAYER
============================================================ */

const Sync = (() => {

function isFirebase() {
return CONFIG.DATA_MODE === ‘firebase’;
}

async function getAll()             { return DB.getAllReservations(); }
async function getByDate(date)      { return DB.getByDate(date); }
async function create(data)         { return DB.insertReservation(data); }
async function update(id, patch)    { return DB.updateReservation(id, patch); }
async function remove(id)           { return DB.deleteReservation(id); }

function subscribe(callback) {
if (isFirebase()) {
Logger.warn(’[Sync] Firebase realtime belum diaktifkan’);
return;
}
Events.on(‘reservation:changed’, callback);
}

function unsubscribe(callback) {
Events.off(‘reservation:changed’, callback);
}

async function syncNow() {
if (!isFirebase()) return;
Logger.warn(’[Sync] Firebase sync belum diimplementasikan’);
Notify.info(‘Sync Firebase belum aktif’);
}

function init() {
Logger.log(’[Sync] initialized | mode:’, CONFIG.DATA_MODE);
}

return {
init,
getAll,
getByDate,
create,
update,
remove,
subscribe,
unsubscribe,
syncNow
};

})();

/* ============================================================
VALIDASI AKHIR — pastikan semua modul yang dibutuhkan app.js
tersedia sebagai window globals sebelum app.js di-load.
============================================================ */

(function validateModules() {
const required = [
‘Logger’, ‘Utils’, ‘Events’, ‘DOM’, ‘STATE’, ‘KEYS’,
‘LocalDB’, ‘DB’, ‘Reservation’, ‘Calendar’, ‘UI’,
‘Form’, ‘Menu’, ‘Filter’, ‘Notify’, ‘Analytics’,
‘Backup’, ‘Settings’, ‘Sync’
];

const missing = required.filter(function (name) {
return typeof window[name] === ‘undefined’;
});

if (missing.length) {
console.error(’[Proserva] Modul belum tersedia:’, missing.join(’, ‘));
} else {
Logger.log(’[Proserva] Semua modul siap:’, required.length, ‘modul’);
}
})();