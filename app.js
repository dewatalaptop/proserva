'use strict';

/* ═══════════════════════════════════════════════════════════════
   PROSERVA  app.js  v6.0
   ───────────────────────────────────────────────────────────────
   CHANGELOG v6.0 (dari v5.5):
   · FIX #A  Reservasi dibaca dari Firestore (bukan hanya localStorage)
   · FIX #B  navMonth fetch bulan baru dari Firestore jika belum ada
   · FIX #C  selectDate async + loading state
   · FIX #D  guardWrite tidak auto-redirect ke paywall; hanya toast
   · FIX #E  saveRes validasi minAdvance
   · FIX #F  _updateAccountStatus .catch() untuk error handling
   · FIX #G  NOTIF.getPending hanya scan 7 hari cache memory, bukan allRes
   · FIX #H  loadAllResForAnalysis - fetch semua bulan dari Firestore
   · FIX #I  wzFinish pakai Promise.all (bukan sequential await)
   · FIX #J  buildAccentGrid + accent-grid element ada di HTML
   · FIX #K  applyAccent save jika belum ada di localStorage
   · FIX #L  doImport sync S.res ke Firestore
   ═══════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────────
   CONSTANTS & STORAGE KEYS
   ────────────────────────────────────────────────────────────── */
var K = {
  BIZ:    'psv_biz',
  MENUS:  'psv_menus',
  LOCS:   'psv_locs',
  RES:    'psv_res',       /* prefix; key lengkap: psv_res_YYYY-MM_UID */
  BC_MSG: 'psv_bc_msg',
  OPS:    'psv_ops',
  MSGS:   'psv_msgs',
  APPEAR: 'psv_appear',
  LOADED: 'psv_loaded_months' /* bulan-bulan yang sudah di-fetch dari Firestore */
};

var DEFAULT_CONF = [
  'Halo Kak *{nama}* 👋',
  '',
  'Konfirmasi reservasi di *{bisnis}*:',
  '',
  '📅 *Tanggal:* {tanggal}',
  '⏰ *Jam:* {jam}',
  '📍 *Tempat:* {tempat}',
  '👥 *Jumlah:* {jumlah} orang',
  '',
  '🍽 *Pesanan:* {menu}',
  '💰 *DP:* {dp}',
  '',
  'Mohon konfirmasi kehadiran ya! 😊'
].join('\n');

var DEFAULT_THANKS = [
  'Halo Kak *{nama}* 👋',
  '',
  'Terima kasih sudah berkunjung ke *{bisnis}*! 🙏',
  'Kami selalu menantikan kedatangan Kakak kembali! ✨',
  '',
  'Salam hangat,',
  '*Tim {bisnis}* ❤️'
].join('\n');

var MONTHS   = ['Januari','Februari','Maret','April','Mei','Juni',
                'Juli','Agustus','September','Oktober','November','Desember'];
var MONTHS_S = MONTHS.map(function (m) { return m.slice(0, 3); });
var DAYS     = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

/* ──────────────────────────────────────────────────────────────
   STATE GLOBAL
   ────────────────────────────────────────────────────────────── */
var _UID     = '';
var _ACCOUNT = null;

var S = {
  biz:     { name: 'Usaha Saya', type: 'restoran', tagline: '', logo: '🍽️' },
  menus:   {},
  locs:    {},
  /* res: cache per bulan. key = 'YYYY-MM', value = array reservasi */
  res:     {},
  /* Set bulan yang sudah di-fetch Firestore di sesi ini */
  loadedMonths: new Set(),
  month:   new Date().getMonth(),
  year:    new Date().getFullYear(),
  date:    null,
  bcList:  [],
  ops:     { openTime:'09:00', closeTime:'21:00', slotInterval:30,
             defaultDuration:120, bufferTime:15, minAdvance:2 },
  appear:  { accent:'orange', logo:'🍽️' },
  msgs:    { confirm: DEFAULT_CONF, thanks: DEFAULT_THANKS },
  wizData: { bizName:'', bizType:'restoran', locs:[], menus:[] }
};

/* ──────────────────────────────────────────────────────────────
   localStorage WRAPPER  (key di-prefix UID agar multi-user aman)
   ────────────────────────────────────────────────────────────── */
function _ckey(k) { return _UID ? k + '_' + _UID : k; }

var DB = {
  get: function (k, fallback) {
    try {
      var r = localStorage.getItem(_ckey(k));
      return r !== null ? JSON.parse(r) : (fallback !== undefined ? fallback : null);
    } catch (e) { return fallback !== undefined ? fallback : null; }
  },
  set: function (k, v) {
    try { localStorage.setItem(_ckey(k), JSON.stringify(v)); return true; }
    catch (e) { return false; }
  },
  del: function (k) {
    try { localStorage.removeItem(_ckey(k)); } catch (e) {}
  }
};

/* Baca satu bulan reservasi dari localStorage */
function _dbGetMonth(mk) {
  return DB.get(K.RES + '_' + mk, null);
}
/* Tulis satu bulan reservasi ke localStorage */
function _dbSetMonth(mk, arr) {
  DB.set(K.RES + '_' + mk, arr);
}

/* ──────────────────────────────────────────────────────────────
   SYNC INDICATOR
   ────────────────────────────────────────────────────────────── */
var _syncTimer = null;
function _showSync() {
  var el = document.getElementById('sync-indicator');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
}

/* ──────────────────────────────────────────────────────────────
   LOADING STATE HELPERS
   ────────────────────────────────────────────────────────────── */
function _setCalLoading(on) {
  var el  = document.getElementById('cal-loading');
  var gr  = document.getElementById('cal-days');
  if (el) el.style.display = on ? 'flex' : 'none';
  if (gr) gr.style.opacity  = on ? '0.3' : '1';
}

function _setDetailLoading(on) {
  var el   = document.getElementById('detail-loading');
  var list = document.getElementById('detail-list');
  if (el)   el.style.display   = on ? 'flex' : 'none';
  if (list) list.style.opacity  = on ? '0.3' : '1';
}

/* ──────────────────────────────────────────────────────────────
   READ-ONLY GUARD
   FIX #D: guardWrite tidak lagi auto-redirect ke paywall.
   Hanya tampilkan toast informatif - user tetap di halaman saat ini.
   ────────────────────────────────────────────────────────────── */
function isReadOnly() { return !!window._READ_ONLY; }

function guardWrite() {
  if (isReadOnly()) {
    showToast('Mode baca saja - upgrade untuk melanjutkan.', 'warning', 3500);
    return false;
  }
  return true;
}

/* ──────────────────────────────────────────────────────────────
   ACCOUNT / TRIAL LOGIC
   ────────────────────────────────────────────────────────────── */
async function loadAccount() {
  if (!_UID || !window._FB) return null;
  var fb = window._FB;
  try {
    var snap = await fb.getDoc(fb.doc(fb.db, 'users', _UID, 'config', 'account'));
    if (snap.exists()) {
      _ACCOUNT = snap.data();
    } else {
      /* User lama - beri trial 14 hari retroaktif */
      var now = Date.now();
      _ACCOUNT = {
        displayName: window._FBUSER.displayName || '',
        email:       window._FBUSER.email || '',
        createdAt:   now,
        trialEndsAt: now + (14 * 24 * 60 * 60 * 1000),
        status:      'trial',
        plan:        'free',
        paymentRef:  null
      };
      await fb.setDoc(fb.doc(fb.db, 'users', _UID, 'config', 'account'), _ACCOUNT);
    }
  } catch (e) {
    console.warn('[loadAccount]', e);
    _ACCOUNT = null;
  }
  return _ACCOUNT;
}

function evaluateAccountStatus() {
  if (!_ACCOUNT) return 'trial';
  var status = _ACCOUNT.status || 'trial';
  if (status === 'active')  return 'active';
  if (status === 'expired') return 'expired';
  if (status === 'trial') {
    if (Date.now() > (_ACCOUNT.trialEndsAt || 0)) {
      /* FIX #F: fire-and-forget dengan .catch() */
      _updateAccountStatus('expired')
        .catch(function (e) { console.warn('[evaluateAccountStatus] update expired failed:', e); });
      return 'expired';
    }
    return 'trial';
  }
  return 'trial';
}

function trialDaysLeft() {
  if (!_ACCOUNT || !_ACCOUNT.trialEndsAt) return 0;
  return Math.max(0, Math.ceil((_ACCOUNT.trialEndsAt - Date.now()) / 86400000));
}

async function _updateAccountStatus(newStatus, extra) {
  if (!_UID || !window._FB) return;
  var fb = window._FB;
  var update = Object.assign({ status: newStatus }, extra || {});
  await fb.setDoc(fb.doc(fb.db, 'users', _UID, 'config', 'account'), update, { merge: true });
  if (_ACCOUNT) Object.assign(_ACCOUNT, update);
}

function applyAccountUI(accountStatus) {
  var trialBanner    = document.getElementById('trial-banner');
  var readonlyBanner = document.getElementById('readonly-banner');
  var upgradeBtn     = document.getElementById('sb-upgrade-btn');
  var sbStatus       = document.getElementById('sb-account-status');
  var addResBtn      = document.getElementById('btn-add-res');
  var shell          = document.getElementById('app-shell');

  /* Reset */
  if (trialBanner)    trialBanner.style.display    = 'none';
  if (readonlyBanner) readonlyBanner.style.display  = 'none';
  if (upgradeBtn)     upgradeBtn.style.display      = 'none';
  if (addResBtn)      addResBtn.style.display       = 'flex';
  if (shell)          shell.classList.remove('has-banner');
  window._READ_ONLY = false;

  if (accountStatus === 'active') {
    if (sbStatus) {
      sbStatus.className = 'sb-status active';
      sbStatus.innerHTML = '<i class="fas fa-check-circle"></i> Pro Aktif';
    }
  } else if (accountStatus === 'trial') {
    var days = trialDaysLeft();
    if (sbStatus) {
      sbStatus.className = 'sb-status trial';
      sbStatus.innerHTML = '<i class="fas fa-clock"></i> Trial · ' + days + ' hari';
    }
    if (trialBanner) {
      trialBanner.style.display = 'flex';
      var txt = document.getElementById('trial-banner-text');
      if (txt) txt.textContent = days <= 1
        ? 'Trial kamu berakhir hari ini! Segera upgrade.'
        : 'Trial kamu berakhir dalam ' + days + ' hari.';
      if (shell) shell.classList.add('has-banner');
    }
    if (upgradeBtn) upgradeBtn.style.display = 'flex';
  } else { /* expired */
    window._READ_ONLY = true;
    if (sbStatus) {
      sbStatus.className = 'sb-status expired';
      sbStatus.innerHTML = '<i class="fas fa-lock"></i> Trial Berakhir';
    }
    if (readonlyBanner) {
      readonlyBanner.style.display = 'flex';
      if (shell) shell.classList.add('has-banner');
    }
    if (upgradeBtn) upgradeBtn.style.display = 'flex';
    if (addResBtn)  addResBtn.style.display  = 'none';
  }

  renderAccountStatusCard(accountStatus);
}

function renderAccountStatusCard(status) {
  var el = document.getElementById('account-status-display');
  if (!el || !_ACCOUNT) return;

  var map = {
    trial:   { icon:'fas fa-clock',        color:'#ea580c', label:'Trial' },
    active:  { icon:'fas fa-check-circle', color:'#059669', label:'Pro Aktif' },
    expired: { icon:'fas fa-lock',         color:'#dc2626', label:'Berakhir' }
  };
  var s = map[status] || map.trial;

  var extra = '';
  if (status === 'trial') {
    var d = trialDaysLeft();
    extra = '<div style="margin-top:5px;font-size:.78rem;color:var(--ink-4)">Berakhir: <strong style="color:var(--ink-2)">'
      + formatDateDisp(new Date(_ACCOUNT.trialEndsAt).toISOString().split('T')[0])
      + '</strong> · ' + d + ' hari lagi</div>';
  } else if (status === 'active') {
    extra = '<div style="margin-top:5px;font-size:.78rem;color:var(--ink-4)">Paket: <strong style="color:var(--ink-2)">'
      + (_ACCOUNT.plan === 'yearly' ? 'Pro Tahunan' : 'Pro Bulanan') + '</strong></div>';
  }

  el.innerHTML = '<div style="display:flex;align-items:center;gap:9px">'
    + '<i class="' + s.icon + '" style="color:' + s.color + ';font-size:1.1rem"></i>'
    + '<div><div style="font-weight:700;color:var(--ink);font-size:.9rem">Status: ' + s.label + '</div>'
    + extra + '</div></div>';

  var billing = document.getElementById('billing-section');
  if (billing) billing.style.display = status === 'active' ? 'none' : 'block';
  val('set-account-email', _ACCOUNT.email || (window._FBUSER ? window._FBUSER.email : ''));
}

/* ──────────────────────────────────────────────────────────────
   PAYMENT SUCCESS CALLBACK
   ────────────────────────────────────────────────────────────── */
window.onPaymentSuccess = async function (planType, midtransResult) {
  showToast('Pembayaran berhasil! Mengaktifkan akun...', 'success', 5000);
  var now         = Date.now();
  var activeUntil = now + (planType === 'yearly' ? 365 * 86400000 : 31 * 86400000);
  await _updateAccountStatus('active', {
    plan: planType, activeUntil, lastPaymentAt: now,
    paymentRef: midtransResult.order_id || null
  });
  window._READ_ONLY = false;
  applyAccountUI('active');
  showScreen('app');
  showToast('Akun berhasil diaktifkan! Selamat menggunakan Proserva 🎉', 'success', 5000);
};

/* ──────────────────────────────────────────────────────────────
   FIRESTORE - CONFIG HELPERS (biz, ops, msgs, menus, locs)
   ────────────────────────────────────────────────────────────── */
async function saveBizFS() {
  DB.set(K.BIZ, S.biz); _showSync();
  if (!_UID || !window._FB) return;
  try {
    var fb = window._FB;
    await fb.setDoc(fb.doc(fb.db, 'users', _UID, 'config', 'biz'), S.biz);
  } catch (e) { console.warn('[saveBizFS]', e); }
}

async function saveMenuFS(id, data) {
  S.menus[id] = data; DB.set(K.MENUS, S.menus); _showSync();
  if (!_UID || !window._FB) return;
  try {
    var fb = window._FB;
    await fb.setDoc(fb.doc(fb.db, 'users', _UID, 'menus', id), data);
  } catch (e) { console.warn('[saveMenuFS]', e); }
}

async function deleteMenuFS(id) {
  delete S.menus[id]; DB.set(K.MENUS, S.menus); _showSync();
  if (!_UID || !window._FB) return;
  try {
    var fb = window._FB;
    await fb.deleteDoc(fb.doc(fb.db, 'users', _UID, 'menus', id));
  } catch (e) { console.warn('[deleteMenuFS]', e); }
}

async function saveLocFS(id, data) {
  S.locs[id] = data; DB.set(K.LOCS, S.locs); _showSync();
  if (!_UID || !window._FB) return;
  try {
    var fb = window._FB;
    await fb.setDoc(fb.doc(fb.db, 'users', _UID, 'locations', id), data);
  } catch (e) { console.warn('[saveLocFS]', e); }
}

async function deleteLocFS(id) {
  delete S.locs[id]; DB.set(K.LOCS, S.locs); _showSync();
  if (!_UID || !window._FB) return;
  try {
    var fb = window._FB;
    await fb.deleteDoc(fb.doc(fb.db, 'users', _UID, 'locations', id));
  } catch (e) { console.warn('[deleteLocFS]', e); }
}

async function saveOpsFS() {
  DB.set(K.OPS, S.ops); _showSync();
  if (!_UID || !window._FB) return;
  try {
    var fb = window._FB;
    await fb.setDoc(fb.doc(fb.db, 'users', _UID, 'config', 'ops'), S.ops);
  } catch (e) { console.warn('[saveOpsFS]', e); }
}

async function saveMsgsFS() {
  DB.set(K.MSGS, S.msgs); _showSync();
  if (!_UID || !window._FB) return;
  try {
    var fb = window._FB;
    await fb.setDoc(fb.doc(fb.db, 'users', _UID, 'config', 'msgs'), S.msgs);
  } catch (e) { console.warn('[saveMsgsFS]', e); }
}

/* ──────────────────────────────────────────────────────────────
   FIRESTORE - RESERVASI (lazy load per bulan)

   Arsitektur:
   · S.res[mk]          = array reservasi bulan mk di memori
   · S.loadedMonths     = Set bulan yang sudah di-fetch Firestore
   · localStorage[psv_res_YYYY-MM_UID] = cache offline per bulan

   FIX #A #B #C: reservasi sekarang benar-benar dibaca dari Firestore
   ────────────────────────────────────────────────────────────── */

/**
 * Fetch satu bulan dari Firestore jika belum pernah di-fetch.
 * Return: true jika fetch dilakukan, false jika pakai cache.
 */
async function _fetchMonthFS(mk) {
  if (S.loadedMonths.has(mk)) return false;   /* sudah ada di memori */
  S.loadedMonths.add(mk);

  /* Coba localStorage dulu (offline-first) */
  var cached = _dbGetMonth(mk);
  if (cached !== null) {
    S.res[mk] = cached;
    /* Tetap fetch Firestore di background untuk sinkronisasi */
    _syncMonthFromFS(mk).catch(function (e) { console.warn('[_fetchMonthFS bg sync]', e); });
    return false;
  }

  /* Tidak ada cache - fetch dari Firestore */
  await _syncMonthFromFS(mk);
  return true;
}

/**
 * Ambil satu bulan dari Firestore dan update cache.
 */
async function _syncMonthFromFS(mk) {
  if (!_UID || !window._FB) return;
  var fb  = window._FB;
  try {
    var snap = await fb.getDocs(
      fb.collection(fb.db, 'users', _UID, 'reservations', mk, 'list')
    );
    var arr = [];
    snap.forEach(function (d) { arr.push(d.data()); });
    S.res[mk] = arr;
    _dbSetMonth(mk, arr);
  } catch (e) {
    console.warn('[_syncMonthFromFS] ' + mk, e);
    /* Kalau gagal, pastikan S.res[mk] minimal array kosong */
    if (!S.res[mk]) S.res[mk] = [];
  }
}

/**
 * Simpan reservasi ke Firestore + cache.
 */
async function saveResFS(r) {
  var mk  = r.date.substring(0, 7);
  if (!S.res[mk]) S.res[mk] = [];
  var idx = S.res[mk].findIndex(function (x) { return x.id === r.id; });
  if (idx >= 0) S.res[mk][idx] = r; else S.res[mk].push(r);
  _dbSetMonth(mk, S.res[mk]);
  _showSync();
  if (!_UID || !window._FB) return;
  try {
    var fb = window._FB;
    await fb.setDoc(
      fb.doc(fb.db, 'users', _UID, 'reservations', mk, 'list', r.id), r
    );
  } catch (e) { console.warn('[saveResFS]', e); }
}

/**
 * Hapus reservasi dari Firestore + cache.
 */
async function deleteResFS(r) {
  var mk = r.date ? r.date.substring(0, 7) : null;
  if (mk && S.res[mk]) {
    S.res[mk] = S.res[mk].filter(function (x) { return x.id !== r.id; });
    _dbSetMonth(mk, S.res[mk]);
  }
  _showSync();
  if (!_UID || !window._FB || !mk) return;
  try {
    var fb = window._FB;
    await fb.deleteDoc(
      fb.doc(fb.db, 'users', _UID, 'reservations', mk, 'list', r.id)
    );
  } catch (e) { console.warn('[deleteResFS]', e); }
}

/* ──────────────────────────────────────────────────────────────
   LOAD STATE (biz, ops, msgs, menus, locs)
   Reservasi TIDAK di-load di sini - lazy per bulan.
   ────────────────────────────────────────────────────────────── */
async function loadStateFS() {
  if (!_UID || !window._FB) { loadStateLocal(); return; }
  var fb = window._FB;
  try {
    /* Parallel fetch untuk semua config */
    var [bizSnap, opsSnap, msgsSnap, menuSnap, locSnap] = await Promise.all([
      fb.getDoc(fb.doc(fb.db, 'users', _UID, 'config', 'biz')),
      fb.getDoc(fb.doc(fb.db, 'users', _UID, 'config', 'ops')),
      fb.getDoc(fb.doc(fb.db, 'users', _UID, 'config', 'msgs')),
      fb.getDocs(fb.collection(fb.db, 'users', _UID, 'menus')),
      fb.getDocs(fb.collection(fb.db, 'users', _UID, 'locations'))
    ]);

    var opsDef = { openTime:'09:00', closeTime:'21:00', slotInterval:30,
                   defaultDuration:120, bufferTime:15, minAdvance:2 };

    S.biz   = bizSnap.exists()
      ? Object.assign({}, S.biz, bizSnap.data())
      : DB.get(K.BIZ, S.biz);

    S.ops   = opsSnap.exists()
      ? Object.assign(opsDef, opsSnap.data())
      : Object.assign(opsDef, DB.get(K.OPS, {}));

    S.msgs  = msgsSnap.exists()
      ? Object.assign({ confirm: DEFAULT_CONF, thanks: DEFAULT_THANKS }, msgsSnap.data())
      : Object.assign({ confirm: DEFAULT_CONF, thanks: DEFAULT_THANKS }, DB.get(K.MSGS, {}));

    S.menus = {};
    if (!menuSnap.empty) {
      menuSnap.forEach(function (d) { S.menus[d.id] = d.data(); });
    } else {
      S.menus = DB.get(K.MENUS, {});
    }

    S.locs  = {};
    if (!locSnap.empty) {
      locSnap.forEach(function (d) { S.locs[d.id] = d.data(); });
    } else {
      S.locs = DB.get(K.LOCS, {});
    }

    /* Tulis ke localStorage sebagai cache offline */
    DB.set(K.BIZ,   S.biz);
    DB.set(K.OPS,   S.ops);
    DB.set(K.MSGS,  S.msgs);
    DB.set(K.MENUS, S.menus);
    DB.set(K.LOCS,  S.locs);

  } catch (e) {
    console.warn('[loadStateFS] fallback ke local:', e);
    loadStateLocal();
  }

  S.appear = Object.assign({ accent:'orange', logo:'🍽️' }, DB.get(K.APPEAR, {}));
}

function loadStateLocal() {
  var opsDef = { openTime:'09:00', closeTime:'21:00', slotInterval:30,
                 defaultDuration:120, bufferTime:15, minAdvance:2 };
  S.biz    = DB.get(K.BIZ,   S.biz);
  S.menus  = DB.get(K.MENUS, {});
  S.locs   = DB.get(K.LOCS,  {});
  S.ops    = Object.assign(opsDef, DB.get(K.OPS, {}));
  S.msgs   = Object.assign({ confirm: DEFAULT_CONF, thanks: DEFAULT_THANKS }, DB.get(K.MSGS, {}));
  S.appear = Object.assign({ accent:'orange', logo:'🍽️' }, DB.get(K.APPEAR, {}));
}

/* ──────────────────────────────────────────────────────────────
   FIX #H  loadAllResForAnalysis
   Fetch semua bulan yang punya data dari Firestore.
   Dipanggil oleh tombol "Muat Semua" di view analisis.
   ────────────────────────────────────────────────────────────── */
window.loadAllResForAnalysis = async function () {
  var btn = document.getElementById('anl-load-all-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...'; }

  if (!_UID || !window._FB) {
    showToast('Perlu koneksi internet untuk memuat semua data.', 'warning');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> <span class="btn-label">Muat Semua</span>'; }
    return;
  }

  try {
    var fb    = window._FB;
    var snap  = await fb.getDocs(
      fb.collection(fb.db, 'users', _UID, 'reservations')
    );
    var months = [];
    snap.forEach(function (d) { months.push(d.id); });

    /* Fetch paralel semua bulan yang belum di-load */
    var needed = months.filter(function (mk) { return !S.loadedMonths.has(mk); });
    await Promise.all(needed.map(function (mk) { return _syncMonthFromFS(mk); }));

    showToast('Semua data berhasil dimuat (' + months.length + ' bulan).', 'success');
    /* Sembunyikan tombol - tidak perlu load lagi sesi ini */
    if (btn) btn.style.display = 'none';
    runAnalysis();
  } catch (e) {
    console.error('[loadAllResForAnalysis]', e);
    showToast('Gagal memuat data: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> <span class="btn-label">Muat Semua</span>'; }
  }
};

/* ──────────────────────────────────────────────────────────────
   showScreen - alias ke boot guard (FIX #9 dari v5.5)
   ────────────────────────────────────────────────────────────── */
var showScreen = window.showScreen;

/* ──────────────────────────────────────────────────────────────
   SIGN OUT
   ────────────────────────────────────────────────────────────── */
async function doSignOut() {
  if (!confirm('Yakin ingin keluar dari Proserva?')) return;
  if (window._FB) {
    try { await window._FB.signOut(window._FB.auth); } catch (e) { console.warn(e); }
  }
  _UID     = '';
  _ACCOUNT = null;
  window._FBUSER               = null;
  window._AUTH_PROCESSING      = false;
  window._AUTH_HANDLER_RUNNING = false;
  window._READ_ONLY            = false;
  window._NOTIF_STARTED        = false;
  S.res    = {};
  S.menus  = {};
  S.locs   = {};
  S.loadedMonths = new Set();
  showScreen('landing');
  showToast('Berhasil keluar. Sampai jumpa! 👋', 'info');
}

/* ──────────────────────────────────────────────────────────────
   _onAuthReady - ENTRY POINT UTAMA
   ────────────────────────────────────────────────────────────── */
window._onAuthReady = async function (user) {

  if (window._FB_UNCONFIGURED) {
    window._AUTH_PROCESSING = window._AUTH_HANDLER_RUNNING = false;
    showScreen('landing');
    return;
  }

  /* Tidak ada user - coba tunggu sebentar (mobile redirect) */
  if (!user) {
    for (var i = 0; i < 8; i++) {
      await new Promise(function (r) { setTimeout(r, 300); });
      if (window._FB && window._FB.auth && window._FB.auth.currentUser) {
        user = window._FB.auth.currentUser;
        break;
      }
    }
    if (!user) {
      window._AUTH_PROCESSING = window._AUTH_HANDLER_RUNNING = false;
      showScreen('landing');
      return;
    }
  }

  /* Tunggu Firebase module selesai init */
  for (var w = 0; !window._DONE_FS && w < 40; w++) {
    await new Promise(function (r) { setTimeout(r, 80); });
  }

  _UID           = user.uid;
  window._FBUSER = user;

  /* Update loading text */
  var lt = document.getElementById('loading-text');
  if (lt) lt.textContent = 'Memuat data bisnis...';

  /* Update sidebar user */
  var nameEl   = document.getElementById('sb-user-name');
  var emailEl  = document.getElementById('sb-user-email');
  var avatarEl = document.getElementById('sb-avatar-fallback');
  if (nameEl)  nameEl.textContent  = user.displayName || 'Pengguna';
  if (emailEl) emailEl.textContent = user.email || '';
  if (avatarEl) {
    if (user.photoURL) {
      var img = document.createElement('img');
      img.src = user.photoURL; img.className = 'sidebar-user-avatar'; img.alt = 'Avatar';
      avatarEl.innerHTML = ''; avatarEl.appendChild(img);
    } else {
      avatarEl.textContent = initials(user.displayName || user.email || '?');
    }
  }

  /* Load akun + config (parallel: akun & state) */
  await Promise.all([loadAccount(), loadStateFS()]);
  var accountStatus = evaluateAccountStatus();

  /* Apply accent */
  applyAccent(S.appear.accent || 'orange', false);

  /* Update dashboard header */
  var biz = S.biz.name || 'Usaha Saya';
  setText('cal-title',   'Dashboard - ' + biz);
  setText('cal-sub',     'Selamat datang kembali! Kelola reservasi dengan mudah.');
  setText('sb-biz-name', biz);

  /* Notif */
  if (!window._NOTIF_STARTED) {
    NOTIF.start();
    window._NOTIF_STARTED = true;
  }
  document.removeEventListener('click', closeNotifH);
  document.addEventListener('click', closeNotifH);

  loadSettingsForm();

  /* Reset flag SEBELUM routing */
  window._AUTH_PROCESSING = window._AUTH_HANDLER_RUNNING = false;

  /* Routing */
  if (accountStatus === 'expired') {
    showScreen('paywall');
    return;
  }

  if (!Object.keys(S.locs || {}).length) {
    showScreen('wizard');
    return;
  }

  showScreen('app');

  /* Lazy load bulan ini setelah app terlihat */
  requestAnimationFrame(async function () {
    applyAccountUI(accountStatus);
    await _renderCalendarWithLoad();
  });
};

/* ──────────────────────────────────────────────────────────────
   ACCENT & APPEARANCE
   FIX #J: buildAccentGrid mengisi elemen #accent-grid yang
           kini ada di HTML (settings > branding)
   FIX #K: applyAccent menyimpan ke localStorage jika belum ada
   ────────────────────────────────────────────────────────────── */
var ACCENT_MAP = {
  orange:  '#ea580c',
  blue:    '#2563eb',
  teal:    '#0d9488',
  violet:  '#7c3aed',
  rose:    '#e11d48',
  emerald: '#059669'
};

function applyAccent(a, save) {
  S.appear.accent = a;
  document.documentElement.setAttribute('data-accent', a);
  document.querySelectorAll('.accent-swatch').forEach(function (el) {
    el.classList.toggle('active', el.dataset.accent === a);
  });
  /* FIX #K: simpan jika save tidak eksplisit false ATAU belum pernah tersimpan */
  if (save !== false) {
    DB.set(K.APPEAR, S.appear);
  } else if (!DB.get(K.APPEAR, null)) {
    DB.set(K.APPEAR, S.appear);
  }
}

function pickEmoji(em) {
  S.appear.logo = em;
  document.querySelectorAll('.emoji-opt').forEach(function (el) {
    el.classList.toggle('active', el.dataset.emoji === em);
  });
}

function buildAccentGrid() {
  var g = document.getElementById('accent-grid');
  if (!g) return;
  var cur = S.appear.accent || 'orange';
  g.innerHTML = Object.entries(ACCENT_MAP).map(function (e) {
    var isActive = e[0] === cur;
    return '<div class="accent-swatch' + (isActive ? ' active' : '') + '"'
      + ' data-accent="' + e[0] + '"'
      + ' style="background:' + e[1] + '"'
      + ' onclick="applyAccent(\'' + e[0] + '\')"'
      + ' title="' + e[0] + '"'
      + ' role="radio" aria-checked="' + isActive + '"'
      + '></div>';
  }).join('');
}

var LOGO_EMOJIS = ['🍽️','☕','🏞️','🏡','🌿','🍃','🌾','🔥','⭐','🌸','🎋','🍜','🌺','🫕','🌊','⛰️','🎍','🤘'];

function buildEmojiGrid() {
  var g = document.getElementById('emoji-grid');
  if (!g) return;
  var cur = S.appear.logo || S.biz.logo || '🍽️';
  g.innerHTML = LOGO_EMOJIS.map(function (em) {
    return '<div class="emoji-opt' + (em === cur ? ' active' : '') + '"'
      + ' data-emoji="' + em + '"'
      + ' onclick="pickEmoji(\'' + em + '\')"'
      + '>' + em + '</div>';
  }).join('');
}

/* ──────────────────────────────────────────────────────────────
   NAVIGATION
   ────────────────────────────────────────────────────────────── */
var PAGE_NAMES = {
  calendar:  'Kalender',
  detail:    'Detail Reservasi',
  menus:     'Menu & Paket',
  locations: 'Lokasi',
  customers: 'Pelanggan',
  analysis:  'Analisis Bisnis',
  broadcast: 'Broadcast Promo',
  settings:  'Pengaturan'
};

function showView(name) {
  document.querySelectorAll('#content .view').forEach(function (v) {
    v.style.display = 'none'; v.classList.remove('active-view');
  });
  var t = document.getElementById('view-' + name);
  if (t) { t.style.display = 'block'; t.classList.add('active-view'); }

  document.querySelectorAll('.nav-item').forEach(function (n) {
    n.classList.toggle('active', n.dataset.view === name);
  });

  setText('topbar-page', PAGE_NAMES[name] || name);
  document.title = (PAGE_NAMES[name] || name) + ' - Proserva';

  var sb = document.getElementById('sidebar');
  if (sb && sb.classList.contains('open')) toggleSidebar();

  var addBtn = document.getElementById('btn-add-res');
  if (addBtn) addBtn.style.display = isReadOnly() ? 'none'
    : name === 'detail' ? 'none' : 'flex';

  /* Tombol load-all analisis: tampilkan jika data lokal mungkin tidak lengkap */
  var lBtn = document.getElementById('anl-load-all-btn');
  if (lBtn) lBtn.style.display = name === 'analysis' ? 'inline-flex' : 'none';

  var actions = {
    menus:     renderMenusTable,
    locations: renderLocsTable,
    customers: function () { renderCustomers(''); },
    analysis:  function () { setupAnlSelectors(); runAnalysis(); },
    broadcast: loadBcView,
    settings:  loadSettingsForm
  };
  if (actions[name]) actions[name]();
}

function showSettingsSection(id, el) {
  document.querySelectorAll('.settings-section').forEach(function (s) { s.classList.remove('active'); });
  document.querySelectorAll('.settings-nav-item').forEach(function (n) { n.classList.remove('active'); });
  var sec = document.getElementById('sec-' + id);
  if (sec) sec.classList.add('active');
  if (el)  el.classList.add('active');
}

function loadSettingsForm() {
  buildAccentGrid();
  buildEmojiGrid();
  val('set-biz-name',  S.biz.name    || '');
  val('set-tagline',   S.biz.tagline || '');
  selVal('set-biz-type', S.biz.type  || 'restoran');
  val('set-open',          S.ops.openTime        || '09:00');
  val('set-close',         S.ops.closeTime       || '21:00');
  selVal('set-slot-interval', String(S.ops.slotInterval || 30));
  val('set-duration',      S.ops.defaultDuration || 120);
  val('set-buffer',        S.ops.bufferTime      || 15);
  val('set-min-advance',   S.ops.minAdvance      || 2);
  val('set-wa-confirm',    S.msgs.confirm        || DEFAULT_CONF);
  val('set-wa-thanks',     S.msgs.thanks         || DEFAULT_THANKS);
  val('set-account-email', _ACCOUNT ? _ACCOUNT.email : (window._FBUSER ? window._FBUSER.email : ''));
  if (_ACCOUNT) renderAccountStatusCard(evaluateAccountStatus());
}

async function saveBranding() {
  if (!guardWrite()) return;
  S.biz.name    = gval('set-biz-name').trim() || 'Usaha Saya';
  S.biz.type    = gval('set-biz-type');
  S.biz.tagline = gval('set-tagline').trim();
  S.biz.logo    = S.appear.logo || '🍽️';
  await saveBizFS();
  setText('sb-biz-name', S.biz.name);
  setText('cal-title', 'Dashboard - ' + S.biz.name);
  showToast('Branding berhasil disimpan!', 'success');
}

async function saveOperational() {
  if (!guardWrite()) return;
  S.ops = {
    openTime:        gval('set-open')               || '09:00',
    closeTime:       gval('set-close')              || '21:00',
    slotInterval:    parseInt(gval('set-slot-interval')) || 30,
    defaultDuration: parseInt(gval('set-duration'))      || 120,
    bufferTime:      parseInt(gval('set-buffer'))         || 15,
    minAdvance:      parseInt(gval('set-min-advance'))    || 2
  };
  await saveOpsFS();
  showToast('Pengaturan operasional disimpan!', 'success');
}

async function saveMessages() {
  if (!guardWrite()) return;
  S.msgs.confirm = gval('set-wa-confirm');
  S.msgs.thanks  = gval('set-wa-thanks');
  await saveMsgsFS();
  showToast('Template pesan disimpan!', 'success');
}

/* ──────────────────────────────────────────────────────────────
   BOOT
   ────────────────────────────────────────────────────────────── */
function boot() {
  initModalClose();
  initKbd();
  var ov = document.getElementById('sidebar-overlay');
  if (ov) ov.onclick = toggleSidebar;
}

/* ──────────────────────────────────────────────────────────────
   DATA HELPERS
   ────────────────────────────────────────────────────────────── */
function mkKey(y, m)       { return y + '-' + pad2(m + 1); }
function getResMonth(y, m) { return S.res[mkKey(y, m)] || []; }
function getResDate(ds)    { var mk = ds.substring(0,7); return (S.res[mk]||[]).filter(function(r){return r.date===ds;}); }
function getAllRes()        { return Object.values(S.res).reduce(function(a,b){return a.concat(b);},[]); }
function findRes(id)       { for (var mk in S.res) { var r = S.res[mk].find(function(x){return x.id===id;}); if (r) return r; } return null; }
function getMenusSorted()  { return Object.entries(S.menus).map(function(e){return Object.assign({id:e[0]},e[1]);}).sort(function(a,b){return (a.name||'').localeCompare(b.name||'');}); }
function getLocsSorted()   { return Object.entries(S.locs).map(function(e){return Object.assign({id:e[0]},e[1]);}).sort(function(a,b){return (a.name||'').localeCompare(b.name||'');}); }
function getMenuByName(n)  { return Object.values(S.menus).find(function(m){return m.name===n;}) || null; }
function getLocByName(n)   { return Object.values(S.locs).find(function(l){return l.name===n;}) || null; }
function genId()           { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function toMins(t)         { if (!t) return 0; var p=t.split(':'); return parseInt(p[0])*60+parseInt(p[1]); }
function minsToTime(m)     { return pad2(Math.floor(m/60))+':'+pad2(m%60); }
function getEffectiveDuration(loc) { return (loc&&loc.defaultDuration?parseInt(loc.defaultDuration):0)||S.ops.defaultDuration||120; }
function getEffectiveBuffer(loc)   { var b=loc&&loc.bufferTime!==undefined&&loc.bufferTime!==''?parseInt(loc.bufferTime):-1; return b>=0?b:(S.ops.bufferTime||15); }

/* ──────────────────────────────────────────────────────────────
   CONFLICT & SLOT
   ────────────────────────────────────────────────────────────── */
function checkConflict(date, locName, jam, jumlah, durationOverride, excludeId) {
  if (!locName || !jam) return { ok:true, type:'none' };
  var loc      = getLocByName(locName);
  var duration = durationOverride ? parseInt(durationOverride) : getEffectiveDuration(loc);
  var buffer   = getEffectiveBuffer(loc);
  var capacity = loc ? parseInt(loc.capacity)||99 : 99;
  var pax      = parseInt(jumlah)||0;

  if (pax > capacity) return { ok:false, type:'hard_capacity',
    msg:'✗ Melebihi kapasitas (maks. ' + capacity + ' orang)' };

  var softWarn = pax>0 && pax>=capacity*0.8 && pax<=capacity;
  var newStart = toMins(jam), newEnd = newStart+duration+buffer;

  var existing = getResDate(date).filter(function(r){
    return r.tempat===locName && r.id!==excludeId && r.status!=='batal';
  });
  for (var i=0; i<existing.length; i++) {
    var r=existing[i];
    if (!r.jam) continue;
    var rDur=r.duration?parseInt(r.duration):getEffectiveDuration(loc);
    var rStart=toMins(r.jam), rEnd=rStart+rDur+buffer;
    if (newStart<rEnd && newEnd>rStart) return {
      ok:false, type:'hard_overlap',
      msg:'✗ Konflik dengan <strong>'+esc(r.nama)+'</strong> · '+r.jam+'-'+minsToTime(rStart+rDur)+' (+'+buffer+'m buffer)',
      conflictWith:r
    };
  }
  if (softWarn) return { ok:true, type:'soft_capacity',
    msg:'⚠ Kapasitas tersisa ' + (capacity-pax) + ' orang.' };
  return { ok:true, type:'none', msg:'✓ Tersedia · Selesai est. ' + minsToTime(newStart+duration) };
}

function findAvailableSlots(date, locName, excludeId) {
  var loc = getLocByName(locName);
  if (!loc) return [];
  var duration = getEffectiveDuration(loc);
  var buffer   = getEffectiveBuffer(loc);
  var interval = S.ops.slotInterval||30;
  var openM    = toMins(loc.openTime  ||S.ops.openTime  ||'09:00');
  var closeM   = toMins(loc.closeTime ||S.ops.closeTime ||'21:00');
  var busy = getResDate(date)
    .filter(function(r){return r.tempat===locName&&r.id!==excludeId&&r.status!=='batal';})
    .map(function(r){var s=toMins(r.jam),d=r.duration?parseInt(r.duration):duration;return{start:s,end:s+d+buffer};});
  var slots=[];
  for (var m=openM; m+duration<=closeM; m+=interval) {
    var free=true;
    for (var i=0;i<busy.length;i++){if(m<busy[i].end&&m+duration+buffer>busy[i].start){free=false;break;}}
    if (free) slots.push(minsToTime(m));
    if (slots.length>=6) break;
  }
  return slots;
}

function findAlternateLocs(date, jam, jumlah, excludeLoc, excludeId) {
  return getLocsSorted().filter(function(loc){
    if (loc.name===excludeLoc) return false;
    if ((parseInt(loc.capacity)||0)<(parseInt(jumlah)||0)) return false;
    var c=checkConflict(date,loc.name,jam,jumlah,null,excludeId);
    return c.ok && c.type!=='hard_capacity';
  }).map(function(loc){return{name:loc.name,cap:parseInt(loc.capacity)||0};});
}

function getDateAvailability(dateStr) {
  var locs=getLocsSorted();
  if (!locs.length) return 'free';
  var total=0,free=0,interval=S.ops.slotInterval||30;
  locs.forEach(function(loc){
    var openM=toMins(loc.openTime||S.ops.openTime||'09:00');
    var closeM=toMins(loc.closeTime||S.ops.closeTime||'21:00');
    total+=Math.max(1,Math.floor((closeM-openM)/interval));
    free+=findAvailableSlots(dateStr,loc.name,null).length;
  });
  return free===0?'full':free<total*0.5?'busy':'free';
}

/* ──────────────────────────────────────────────────────────────
   WIZARD
   FIX #I: wzFinish pakai Promise.all bukan sequential await
   ────────────────────────────────────────────────────────────── */
function wzNext(step) {
  if (step===2) {
    var n=gval('wz-biz-name').trim();
    if (!n){setText('wz-err-1','Nama usaha wajib diisi!');return;}
    setText('wz-err-1','');
    S.wizData.bizName=n; S.wizData.bizType=gval('wz-biz-type');
  }
  if (step===3){if(!S.wizData.locs.length){setText('wz-err-2','Tambah minimal 1 lokasi!');return;}setText('wz-err-2','');}
  if (step===1) setText('wz-err-1','');
  document.querySelectorAll('.wizard-step').forEach(function(s){s.style.display='none';s.classList.remove('active');});
  var next=document.getElementById('wz-'+step);
  if (next){next.style.display='flex';next.classList.add('active');}
  if (step===2) renderWzLocList();
  if (step===3) renderWzMenuList();
}

function renderWzLocList() {
  var el=document.getElementById('wz-loc-list');
  if (!el) return;
  if (!S.wizData.locs.length){el.innerHTML='<div class="wz-empty-hint">Belum ada lokasi - tambah minimal 1</div>';return;}
  el.innerHTML=S.wizData.locs.map(function(l,i){
    return '<div class="wz-list-item"><span><strong>'+esc(l.name)+'</strong> - '+l.capacity+' orang</span>'
      +'<button class="item-remove" onclick="wzRemove(\'loc\','+i+')"><i class="fas fa-times"></i></button></div>';
  }).join('');
}

function renderWzMenuList() {
  var el=document.getElementById('wz-menu-list');
  if (!el) return;
  el.innerHTML=S.wizData.menus.map(function(m,i){
    return '<div class="wz-list-item"><span><strong>'+esc(m.name)+'</strong> - Rp'+formatRp(m.price)+'</span>'
      +'<button class="item-remove" onclick="wzRemove(\'menu\','+i+')"><i class="fas fa-times"></i></button></div>';
  }).join('');
}

function wzRemove(type,idx){
  if (type==='loc'){S.wizData.locs.splice(idx,1);renderWzLocList();}
  else{S.wizData.menus.splice(idx,1);renderWzMenuList();}
}

function wzAddLoc(){
  var n=gval('wz-loc-name').trim(),c=parseInt(gval('wz-loc-cap'));
  if (!n||isNaN(c)||c<1){showToast('Isi nama dan kapasitas!','error');return;}
  if (S.wizData.locs.some(function(l){return l.name.toLowerCase()===n.toLowerCase();})){showToast('Nama sudah ada!','error');return;}
  S.wizData.locs.push({name:n,capacity:c});
  val('wz-loc-name','');val('wz-loc-cap','');
  renderWzLocList();
}

function wzAddMenu(){
  var n=gval('wz-menu-name').trim(),p=parseInt(gval('wz-menu-price'))||0;
  var d=gval('wz-menu-detail').split(',').map(function(s){return s.trim();}).filter(Boolean);
  if (!n){showToast('Isi nama menu!','error');return;}
  S.wizData.menus.push({name:n,price:p,details:d});
  val('wz-menu-name','');val('wz-menu-price','');val('wz-menu-detail','');
  renderWzMenuList();
}

async function wzFinish(){
  if (!S.wizData.bizName){showToast('Nama usaha belum diisi!','error');wzNext(1);return;}
  if (!S.wizData.locs.length){setText('wz-err-3','Minimal 1 lokasi harus ada!');return;}

  var btn=document.getElementById('wz-finish-btn');
  var backBtn=document.getElementById('wz-back-3');
  if (btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Menyimpan…';}
  if (backBtn) backBtn.disabled=true;
  setText('wz-err-3','');

  try {
    S.biz={name:S.wizData.bizName,type:S.wizData.bizType,tagline:'',logo:'🍽️'};
    await saveBizFS();

    /* FIX #I: simpan lokasi dan menu paralel (Promise.all) */
    var locTasks  = S.wizData.locs.map(function(l){
      return saveLocFS(genId(),{name:l.name,capacity:l.capacity,
        minGuests:1,defaultDuration:'',bufferTime:'',openTime:'',closeTime:''});
    });
    var menuTasks = S.wizData.menus.map(function(m){
      return saveMenuFS(genId(),{name:m.name,price:m.price,details:m.details});
    });
    await Promise.all(locTasks.concat(menuTasks));

    setText('cal-title','Dashboard - '+S.biz.name);
    setText('sb-biz-name',S.biz.name);

    if (!window._NOTIF_STARTED){NOTIF.start();window._NOTIF_STARTED=true;}
    document.removeEventListener('click',closeNotifH);
    document.addEventListener('click',closeNotifH);
    loadSettingsForm();

    showScreen('app');
    requestAnimationFrame(async function(){
      applyAccountUI(evaluateAccountStatus());
      await _renderCalendarWithLoad();
    });
    showToast('Selamat datang di Proserva! 🎉','success',4000);

  } catch(e) {
    setText('wz-err-3','Gagal menyimpan: '+e.message);
    if (btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-rocket"></i> Mulai Gunakan Proserva!';}
    if (backBtn) backBtn.disabled=false;
  }
}

/* ──────────────────────────────────────────────────────────────
   CALENDAR  (lazy load per bulan)

   _renderCalendarWithLoad() → fetch bulan jika belum ada → render
   navMonth()               → update S.month/year → load → render
   ────────────────────────────────────────────────────────────── */

/**
 * Render kalender bulan saat ini.
 * Jika bulan belum di-fetch Firestore, tampilkan loading dulu.
 * Fungsi ini dapat dipanggil sebagai window.renderCalendar.
 */
async function _renderCalendarWithLoad() {
  var mk = mkKey(S.year, S.month);
  _setCalLoading(true);
  try {
    await _fetchMonthFS(mk);
  } finally {
    _setCalLoading(false);
  }
  _renderCalendarSync();
}

/* Alias global agar enterReadOnlyMode di index.html bisa panggil */
window.renderCalendar = function () {
  _renderCalendarWithLoad().catch(function(e){ console.warn('[renderCalendar]',e); });
};

function _renderCalendarSync() {
  var m=S.month, y=S.year;
  setText('cal-month-label', MONTHS[m]+' '+y);
  var first=new Date(y,m,1).getDay(), days=new Date(y,m+1,0).getDate();
  var monthRes=getResMonth(y,m), counts={}, names={};

  monthRes.forEach(function(r){
    if (!r.date) return;
    var d=parseInt(r.date.split('-')[2]);
    counts[d]=(counts[d]||0)+1;
    if (!names[d]) names[d]=[];
    if (names[d].length<2) names[d].push(r.nama||'?');
  });

  var totalPax=monthRes.reduce(function(s,r){return s+(parseInt(r.jumlah)||0);},0);
  var totalDp =monthRes.reduce(function(s,r){return s+(parseInt(r.dp)||0);},0);
  var busiestDay='-';
  if (Object.keys(counts).length){
    var top=Object.entries(counts).sort(function(a,b){return b[1]-a[1];})[0];
    busiestDay=top[0]+' '+MONTHS_S[m];
  }

  setText('st-total',monthRes.length);
  setText('st-pax',  totalPax);
  setText('st-dp',   'Rp'+formatRpK(totalDp));
  setText('st-busy', busiestDay);

  var today=new Date(), calEl=document.getElementById('cal-days');
  if (!calEl) return;
  var html='';
  for (var i=0;i<first;i++) html+='<div class="cal-day empty"></div>';
  for (var d=1;d<=days;d++){
    var ds=buildDs(y,m+1,d);
    var isToday=today.getFullYear()===y&&today.getMonth()===m&&today.getDate()===d;
    var cnt=counts[d]||0, nms=names[d]||[];
    var avail=cnt>0?getDateAvailability(ds):'free';
    var ac=avail==='full'?'avail-full':avail==='busy'?'avail-busy':'avail-free';
    html+='<div class="cal-day'+(isToday?' today':'')+'" onclick="selectDate(\''+ds+'\')">'+
      '<div class="cal-day-num">'+d+'</div>'+
      (cnt?'<div class="cal-avail '+ac+'"></div>':'')+
      (cnt?'<div class="cal-res-pill"><i class="fas fa-calendar-check"></i> '+cnt+'</div>':'')+
      nms.map(function(n){return '<div class="cal-mini">'+esc(n)+'</div>';}).join('')+
      '</div>';
  }
  calEl.innerHTML=html;
}

/**
 * FIX #B: navMonth fetch bulan baru dari Firestore sebelum render
 */
async function navMonth(d) {
  S.month+=d;
  if (S.month<0){S.month=11;S.year--;}
  if (S.month>11){S.month=0;S.year++;}
  await _renderCalendarWithLoad();
}

function goToday(){
  var n=new Date(); S.month=n.getMonth(); S.year=n.getFullYear();
  _renderCalendarWithLoad();
}

/* ──────────────────────────────────────────────────────────────
   DETAIL VIEW
   FIX #C: selectDate async + loading state
   ────────────────────────────────────────────────────────────── */
async function selectDate(ds) {
  S.date=ds;
  var p=ds.split('-'), d=parseInt(p[2]), m=parseInt(p[1])-1;
  setText('detail-title', d+' '+MONTHS[m]+' '+p[0]);

  document.querySelectorAll('#content .view').forEach(function(v){v.style.display='none';v.classList.remove('active-view');});
  var dv=document.getElementById('view-detail');
  if (dv){dv.style.display='block';dv.classList.add('active-view');}
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});

  var addBtn=document.getElementById('btn-add-res');
  if (addBtn) addBtn.style.display=isReadOnly()?'none':'flex';
  setText('topbar-page','Detail Reservasi');

  /* Tampilkan loading saat fetch */
  _setDetailLoading(true);
  try {
    await _fetchMonthFS(ds.substring(0,7));
  } finally {
    _setDetailLoading(false);
  }

  renderAvailBar(ds);
  renderDetail(getResDate(ds));
  window.scrollTo({top:0,behavior:'smooth'});
}

function backToCal(){S.date=null;showView('calendar');_renderCalendarWithLoad();}

function renderAvailBar(ds){
  var bar=document.getElementById('avail-bar');
  if (!bar) return;
  var locs=getLocsSorted();
  if (!locs.length){bar.innerHTML='';return;}
  bar.innerHTML=locs.map(function(loc){
    var slots=findAvailableSlots(ds,loc.name,null),n=slots.length;
    var cls=n===0?'alb-full':n<3?'alb-busy':'alb-free';
    var dot=n===0?'#dc2626':n<3?'#d97706':'#059669';
    return '<div class="avail-loc-badge '+cls+'"><span class="dot" style="background:'+dot+'"></span>'+
      esc(loc.name)+' · '+(n?n+' slot':'Penuh')+'</div>';
  }).join('');
}

function renderDetail(list){
  var el=document.getElementById('detail-list');
  if (!el) return;
  if (!list||!list.length){
    el.innerHTML='<div class="empty-state"><div class="es-icon"><i class="fas fa-calendar-times"></i></div>'+
      '<div class="es-title">Belum ada reservasi</div>'+
      '<div class="es-sub">Klik <strong>Tambah</strong> untuk menambah reservasi baru</div></div>';
    return;
  }
  var sorted=list.slice().sort(function(a,b){return (a.jam||'').localeCompare(b.jam||'');});
  el.innerHTML=sorted.map(buildResCard).join('');
}

function filterDetail(q){
  if (!S.date) return;
  var all=getResDate(S.date),ql=q.toLowerCase();
  renderDetail(!q?all:all.filter(function(r){
    return (r.nama&&r.nama.toLowerCase().includes(ql))
        ||(r.tempat&&r.tempat.toLowerCase().includes(ql))
        ||(r.nomorHp&&r.nomorHp.includes(q))
        ||(Array.isArray(r.menus)&&r.menus.some(function(m){return m.name.toLowerCase().includes(ql);}));
  }));
}

var STATUS_LABELS={pending:'⏳ Pending',confirmed:'✅ Confirmed',selesai:'🎉 Selesai',batal:'❌ Batal'};
var STATUS_STRIPE={pending:'stripe-pending',confirmed:'stripe-confirmed',selesai:'stripe-selesai',batal:'stripe-batal'};
var STATUS_BADGE ={pending:'sb-pending',confirmed:'sb-confirmed',selesai:'sb-selesai',batal:'sb-batal'};

function buildResCard(r){
  var st=r.status||'pending';
  var loc=getLocByName(r.tempat);
  var dur=r.duration?parseInt(r.duration):getEffectiveDuration(loc);
  var endT=r.jam?minsToTime(toMins(r.jam)+dur):'?';

  var menuHtml=Array.isArray(r.menus)&&r.menus.length
    ?r.menus.map(function(item){
        var md=getMenuByName(item.name),det=(md&&md.details)||[];
        return '<div class="rc-menu-item"><strong>'+item.quantity+'x '+esc(item.name)+'</strong>'+
          (det.length?'<div class="rc-menu-sub">'+det.map(esc).join(' · ')+'</div>':'')+
          '</div>';
      }).join('')
    :'<div style="color:var(--ink-4);font-size:.8rem;font-style:italic">Tidak ada pesanan</div>';

  var chips='';
  if (r.nomorHp)  chips+='<div class="rc-info"><i class="fas fa-phone"></i>'+esc(r.nomorHp)+'</div>';
  if (r.dp>0)     chips+='<div class="rc-info"><i class="fas fa-money-bill-wave"></i>DP Rp'+formatRp(r.dp)+(r.tipeDp?' · '+esc(r.tipeDp):'')+' </div>';
  if (r.tambahan) chips+='<div class="rc-info"><i class="fas fa-comment-dots"></i>'+esc(r.tambahan)+'</div>';

  var thankBtn='';
  if (!isReadOnly()){
    thankBtn=r.nomorHp
      ?(r.thankYouSent
        ?'<button class="btn btn-success btn-sm" disabled><i class="fas fa-check-circle"></i> Terima Kasih Terkirim</button>'
        :'<button class="btn btn-secondary btn-sm" onclick="sendThankYou(\''+r.id+'\')"><i class="fas fa-gift"></i> Ucapan Terima Kasih</button>')
      :'';
  }

  var statusOpts=['pending','confirmed','selesai','batal'].map(function(s){
    return '<option value="'+s+'"'+(s===st?' selected':'')+'>'+STATUS_LABELS[s]+'</option>';
  }).join('');

  var footerHtml='';
  if (isReadOnly()){
    footerHtml='<div class="rc-footer"><span class="status-badge '+STATUS_BADGE[st]+'">'+STATUS_LABELS[st]+'</span>'+
      '<span style="font-size:.72rem;color:var(--ink-4);margin-left:auto"><i class="fas fa-lock"></i> Read Only</span></div>';
  } else {
    footerHtml='<div class="rc-footer">'+
      '<select class="form-select-sm" onchange="quickStatus(\''+r.id+'\',this.value)" style="font-size:.75rem;padding:5px 8px">'+statusOpts+'</select>'+
      (r.nomorHp?'<button class="btn btn-wa btn-sm" onclick="contactWA(\''+r.id+'\')"><i class="fab fa-whatsapp"></i> Hubungi</button>':'')+
      thankBtn+
      '<button class="btn btn-info btn-sm" onclick="openEditRes(\''+r.id+'\')"><i class="fas fa-edit"></i> Edit</button>'+
      '<button class="btn btn-danger btn-sm" onclick="delRes(\''+r.id+'\')"><i class="fas fa-trash-alt"></i></button>'+
      '</div>';
  }

  return '<div class="res-card" id="rcard-'+r.id+'">'+
    '<div class="rc-stripe '+STATUS_STRIPE[st]+'"></div>'+
    '<div class="rc-top"><div class="rc-name"><div class="rc-avatar" style="background:'+nameColor(r.nama||'?')+'">'+initials(r.nama||'?')+'</div><div class="rc-guest">'+esc(r.nama||'Tanpa Nama')+'</div></div>'+
    '<div class="rc-badges"><span class="badge badge-ac"><i class="far fa-clock"></i> '+esc(r.jam||'?')+'-'+endT+'</span>'+
    '<span class="badge badge-gray"><i class="fas fa-map-pin"></i> '+esc(r.tempat||'?')+'</span>'+
    '<span class="badge badge-g"><i class="fas fa-users"></i> '+esc(r.jumlah||'?')+' org</span>'+
    '<span class="status-badge '+STATUS_BADGE[st]+'">'+STATUS_LABELS[st]+'</span></div></div>'+
    '<div class="rc-body"><div class="rc-section">Pesanan</div>'+menuHtml+
    (chips?'<div style="margin-top:10px">'+chips+'</div>':'')+
    '</div>'+footerHtml+'</div>';
}

/* ──────────────────────────────────────────────────────────────
   RESERVATION MODAL
   FIX #E: saveRes validasi minAdvance
   ────────────────────────────────────────────────────────────── */
function openAddRes(){
  if (!guardWrite()) return;
  clearErrors();
  val('res-edit-id','');
  setHTML('res-modal-title','<i class="fas fa-calendar-plus"></i> Tambah Reservasi');
  ['res-nama','res-hp','res-tambahan'].forEach(function(id){val(id,'');});
  val('res-date',S.date||todayStr());
  val('res-jam','');val('res-jumlah','');val('res-dp','0');val('res-duration','');
  selVal('res-tipe-dp','');selVal('res-status','pending');
  setText('res-cap-hint','');setText('res-dur-hint','');
  populateLocSelect('res-tempat','');
  clearConflictUI();
  var mc=document.getElementById('res-menus-container');
  if (mc) mc.innerHTML='';
  addMenuRow('res-menus-container');
  openModal('modal-res');
}

function openEditRes(id){
  if (!guardWrite()) return;
  var r=findRes(id);
  if (!r){showToast('Tidak ditemukan!','error');return;}
  clearErrors();clearConflictUI();
  val('res-edit-id',id);
  setHTML('res-modal-title','<i class="fas fa-edit"></i> Edit Reservasi');
  val('res-nama',    r.nama    ||'');
  val('res-hp',      r.nomorHp ||'');
  val('res-date',    r.date    ||todayStr());
  val('res-jam',     r.jam     ||'');
  val('res-jumlah',  r.jumlah  ||'');
  val('res-dp',      r.dp      ||0);
  val('res-duration',r.duration||'');
  val('res-tambahan',r.tambahan||'');
  selVal('res-tipe-dp',r.tipeDp||'');
  selVal('res-status', r.status||'pending');
  populateLocSelect('res-tempat',r.tempat);
  onResFieldChange();
  var mc=document.getElementById('res-menus-container');
  if (mc){
    mc.innerHTML='';
    if (Array.isArray(r.menus)&&r.menus.length) r.menus.forEach(function(item){addMenuRow('res-menus-container',item.name,item.quantity);});
    else addMenuRow('res-menus-container');
  }
  openModal('modal-res');
}

function onResFieldChange(){
  var jam=gval('res-jam'),loc=gval('res-tempat'),pax=gval('res-jumlah'),dur=gval('res-duration'),editId=gval('res-edit-id');
  var locObj=getLocByName(loc);
  if (locObj){
    setText('res-cap-hint','Kapasitas: '+locObj.capacity+' orang'+(locObj.minGuests?' · Min. '+locObj.minGuests+' orang':''));
    setText('res-dur-hint','Durasi: '+(dur?parseInt(dur):getEffectiveDuration(locObj))+' menit');
  } else {setText('res-cap-hint','');setText('res-dur-hint','');}
  if (!loc||!jam){clearConflictUI();return;}
  var date=gval('res-date')||S.date||todayStr();
  showConflictUI(checkConflict(date,loc,jam,pax,dur||null,editId||null),date,loc,jam,pax,editId);
}

function clearConflictUI(){
  var ca=document.getElementById('conflict-alert');
  if (ca){ca.className='conflict-alert';ca.innerHTML='';}
  var ss=document.getElementById('slot-suggester');
  if (ss) ss.classList.remove('show');
  var sb=document.getElementById('btn-save-res');
  if (sb) sb.disabled=false;
}

function showConflictUI(result,date,loc,jam,pax,excludeId){
  var ca=document.getElementById('conflict-alert'),ss=document.getElementById('slot-suggester'),sb=document.getElementById('btn-save-res');
  if (!ca) return;
  if (result.type==='none'){
    ca.className='conflict-alert conflict-ok show';ca.innerHTML='<i class="fas fa-check-circle"></i> '+result.msg;
    ss.classList.remove('show');if(sb)sb.disabled=false;return;
  }
  if (result.type==='soft_capacity'){
    ca.className='conflict-alert conflict-soft show';ca.innerHTML='<i class="fas fa-exclamation-triangle"></i> '+result.msg;
    ss.classList.remove('show');if(sb)sb.disabled=false;return;
  }
  ca.className='conflict-alert conflict-hard show';ca.innerHTML='<i class="fas fa-times-circle"></i> '+result.msg;
  if(sb)sb.disabled=true;
  var html='',altSlots=findAvailableSlots(date,loc,excludeId);
  if (altSlots.length) html+='<div class="slot-section"><div class="slot-title">Slot tersedia di '+esc(loc)+':</div><div class="slot-list">'+altSlots.map(function(t){return '<div class="slot-chip" onclick="applySlot(\''+t+'\')">'+t+'</div>';}).join('')+'</div></div>';
  if (result.type==='hard_overlap'){
    var altLocs=findAlternateLocs(date,jam,pax,loc,excludeId);
    if (altLocs.length) html+='<div class="slot-section"><div class="slot-title">Lokasi lain tersedia:</div><div class="slot-list">'+altLocs.map(function(l){return '<div class="slot-chip" onclick="applyLoc(\''+esc(l.name)+'\')">'+esc(l.name)+' ('+l.cap+' org)</div>';}).join('')+'</div></div>';
  }
  if (html){document.getElementById('slot-content').innerHTML=html;ss.classList.add('show');}
  else ss.classList.remove('show');
}

function applySlot(t){val('res-jam',t);onResFieldChange();}
function applyLoc(n){var sel=document.getElementById('res-tempat');if(sel)sel.value=n;onResFieldChange();}

async function saveRes(){
  if (!guardWrite()) return;
  clearErrors();
  var nama=gval('res-nama').trim(),hp=gval('res-hp').trim();
  var jam=gval('res-jam'),jumlah=parseInt(gval('res-jumlah')),tempat=gval('res-tempat');
  var dp=parseInt(gval('res-dp'))||0,tipeDp=gval('res-tipe-dp');
  var tambahan=gval('res-tambahan').trim(),status=gval('res-status')||'pending';
  var duration=gval('res-duration'),editId=gval('res-edit-id');
  var resDate=gval('res-date')||S.date||todayStr();
  var valid=true;

  if (!nama)                 {showErr('err-nama','Nama wajib diisi');valid=false;}
  if (hp&&!validPhone(hp))   {showErr('err-hp','Nomor HP tidak valid');valid=false;}
  if (!resDate)              {showErr('err-date','Tanggal wajib diisi');valid=false;}
  if (!jam)                  {showErr('err-jam','Jam wajib diisi');valid=false;}
  if (!jumlah||jumlah<1)     {showErr('err-jumlah','Jumlah tamu minimal 1');valid=false;}
  if (!tempat)               {showErr('err-tempat','Lokasi wajib dipilih');valid=false;}

  /* FIX #E: validasi minAdvance */
  if (jam && resDate && !editId) {
    var resDatetime = new Date(resDate + 'T' + jam).getTime();
    var minMs       = (S.ops.minAdvance || 0) * 3600000;
    if (resDatetime - Date.now() < minMs) {
      showErr('err-jam', 'Minimal booking ' + (S.ops.minAdvance||0) + ' jam sebelumnya.');
      valid = false;
    }
  }

  if (tempat&&jam&&jumlah&&valid){
    var cr=checkConflict(resDate,tempat,jam,jumlah,duration||null,editId||null);
    if (!cr.ok&&cr.type!=='soft_capacity'){showErr('err-jam','Konflik jadwal - pilih jam atau lokasi lain');valid=false;}
  }

  var menus=[],usedN={},menuOk=true;
  document.querySelectorAll('#res-menus-container .menu-row').forEach(function(row){
    var sel=row.querySelector('select'),qtyEl=row.querySelector('input[type="number"]');
    if (!sel||!sel.value) return;
    var qty=parseInt(qtyEl?qtyEl.value:0);
    if (!qty||qty<1){showErr('err-menus','Jumlah menu min. 1');menuOk=false;return;}
    if (usedN[sel.value]){showErr('err-menus','Menu '+sel.value+' duplikat');menuOk=false;return;}
    usedN[sel.value]=true;
    menus.push({name:sel.value,quantity:qty});
  });
  if (!menuOk) valid=false;
  if (!valid) return;

  var btn=document.getElementById('btn-save-res');
  if (btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Menyimpan…';}
  try {
    var resObj;
    if (editId){
      var ex=findRes(editId);
      if (!ex){showToast('Tidak ditemukan!','error');return;}
      resObj=Object.assign({},ex,{nama,nomorHp:normPhone(hp),jam,jumlah,dp,tipeDp,tempat,tambahan,menus,status,duration:duration?parseInt(duration):null});
    } else {
      resObj={id:genId(),date:resDate,nama,nomorHp:normPhone(hp),jam,jumlah,dp,tipeDp,tempat,tambahan,menus,status,
              duration:duration?parseInt(duration):null,createdAt:Date.now(),thankYouSent:false};
    }
    await saveResFS(resObj);
    showToast(editId?'Reservasi diperbarui!':'Reservasi berhasil disimpan! 🎉','success');
    closeModal('modal-res');
    if (S.date&&S.date===resDate){renderDetail(getResDate(S.date));renderAvailBar(S.date);}
    else if (resDate) await selectDate(resDate);
    _renderCalendarSync();
  } catch(e){
    showToast('Gagal menyimpan: '+e.message,'error');
  } finally {
    if (btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Simpan';}
  }
}

async function quickStatus(id,newStatus){
  if (!guardWrite()) return;
  var r=findRes(id);if(!r)return;
  await saveResFS(Object.assign({},r,{status:newStatus}));
  showToast('Status diubah ke '+newStatus,'success',1800);
  if (S.date) renderDetail(getResDate(S.date));
  _renderCalendarSync();
}

async function delRes(id){
  if (!guardWrite()) return;
  var r=findRes(id);
  if (!confirm('Hapus reservasi untuk '+(r?r.nama:'ini')+'?')) return;
  await deleteResFS(r||{id:id,date:S.date||todayStr()});
  showToast('Reservasi dihapus','info');
  if (S.date){renderDetail(getResDate(S.date));renderAvailBar(S.date);}
  _renderCalendarSync();
}

function populateLocSelect(selId,selV){
  var sel=document.getElementById(selId);if(!sel)return;
  sel.innerHTML='<option value="">Pilih lokasi…</option>';
  getLocsSorted().forEach(function(loc){
    var opt=document.createElement('option');
    opt.value=loc.name;
    opt.textContent=loc.name+' (maks. '+loc.capacity+' org)';
    if (loc.name===selV) opt.selected=true;
    sel.appendChild(opt);
  });
}

function addMenuRow(cId,menuName,qty){
  menuName=menuName||'';qty=qty||1;
  var c=document.getElementById(cId);if(!c)return;
  var menus=getMenusSorted();
  if (!menus.length){
    c.innerHTML='<div style="padding:12px;text-align:center;color:var(--ink-4);font-size:.82rem">Belum ada menu. <span onclick="showView(\'menus\')" style="color:var(--ac);cursor:pointer">Tambah dulu</span></div>';
    return;
  }
  var opts=menus.map(function(m){
    return '<option value="'+esc(m.name)+'"'+(m.name===menuName?' selected':'')+'>'+esc(m.name)+(m.price?' - Rp'+formatRp(m.price):'')+' </option>';
  }).join('');
  var div=document.createElement('div');
  div.className='menu-row';
  div.innerHTML='<select class="form-select" onchange="updateMrPrice(this)"><option value="">Pilih menu…</option>'+opts+'</select>'+
    '<input type="number" class="form-input mr-qty" value="'+qty+'" min="1"/>'+
    '<span class="mr-price"></span>'+
    '<button class="mr-del" onclick="this.closest(\'.menu-row\').remove()" title="Hapus"><i class="fas fa-times"></i></button>';
  c.appendChild(div);
  if (menuName) updateMrPrice(div.querySelector('select'));
}

function updateMrPrice(sel){
  var row=sel.closest('.menu-row');if(!row)return;
  var m=getMenuByName(sel.value),pr=row.querySelector('.mr-price');
  if (pr) pr.textContent=(m&&m.price?'Rp'+formatRp(m.price):'');
}

/* ──────────────────────────────────────────────────────────────
   MENUS & LOCATIONS
   ────────────────────────────────────────────────────────────── */
function renderMenusTable(){
  var tbody=document.getElementById('menus-tbody');if(!tbody)return;
  var menus=getMenusSorted();
  if (!menus.length){tbody.innerHTML='<tr><td colspan="4" style="text-align:center;padding:36px;color:var(--ink-4)"><div style="font-size:2rem;margin-bottom:10px">🍽️</div><div style="font-weight:600">Belum ada menu</div></td></tr>';return;}
  tbody.innerHTML=menus.map(function(m){
    var editBtn=isReadOnly()?''
      :'<button class="btn btn-info btn-sm" onclick="openMenuModal(\''+m.id+'\')"><i class="fas fa-edit"></i></button>'+
        '<button class="btn btn-danger btn-sm" onclick="doDeleteMenu(\''+m.id+'\')"><i class="fas fa-trash-alt"></i></button>';
    return '<tr><td><strong>'+esc(m.name)+'</strong></td>'+
      '<td>'+(m.price?'<span class="badge badge-ac">Rp '+formatRp(m.price)+'</span>':'<span class="badge badge-gray">Gratis</span>')+'</td>'+
      '<td><span style="font-size:.8rem;color:var(--ink-3)">'+(m.details&&m.details.length?m.details.map(esc).join(', '):'-')+'</span></td>'+
      '<td><div style="display:flex;gap:5px">'+editBtn+'</div></td></tr>';
  }).join('');
}

function openMenuModal(editId){
  if (!guardWrite()) return;
  editId=editId||null;
  val('menu-edit-id',editId||'');
  if (editId&&S.menus[editId]){
    var m=S.menus[editId];
    setHTML('menu-modal-title','<i class="fas fa-edit"></i> Edit Menu');
    val('menu-name',m.name);val('menu-price',m.price||'');val('menu-details',(m.details||[]).join(', '));
  } else {
    setHTML('menu-modal-title','<i class="fas fa-utensils"></i> Tambah Menu');
    val('menu-name','');val('menu-price','');val('menu-details','');
  }
  openModal('modal-menu');
}

async function saveMenu(){
  if (!guardWrite()) return;
  var name=gval('menu-name').trim(),price=parseInt(gval('menu-price'))||0;
  var details=gval('menu-details').split(',').map(function(s){return s.trim();}).filter(Boolean);
  var editId=gval('menu-edit-id');
  if (!name){showToast('Nama menu wajib!','error');return;}
  if (Object.entries(S.menus).some(function(e){return e[1].name.toLowerCase()===name.toLowerCase()&&e[0]!==editId;})){showToast('Nama sudah ada!','error');return;}
  await saveMenuFS(editId||genId(),{name,price,details});
  renderMenusTable();closeModal('modal-menu');
  showToast('Menu "'+name+'" disimpan!','success');
}

async function doDeleteMenu(id){
  if (!guardWrite()) return;
  var n=S.menus[id]?S.menus[id].name:'menu ini';
  if (!confirm('Hapus menu "'+n+'"?')) return;
  await deleteMenuFS(id);renderMenusTable();
  showToast('Menu dihapus','info');
}

function renderLocsTable(){
  var tbody=document.getElementById('locations-tbody');if(!tbody)return;
  var locs=getLocsSorted();
  if (!locs.length){tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:36px;color:var(--ink-4)"><div style="font-size:2rem;margin-bottom:10px">📍</div><div style="font-weight:600">Belum ada lokasi</div></td></tr>';return;}
  tbody.innerHTML=locs.map(function(l){
    var dur=l.defaultDuration?l.defaultDuration+'m':'Global ('+S.ops.defaultDuration+'m)';
    var buf=(l.bufferTime!==undefined&&l.bufferTime!=='')?l.bufferTime+'m':'Global ('+S.ops.bufferTime+'m)';
    var jam=(l.openTime||S.ops.openTime||'09:00')+' - '+(l.closeTime||S.ops.closeTime||'21:00');
    var editBtn=isReadOnly()?''
      :'<button class="btn btn-info btn-sm" onclick="openLocModal(\''+l.id+'\')"><i class="fas fa-edit"></i></button>'+
        '<button class="btn btn-danger btn-sm" onclick="doDeleteLoc(\''+l.id+'\')"><i class="fas fa-trash-alt"></i></button>';
    return '<tr><td><strong>'+esc(l.name)+'</strong></td>'+
      '<td><span class="badge badge-b"><i class="fas fa-users"></i> '+l.capacity+'</span></td>'+
      '<td>'+(l.minGuests||1)+'</td><td>'+dur+'</td><td>'+buf+'</td>'+
      '<td style="font-size:.8rem;color:var(--ink-3)">'+jam+'</td>'+
      '<td><div style="display:flex;gap:5px">'+editBtn+'</div></td></tr>';
  }).join('');
}

function openLocModal(editId){
  if (!guardWrite()) return;
  editId=editId||null;
  val('loc-edit-id',editId||'');
  if (editId&&S.locs[editId]){
    var l=S.locs[editId];
    setHTML('loc-modal-title','<i class="fas fa-edit"></i> Edit Lokasi');
    val('loc-name',l.name);val('loc-capacity',l.capacity);val('loc-min',l.minGuests||'');
    val('loc-duration',l.defaultDuration||'');val('loc-buffer',l.bufferTime!==undefined?l.bufferTime:'');
    val('loc-open',l.openTime||'');val('loc-close',l.closeTime||'');
  } else {
    setHTML('loc-modal-title','<i class="fas fa-map-marker-alt"></i> Tambah Lokasi');
    ['loc-name','loc-capacity','loc-min','loc-duration','loc-buffer','loc-open','loc-close'].forEach(function(id){val(id,'');});
  }
  openModal('modal-loc');
}

async function saveLoc(){
  if (!guardWrite()) return;
  var name=gval('loc-name').trim(),cap=parseInt(gval('loc-capacity')),editId=gval('loc-edit-id');
  if (!name){showToast('Nama lokasi wajib!','error');return;}
  if (!cap||cap<1){showToast('Kapasitas minimal 1!','error');return;}
  if (Object.entries(S.locs).some(function(e){return e[1].name.toLowerCase()===name.toLowerCase()&&e[0]!==editId;})){showToast('Nama sudah ada!','error');return;}
  var data={name,capacity:cap,minGuests:parseInt(gval('loc-min'))||1,
    defaultDuration:gval('loc-duration')?parseInt(gval('loc-duration')):'',
    bufferTime:gval('loc-buffer')!==''?parseInt(gval('loc-buffer')):'',
    openTime:gval('loc-open'),closeTime:gval('loc-close')};
  await saveLocFS(editId||genId(),data);
  renderLocsTable();closeModal('modal-loc');
  showToast('Lokasi "'+name+'" disimpan!','success');
}

async function doDeleteLoc(id){
  if (!guardWrite()) return;
  if (!confirm('Hapus lokasi "'+(S.locs[id]?S.locs[id].name:'ini')+'"?')) return;
  await deleteLocFS(id);renderLocsTable();
  showToast('Lokasi dihapus','info');
}

/* ──────────────────────────────────────────────────────────────
   CUSTOMERS
   ────────────────────────────────────────────────────────────── */
function buildCustomers(){
  var map={};
  getAllRes().forEach(function(r){
    var k=r.nomorHp||('_np_'+(r.nama||'').toLowerCase().trim());
    if (!map[k]) map[k]={nama:r.nama||'Tanpa Nama',nomorHp:r.nomorHp||null,count:0,lastDate:''};
    map[k].count++;
    if (!map[k].lastDate||r.date>map[k].lastDate) map[k].lastDate=r.date;
  });
  return Object.values(map).sort(function(a,b){return a.nama.localeCompare(b.nama);});
}

function renderCustomers(filter){
  var tbody=document.getElementById('customers-tbody');if(!tbody)return;
  var list=buildCustomers();
  if (filter){var fl=filter.toLowerCase();list=list.filter(function(c){return c.nama.toLowerCase().includes(fl)||(c.nomorHp&&c.nomorHp.includes(filter));});}
  if (!list.length){tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--ink-4)">'+(filter?'Tidak ada hasil.':'Belum ada pelanggan.')+'</td></tr>';return;}
  tbody.innerHTML=list.map(function(c){
    var waBtn=(!isReadOnly()&&c.nomorHp)?'<button class="btn btn-wa btn-sm" onclick="custWA(\''+esc(c.nomorHp)+'\',\''+esc(c.nama)+'\')"><i class="fab fa-whatsapp"></i> Hubungi</button>':'-';
    return '<tr><td><div style="display:flex;align-items:center;gap:9px"><div style="width:30px;height:30px;border-radius:50%;background:'+nameColor(c.nama)+';color:#fff;font-size:.7rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+initials(c.nama)+'</div><strong>'+esc(c.nama)+'</strong></div></td>'+
      '<td>'+(c.nomorHp?'<span class="badge badge-gray">'+esc(c.nomorHp)+'</span>':'-')+'</td>'+
      '<td><span class="badge badge-ac">'+c.count+'x</span></td>'+
      '<td>'+(c.lastDate?formatDateDisp(c.lastDate):'-')+'</td>'+
      '<td>'+waBtn+'</td></tr>';
  }).join('');
}

function filterCustomers(q){renderCustomers(q);}

function custWA(phone,name){
  openWA(phone,'Halo Kak *'+name+'* 👋\n\nKami dari *'+S.biz.name+'* ingin menyapa. Terima kasih sudah berkunjung! 😊');
}

function openWA(phone,msg){
  if (!phone) return;
  var url='https://wa.me/'+normPhone(phone)+'?text='+encodeURIComponent(msg);
  var win=window.open(url,'_blank');
  if (!win) location.href=url;
}

function contactWA(id){
  var r=findRes(id);
  if (!r||!r.nomorHp){showToast('Nomor HP tidak ada','error');return;}
  openWA(r.nomorHp,buildConfMsg(r));
}

async function sendThankYou(id){
  if (!guardWrite()) return;
  var r=findRes(id);
  if (!r||!r.nomorHp){showToast('Nomor HP tidak ada','error');return;}
  openWA(r.nomorHp,buildThanksMsg(r));
  await saveResFS(Object.assign({},r,{thankYouSent:true}));
  showToast('Ucapan terima kasih dikirim! 🎉','success');
  var card=document.getElementById('rcard-'+id);
  if (card){
    var btn=card.querySelector('[onclick*="sendThankYou"]');
    if (btn) btn.outerHTML='<button class="btn btn-success btn-sm" disabled><i class="fas fa-check-circle"></i> Terima Kasih Terkirim</button>';
  }
  NOTIF.render();
}

function shareWA(scope){
  if (scope==='day'&&S.date){
    var res=getResDate(S.date).slice().sort(function(a,b){return (a.jam||'').localeCompare(b.jam||'');});
    window.open('https://wa.me/?text='+encodeURIComponent(buildDailyMsg(S.date,res)),'_blank','noopener');
  }
}

function buildConfMsg(r){
  var menuList='*(tidak ada)*';
  if (Array.isArray(r.menus)&&r.menus.length) menuList=r.menus.map(function(i){return '  • *'+i.quantity+'x '+i.name+'*';}).join('\n');
  return 'Halo Kak *'+r.nama+'* 👋\n\nKonfirmasi reservasi di *'+S.biz.name+'*:\n\n📅 *Tanggal:* '+formatDateFull(r.date)+
    '\n⏰ *Jam:* '+r.jam+'\n📍 *Tempat:* '+r.tempat+'\n👥 *Jumlah:* '+r.jumlah+' orang\n\n🍽 *Pesanan:*\n'+menuList+'\n\n'+
    (parseInt(r.dp)>0?'💰 *DP:* Rp'+formatRp(r.dp)+(r.tipeDp?' via '+r.tipeDp:'')+'\n\n':'')+
    (r.tambahan?'📝 *Catatan:* '+r.tambahan+'\n\n':'')+
    'Mohon konfirmasi kehadiran ya! 😊';
}

function buildThanksMsg(r){
  return 'Halo Kak *'+r.nama+'* 👋\n\nTerima kasih telah berkunjung ke *'+S.biz.name+'*! 🙏\n\nSemoga pengalaman bersama kami menyenangkan. Kami selalu menantikan kedatangan Kakak kembali! ✨\n\nSalam hangat,\n*Tim '+S.biz.name+'* ❤️';
}

function buildDailyMsg(dateStr,res){
  var msg='*📋 LAPORAN RESERVASI*\n*'+S.biz.name+'*\n\n📅 '+formatDateFull(dateStr)+'\n'+'─'.repeat(22)+'\n\n';
  if (!res.length) return msg+'*Tidak ada reservasi.*';
  res.forEach(function(r,i){
    var ml=Array.isArray(r.menus)&&r.menus.length?r.menus.map(function(m){return '  • '+m.quantity+'x '+m.name;}).join('\n'):'*(tidak ada)*';
    msg+='*'+(i+1)+'. '+r.nama+'*\n⏰ '+r.jam+' | 📍 '+r.tempat+' | 👥 '+r.jumlah+' orang\n🍽 Pesanan:\n'+ml+'\n'+
      (parseInt(r.dp)>0?'💰 DP: Rp'+formatRp(r.dp)+'\n':'')+
      (r.tambahan?'📝 '+r.tambahan+'\n':'')+'\n';
  });
  return msg.trimEnd();
}

/* ──────────────────────────────────────────────────────────────
   NOTIF
   FIX #G: getPending hanya scan bulan yang sudah di-cache memori,
   bukan seluruh Firestore. Cukup 7 hari ke belakang.
   ────────────────────────────────────────────────────────────── */
var NOTIF = {
  handle: null,
  getPending: function () {
    var now    = Date.now();
    var cutoff = new Date(now - 7 * 86400000).toISOString().split('T')[0];
    var today  = todayStr();
    /* Hanya scan bulan yang sudah ada di memori */
    var recent = [];
    Object.keys(S.res).forEach(function (mk) {
      if (mk >= cutoff.substring(0,7)) {
        S.res[mk].forEach(function (r) { recent.push(r); });
      }
    });
    return recent.filter(function (r) {
      if (!r.date||r.date<cutoff||r.date>today) return false;
      if (r.thankYouSent||!r.nomorHp||!r.jam)   return false;
      return now > new Date(r.date+'T'+r.jam).getTime() + 3*3600000;
    });
  },
  render: function () {
    var p=this.getPending(), dot=document.getElementById('notif-dot'), listEl=document.getElementById('notif-list');
    if (!dot||!listEl) return;
    if (!p.length){
      dot.style.display='none';
      listEl.innerHTML='<div class="nd-empty"><i class="fas fa-check-circle" style="color:var(--success);font-size:1.3rem;display:block;margin-bottom:6px"></i>Semua beres!</div>';
      return;
    }
    dot.style.display='block';
    listEl.innerHTML=p.map(function(r){
      return '<div class="notif-item"><div class="ni-name">'+esc(r.nama)+'</div><div class="ni-date">'+formatDateDisp(r.date)+' · '+r.jam+'</div>'+
        (isReadOnly()?'':'<button class="btn btn-wa btn-sm" style="width:100%;margin-top:6px" onclick="sendThankYou(\''+r.id+'\')"><i class="fab fa-whatsapp"></i> Kirim Ucapan Terima Kasih</button>')+
        '</div>';
    }).join('');
  },
  start: function () {
    var self=this;self.render();
    if (self.handle) clearInterval(self.handle);
    self.handle=setInterval(function(){if(!document.hidden)self.render();},5*60*1000);
  }
};

function toggleNotif(e){
  if (e) e.stopPropagation();
  var nd=document.getElementById('notif-dd');
  if (nd) nd.classList.toggle('open');
}

function closeNotifH(e){
  var nd=document.getElementById('notif-dd'),btn=document.getElementById('notif-btn');
  if (!nd) return;
  if (nd.contains(e.target)||(btn&&btn.contains(e.target))) return;
  nd.classList.remove('open');
}

/* ──────────────────────────────────────────────────────────────
   PRINT
   ────────────────────────────────────────────────────────────── */
function showPrintOpts(){openModal('modal-print');}

function doPrint(){
  closeModal('modal-print');
  var res=getResDate(S.date||'').slice().sort(function(a,b){return (a.jam||'').localeCompare(b.jam||'');});
  var opts={menu:document.getElementById('po-menu').checked,hp:document.getElementById('po-hp').checked,
            dp:document.getElementById('po-dp').checked,note:document.getElementById('po-note').checked};
  var items=res.map(function(r,i){
    var menuH='';
    if (opts.menu&&Array.isArray(r.menus)&&r.menus.length){
      menuH='<p style="font-weight:600;margin-top:8px">🍽 Pesanan:</p><ul>'+r.menus.map(function(m){
        var md=getMenuByName(m.name),det=(md&&md.details)||[];
        return '<li><strong>'+m.quantity+'x '+esc(m.name)+'</strong>'+(det.length?'<br><small style="color:#555">'+det.map(esc).join(', ')+'</small>':'')+' </li>';
      }).join('')+'</ul>';
    }
    return '<div class="card"><h3>'+(i+1)+'. '+esc(r.nama)+'</h3><p>⏰ '+r.jam+' | 📍 '+esc(r.tempat)+' | 👥 '+r.jumlah+' orang</p>'+
      (opts.hp&&r.nomorHp?'<p>📱 '+r.nomorHp+'</p>':'')+menuH+
      (opts.dp&&parseInt(r.dp)>0?'<p>💰 DP: Rp'+formatRp(r.dp)+(r.tipeDp?' ('+esc(r.tipeDp)+')':'')+' </p>':'')+
      (opts.note&&r.tambahan?'<p>📝 '+esc(r.tambahan)+'</p>':'')+'</div>';
  }).join('');
  var html='<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"/><title>Reservasi '+formatDateDisp(S.date||'')+'</title>'+
    '<style>body{font-family:sans-serif;padding:20px;color:#18181b;max-width:900px;margin:0 auto}h1{font-size:1.3rem}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.card{border:1px solid #e4e4e7;border-radius:10px;padding:14px;break-inside:avoid}h3{margin:0 0 7px;font-size:.95rem}p{margin:3px 0;font-size:.85rem}ul{margin:4px 0;padding-left:16px;font-size:.8rem}@media print{@page{margin:12mm}}</style>'+
    '</head><body><h1>📋 Reservasi - '+esc(S.biz.name)+'</h1><p style="color:#71717a;margin-bottom:16px">'+formatDateFull(S.date||'')+' · '+res.length+' reservasi</p><div class="grid">'+items+'</div></body></html>';
  var w=window.open('','_blank','noopener');
  if (!w){showToast('Pop-up diblokir!','error');return;}
  w.document.write(html);w.document.close();
  setTimeout(function(){w.print();},600);
}

/* ──────────────────────────────────────────────────────────────
   EXPORT / IMPORT
   FIX #L: doImport sync S.res ke Firestore
   ────────────────────────────────────────────────────────────── */
function handleExport(){
  /* Kumpulkan semua res dari S.res (bulan yang sudah di-load) */
  var payload={v:5,exportedAt:new Date().toISOString(),biz:S.biz,menus:S.menus,locs:S.locs,res:S.res,ops:S.ops};
  var code='';
  try{code=btoa(unescape(encodeURIComponent(JSON.stringify(payload))));}catch(e){}
  val('export-out',code);val('import-in','');
  openModal('modal-export');
}

function copyExport(){
  var el=document.getElementById('export-out');
  if (!el||!el.value){showToast('Tidak ada data','error');return;}
  if (navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(el.value)
      .then(function(){showToast('Kode backup disalin! 📋','success');})
      .catch(function(){el.select();document.execCommand('copy');showToast('Disalin!','success');});
  } else {el.select();document.execCommand('copy');showToast('Disalin!','success');}
}

async function doImport(){
  if (!guardWrite()) return;
  var code=gval('import-in').trim();
  if (!code){showToast('Tempel kode dulu!','error');return;}
  var payload;
  try{payload=JSON.parse(decodeURIComponent(escape(atob(code))));}
  catch(e){showToast('Kode tidak valid: '+e.message,'error');return;}
  if (!payload.v){showToast('Format tidak dikenal','error');return;}
  if (!confirm('Import akan menggantikan semua data saat ini. Lanjutkan?')) return;

  S.biz  =payload.biz  ||S.biz;
  S.menus=payload.menus||{};
  S.locs =payload.locs ||payload.locations||{};
  S.res  =payload.res  ||payload.reservations||{};
  if (payload.ops) S.ops=Object.assign(S.ops,payload.ops);

  /* Tulis ke localStorage */
  DB.set(K.BIZ,  S.biz);
  DB.set(K.MENUS,S.menus);
  DB.set(K.LOCS, S.locs);
  DB.set(K.OPS,  S.ops);
  Object.keys(S.res).forEach(function(mk){_dbSetMonth(mk,S.res[mk]);});

  /* Mark semua bulan sebagai loaded */
  S.loadedMonths=new Set(Object.keys(S.res));

  if (_UID&&window._FB){
    var fb=window._FB;
    showToast('Menyinkronkan ke cloud...','info',2000);
    try {
      /* FIX #L: sync reservasi ke Firestore juga */
      var tasks=[];
      tasks.push(fb.setDoc(fb.doc(fb.db,'users',_UID,'config','biz'),S.biz));
      tasks.push(fb.setDoc(fb.doc(fb.db,'users',_UID,'config','ops'),S.ops));
      Object.keys(S.menus).forEach(function(mid){
        tasks.push(fb.setDoc(fb.doc(fb.db,'users',_UID,'menus',mid),S.menus[mid]));
      });
      Object.keys(S.locs).forEach(function(lid){
        tasks.push(fb.setDoc(fb.doc(fb.db,'users',_UID,'locations',lid),S.locs[lid]));
      });
      Object.keys(S.res).forEach(function(mk){
        (S.res[mk]||[]).forEach(function(r){
          tasks.push(fb.setDoc(fb.doc(fb.db,'users',_UID,'reservations',mk,'list',r.id),r));
        });
      });
      await Promise.all(tasks);
      _showSync();
    } catch(e){console.warn('[doImport FS sync]',e);}
  }

  showToast('Data berhasil diimport! ✅','success');
  closeModal('modal-export');
  setText('cal-title','Dashboard - '+(S.biz.name||'Usaha Saya'));
  setText('sb-biz-name',S.biz.name||'Usaha Saya');
  _renderCalendarSync();
  renderMenusTable();
  renderLocsTable();
  loadSettingsForm();
  if (S.date){renderDetail(getResDate(S.date));renderAvailBar(S.date);}
}

/* ──────────────────────────────────────────────────────────────
   ANALYSIS
   ────────────────────────────────────────────────────────────── */
var anlChart=null;

function setupAnlSelectors(){
  var ySel=document.getElementById('anl-year'),mSel=document.getElementById('anl-month');
  if (!ySel||!mSel) return;
  var cy=new Date().getFullYear();
  ySel.innerHTML='';
  for (var y=cy;y>=cy-4;y--) ySel.insertAdjacentHTML('beforeend','<option value="'+y+'">'+y+'</option>');
  mSel.innerHTML='<option value="all">Satu Tahun Penuh</option>';
  MONTHS.forEach(function(n,i){mSel.insertAdjacentHTML('beforeend','<option value="'+i+'"'+(i===new Date().getMonth()?' selected':'')+'>'+n+'</option>');});
}

function runAnalysis(){
  var y=parseInt(document.getElementById('anl-year').value);
  var mv=document.getElementById('anl-month').value;
  var filtered,mode;
  if (mv==='all'){filtered=getAllRes().filter(function(r){return r.date&&r.date.startsWith(String(y));});mode='month';}
  else{filtered=S.res[mkKey(y,parseInt(mv))]||[];mode='day';}

  var cnt=filtered.length,pax=filtered.reduce(function(s,r){return s+(parseInt(r.jumlah)||0);},0);
  var dp=filtered.reduce(function(s,r){return s+(parseInt(r.dp)||0);},0);
  var statsEl=document.getElementById('anl-stats');
  if (statsEl) statsEl.innerHTML=anlCard(cnt,'Total Reservasi','fas fa-calendar-check')+anlCard(pax,'Total Tamu','fas fa-users')+anlCard('Rp'+formatRpK(dp),'Total DP','fas fa-money-bill-wave')+anlCard(cnt?Math.round(pax/cnt):0,'Rata-rata Tamu','fas fa-chart-line');

  var labels=[],data=[];
  if (mode==='month'){
    var mc=Array(12).fill(0);
    filtered.forEach(function(r){if(r.date)mc[parseInt(r.date.split('-')[1])-1]++;});
    labels=MONTHS_S;data=mc;
  } else {
    var dm=new Date(y,parseInt(mv)+1,0).getDate(),dc=Array(dm).fill(0);
    filtered.forEach(function(r){if(r.date)dc[parseInt(r.date.split('-')[2])-1]++;});
    labels=dc.map(function(_,i){return String(i+1);});data=dc;
  }
  renderAnlChart(labels,data,mode==='month'?'Reservasi per Bulan':'Reservasi per Tanggal');

  var dowMap={};DAYS.forEach(function(d){dowMap[d]=0;});
  filtered.forEach(function(r){if(r.date){var dow=DAYS[new Date(r.date+'T12:00:00').getDay()];dowMap[dow]=(dowMap[dow]||0)+1;}});
  var topDow=Object.entries(dowMap).sort(function(a,b){return b[1]-a[1];})[0];
  var menuMap={};
  filtered.forEach(function(r){if(Array.isArray(r.menus))r.menus.forEach(function(m){menuMap[m.name]=(menuMap[m.name]||0)+(parseInt(m.quantity)||1);});});
  var topMenu=Object.entries(menuMap).sort(function(a,b){return b[1]-a[1];})[0];

  var ins=['Periode: '+filtered.length+' reservasi, '+pax+' tamu total.'];
  if (topDow&&topDow[1]) ins.push('Hari tersibuk: <strong>'+topDow[0]+'</strong> ('+topDow[1]+' reservasi).');
  if (topMenu) ins.push('Menu favorit: <strong>'+esc(topMenu[0])+'</strong> ('+topMenu[1]+' porsi).');

  var insightEl=document.getElementById('anl-insight');
  if (insightEl) insightEl.innerHTML='<h5><i class="fas fa-lightbulb"></i> Insight Otomatis</h5>'+
    (filtered.length?'<ul>'+ins.map(function(i){return '<li>'+i+'</li>';}).join('')+'</ul>':
    '<p style="color:var(--ink-4);font-size:.85rem">Belum ada data untuk periode ini.<br>Klik <strong>Muat Semua</strong> untuk load data dari cloud.</p>');

  var custM={};
  filtered.forEach(function(r){if(r.nomorHp){if(!custM[r.nomorHp])custM[r.nomorHp]={name:r.nama,count:0};custM[r.nomorHp].count++;}});
  var topC=Object.values(custM).sort(function(a,b){return b.count-a.count;}).slice(0,5);
  var freq=document.getElementById('anl-frequent');
  if (freq) freq.innerHTML=topC.length?topC.map(function(c){return '<li class="rank-item"><span>'+esc(c.name)+'</span><span class="ri-val">'+c.count+'x</span></li>';}).join(''):'<li style="color:var(--ink-4);font-size:.85rem;padding:12px 0">Belum ada data</li>';

  var topM=Object.entries(menuMap).sort(function(a,b){return b[1]-a[1];}).slice(0,5);
  var mrank=document.getElementById('anl-menus-rank');
  if (mrank) mrank.innerHTML=topM.length?topM.map(function(m){return '<li class="rank-item"><span>'+esc(m[0])+'</span><span class="ri-val">'+m[1]+' porsi</span></li>';}).join(''):'<li style="color:var(--ink-4);font-size:.85rem;padding:12px 0">Belum ada data</li>';
}

function anlCard(v,l,icon){
  return '<div class="anl-card"><div style="font-size:.72rem;color:var(--ac);margin-bottom:7px"><i class="'+icon+'"></i></div><div class="anl-val">'+v+'</div><div class="anl-lbl">'+l+'</div></div>';
}

function renderAnlChart(labels,data,title){
  var ctx=document.getElementById('anl-chart');if(!ctx)return;
  if (anlChart){anlChart.destroy();anlChart=null;}
  var acColor=getComputedStyle(document.documentElement).getPropertyValue('--ac').trim()||'#ea580c';
  anlChart=new Chart(ctx.getContext('2d'),{
    type:'bar',
    data:{labels,datasets:[{label:'Reservasi',data,
      backgroundColor:function(c){var ch=c.chart,ct=ch.ctx,a=ch.chartArea;if(!a)return acColor+'b3';var g=ct.createLinearGradient(0,a.top,0,a.bottom);g.addColorStop(0,acColor+'cc');g.addColorStop(1,acColor+'22');return g;},
      borderRadius:7,borderSkipped:false,hoverBackgroundColor:acColor}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        title:{display:true,text:title,font:{size:13,weight:'600'},color:'rgba(15,23,42,.4)',padding:{bottom:14}},
        tooltip:{backgroundColor:'#fff',titleColor:'#0f172a',bodyColor:'#475569',borderColor:'rgba(15,23,42,.1)',borderWidth:1,padding:10,cornerRadius:8,
          callbacks:{label:function(c){return ' '+c.raw+' reservasi';}}}},
      scales:{
        x:{grid:{display:false},ticks:{font:{size:10},color:'rgba(15,23,42,.4)'}},
        y:{beginAtZero:true,ticks:{stepSize:1,font:{size:10},color:'rgba(15,23,42,.4)'},grid:{color:'rgba(15,23,42,.05)'}}}}
  });
}

/* ──────────────────────────────────────────────────────────────
   BROADCAST
   ────────────────────────────────────────────────────────────── */
function loadBcView(){
  var saved=localStorage.getItem(_ckey(K.BC_MSG))||'';
  val('bc-msg',saved);
  var map={};
  getAllRes().forEach(function(r){if(r.nomorHp&&!map[r.nomorHp])map[r.nomorHp]={name:r.nama,phone:r.nomorHp};});
  S.bcList=Object.values(map).sort(function(a,b){return a.name.localeCompare(b.name);});
  renderBcList(S.bcList);
}

function saveBcMsg(){
  if (!guardWrite()) return;
  var msg=(gval('bc-msg')||'').trim();
  if (!msg){showToast('Pesan kosong!','error');return;}
  localStorage.setItem(_ckey(K.BC_MSG),msg);
  showToast('Pesan broadcast disimpan!','success');
}

function renderBcList(list){
  var el=document.getElementById('bc-list');if(!el)return;
  if (!list.length){el.innerHTML='<div style="text-align:center;padding:28px;color:var(--ink-4);font-size:.86rem">Belum ada pelanggan dengan nomor HP.</div>';return;}
  el.innerHTML=list.map(function(c){
    return '<div class="bc-item"><div><div class="bc-name">'+esc(c.name)+'</div><div class="bc-phone">'+esc(c.phone)+'</div></div>'+
      (isReadOnly()?'<span style="font-size:.72rem;color:var(--ink-4)"><i class="fas fa-lock"></i></span>':
        '<button class="btn btn-wa btn-sm" data-phone="'+esc(c.phone)+'" data-name="'+esc(c.name)+'" onclick="sendBc(this)"><i class="fab fa-whatsapp"></i> Kirim</button>')+
      '</div>';
  }).join('');
}

function filterBc(q){
  var fl=q.toLowerCase();
  renderBcList(!q?S.bcList:S.bcList.filter(function(c){return c.name.toLowerCase().includes(fl)||c.phone.includes(q);}));
}

function sendBc(btn){
  if (!guardWrite()) return;
  var phone=btn.getAttribute('data-phone'),name=btn.getAttribute('data-name');
  var tpl=localStorage.getItem(_ckey(K.BC_MSG))||'';
  if (!tpl){showToast('Atur pesan dulu!','error');return;}
  openWA(phone,tpl.replace(/\bkak\b/gi,'Kak *'+name+'*'));
  btn.innerHTML='<i class="fas fa-check"></i> Terkirim';
  btn.className='btn btn-success btn-sm';
  btn.disabled=true;
}

/* ──────────────────────────────────────────────────────────────
   MODALS & KEYBOARD
   ────────────────────────────────────────────────────────────── */
function openModal(id) { var el=document.getElementById(id);if(el)el.classList.add('open'); }
function closeModal(id){ var el=document.getElementById(id);if(el)el.classList.remove('open'); }

function initModalClose(){
  document.querySelectorAll('.modal-overlay').forEach(function(o){
    o.addEventListener('click',function(e){if(e.target===o)closeModal(o.id);});
  });
}

function initKbd(){
  document.addEventListener('keydown',function(e){
    if (e.key==='Escape'){
      document.querySelectorAll('.modal-overlay.open').forEach(function(m){m.classList.remove('open');});
      var nd=document.getElementById('notif-dd');if(nd)nd.classList.remove('open');
    }
  });
}

function toggleSidebar(){
  var sb=document.getElementById('sidebar'),ov=document.getElementById('sidebar-overlay');
  var open=sb&&sb.classList.contains('open');
  if (open){sb.classList.remove('open');if(ov)ov.classList.remove('show');}
  else{if(sb)sb.classList.add('open');if(ov)ov.classList.add('show');}
}

/* ──────────────────────────────────────────────────────────────
   TOAST
   ────────────────────────────────────────────────────────────── */
function showToast(msg,type,dur){
  type=type||'success';dur=dur||3000;
  var c=document.getElementById('toast-container');if(!c)return;
  var icons={success:'fas fa-check-circle',error:'fas fa-times-circle',info:'fas fa-info-circle',warning:'fas fa-exclamation-triangle'};
  var div=document.createElement('div');
  div.className='toast toast-'+type;
  div.innerHTML='<i class="'+(icons[type]||icons.success)+'"></i><span>'+msg+'</span>';
  c.appendChild(div);
  setTimeout(function(){
    div.style.opacity='0';div.style.transform='translate3d(18px,0,0)';
    setTimeout(function(){if(div.parentNode)div.remove();},320);
  },dur);
}

/* ──────────────────────────────────────────────────────────────
   UTILITIES
   ────────────────────────────────────────────────────────────── */
function esc(s){
  if (s===null||s===undefined) return '';
  var d=document.createElement('div');
  d.appendChild(document.createTextNode(String(s)));
  return d.innerHTML;
}
function pad2(n)         { return n<10?'0'+n:''+n; }
function todayStr()      { var d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function tomorrowStr()   { var d=new Date(Date.now()+86400000);return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function buildDs(y,m,d)  { return y+'-'+pad2(m)+'-'+pad2(d); }
function formatRp(n)     { return (parseInt(n)||0).toLocaleString('id-ID'); }
function formatRpK(n)    { n=parseInt(n)||0;if(n>=1000000)return (n/1000000).toFixed(1).replace('.0','')+'jt';if(n>=1000)return Math.round(n/1000)+'rb';return String(n); }
function formatDateDisp(ds){ if(!ds)return '-';var p=ds.split('-');return parseInt(p[2])+' '+MONTHS[parseInt(p[1])-1]+' '+p[0]; }
function formatDateFull(ds){ if(!ds)return '-';var d=new Date(ds+'T12:00:00'),p=ds.split('-');return DAYS[d.getDay()]+', '+parseInt(p[2])+' '+MONTHS_S[parseInt(p[1])-1]+' '+p[0]; }
function initials(n)     { if(!n)return '?';var p=n.trim().split(/\s+/);return (p.length===1?p[0][0]:(p[0][0]+p[p.length-1][0])).toUpperCase(); }
function nameColor(n)    { if(!n)return '#64748b';var h=0;for(var i=0;i<n.length;i++)h=n.charCodeAt(i)+((h<<5)-h);return['#2563eb','#059669','#d97706','#dc2626','#7c3aed','#0891b2','#ea580c','#0d9488'][Math.abs(h)%8]; }
function validPhone(p)   { return /^[\d\s\-+()]{10,15}$/.test(p); }
function normPhone(p)    { if(!p)return '';var c=p.replace(/\D/g,'');if(c.startsWith('62'))return c;if(c.startsWith('0'))return '62'+c.slice(1);return '62'+c; }
function setText(id,v)   { var el=document.getElementById(id);if(el)el.textContent=v; }
function setHTML(id,v)   { var el=document.getElementById(id);if(el)el.innerHTML=v; }
function gval(id)        { var el=document.getElementById(id);return el?el.value:''; }
function val(id,v)       { var el=document.getElementById(id);if(el)el.value=v; }
function selVal(id,v)    { var el=document.getElementById(id);if(el)el.value=v; }
function clearErrors()   { document.querySelectorAll('.form-error').forEach(function(e){e.textContent='';e.classList.remove('show');}); }
function showErr(id,msg) { var el=document.getElementById(id);if(el){el.textContent=msg;el.classList.add('show');} }

/* ──────────────────────────────────────────────────────────────
   FINAL BOOT
   ────────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', function () {
  document.body.classList.add('app-ready');
  boot();
});
