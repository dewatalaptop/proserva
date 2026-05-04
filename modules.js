/* ============================================================
PROSERVA — modules.js
Data Layer · Storage · Trial System · Utilities
============================================================ */

'use strict';

/* ============================================================
1. STORAGE KEYS
============================================================ */
var KEYS = {
  BIZ:          'proserva_biz',
  MENUS:        'proserva_menus',
  LOCATIONS:    'proserva_locations',
  RESERVATIONS: 'proserva_reservations',
  SETUP_DONE:   'proserva_setup_done',
  BC_MSG:       'proserva_bc_msg',
  TRIAL_START:  'proserva_trial_start',
  INSTALL_DATE: 'proserva_install_date'
};

/* ============================================================
2. STORAGE ADAPTER
Wraps localStorage with safe JSON encode/decode
============================================================ */
var DB = {

  get: function (key, fallback) {
    if (fallback === undefined) fallback = null;
    try {
      var raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[DB.get] Parse error for key:', key, e);
      return fallback;
    }
  },

  set: function (key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[DB.set] Write error for key:', key, e);
      return false;
    }
  },

  remove: function (key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  },

  clear: function () {
    Object.values(KEYS).forEach(function (k) {
      localStorage.removeItem(k);
    });
  }

};
/* ============================================================
3. TRIAL SYSTEM
Data expires 7 days after first setup
============================================================ */
var TRIAL = {

  DURATION_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  DURATION_DAYS: 7,

  /** Call once on first wizard finish */
  init: function () {
    if (!DB.get(KEYS.TRIAL_START)) {
      DB.set(KEYS.TRIAL_START, Date.now());
    }
  },

  /** Returns ms remaining (0 if expired) */
  msRemaining: function () {
    var start = DB.get(KEYS.TRIAL_START);
    if (!start) return this.DURATION_MS;

    var remaining = (start + this.DURATION_MS) - Date.now();
    return Math.max(0, remaining);
  },

  /** Returns full days remaining (ceil) */
  daysRemaining: function () {
    return Math.ceil(this.msRemaining() / (24 * 60 * 60 * 1000));
  },

  /** Returns true if trial has expired */
  isExpired: function () {
    return this.msRemaining() === 0;
  },

  /** Format a human-readable countdown string */
  countdownText: function () {
    var ms = this.msRemaining();
    if (ms === 0) return 'Data telah direset';

    var days  = Math.floor(ms / (24 * 3600 * 1000));
    var hours = Math.floor((ms % (24 * 3600 * 1000)) / 3600000);
    var mins  = Math.floor((ms % 3600000) / 60000);

    if (days > 0)  return days + ' hari ' + hours + ' jam';
    if (hours > 0) return hours + ' jam ' + mins + ' menit';
    return mins + ' menit';
  },

  /**
   * Check expiry on boot.
   * If expired: wipe all data, reset setup flag, reload.
   */
  checkAndEnforce: function () {
    if (!DB.get(KEYS.SETUP_DONE)) return;
    if (!this.isExpired()) return;

    DB.clear();

    alert(
      '⏰ Masa trial Proserva telah berakhir.\n\n' +
      'Semua data demo telah direset secara otomatis.\n' +
      'Silakan setup ulang untuk memulai demo baru.'
    );

    location.reload();
  },

  /** Update all trial-related UI elements */
  updateUI: function () {
    var days      = this.daysRemaining();
    var countdown = this.countdownText();

    var elCountdown = document.getElementById('trial-countdown');
    var elSidebar   = document.getElementById('sidebar-trial-days');

    if (elCountdown) elCountdown.textContent = countdown;
    if (elSidebar)   elSidebar.textContent   = days + ' hari tersisa';
  },

  /** Start a repeating ticker that keeps UI in sync */
  startTicker: function () {
    var self = this;

    self.updateUI();

    setInterval(function () {
      self.updateUI();

      if (self.isExpired()) {
        DB.clear();
        location.reload();
      }
    }, 60 * 1000); // every minute
  }

};
/* ============================================================
4. APP STATE
Single source of truth for runtime data
============================================================ */
var state = {
  biz:           { name: 'Usaha Saya', type: 'restoran' },
  menus:         {},
  locations:     {},
  reservations:  {},

  // Calendar
  currentMonth:  new Date().getMonth(),
  currentYear:   new Date().getFullYear(),
  selectedDate:  null,

  // Analysis
  anlChart:      null,

  // Broadcast
  bcList:        [],

  // Notification interval handle
  notifInterval: null
};

/* ============================================================
5. STATE PERSISTENCE
============================================================ */
function loadState () {
  state.biz          = DB.get(KEYS.BIZ,          { name: 'Usaha Saya', type: 'restoran' });
  state.menus        = DB.get(KEYS.MENUS,        {});
  state.locations    = DB.get(KEYS.LOCATIONS,    {});
  state.reservations = DB.get(KEYS.RESERVATIONS, {});
}

function saveMenus () {
  DB.set(KEYS.MENUS, state.menus);
}

function saveLocations () {
  DB.set(KEYS.LOCATIONS, state.locations);
}

function saveReservations () {
  DB.set(KEYS.RESERVATIONS, state.reservations);
}

function saveBiz () {
  DB.set(KEYS.BIZ, state.biz);
}
/* ============================================================
6. RESERVATION DATA ACCESS LAYER
============================================================ */

/** e.g. 2025-04 */
function getMonthKey (year, month) {
  return year + '-' + String(month + 1).padStart(2, '0');
}

/** All reservations for a given year-month */
function getResForMonth (year, month) {
  return state.reservations[getMonthKey(year, month)] || [];
}

/** All reservations on a specific date string (YYYY-MM-DD) */
function getResForDate (dateStr) {
  var mk = dateStr.substring(0, 7);
  return (state.reservations[mk] || []).filter(function (r) {
    return r.date === dateStr;
  });
}

/** Flatten every reservation across all months into one array */
function getAllReservations () {
  return Object.values(state.reservations).reduce(function (acc, arr) {
    return acc.concat(arr);
  }, []);
}

/** Add a new reservation */
function addReservation (res) {
  var mk = res.date.substring(0, 7);
  if (!state.reservations[mk]) state.reservations[mk] = [];

  state.reservations[mk].push(res);
  saveReservations();
}

/** Replace an existing reservation by id */
function updateReservation (res) {
  var mk = res.date.substring(0, 7);
  if (!state.reservations[mk]) return false;

  var idx = state.reservations[mk].findIndex(function (r) {
    return r.id === res.id;
  });

  if (idx === -1) return false;

  state.reservations[mk][idx] = res;
  saveReservations();
  return true;
}

/** Remove a reservation by id (searches all month buckets) */
function deleteReservation (id) {
  for (var mk in state.reservations) {
    var idx = state.reservations[mk].findIndex(function (r) {
      return r.id === id;
    });

    if (idx !== -1) {
      state.reservations[mk].splice(idx, 1);

      // Clean up empty month buckets
      if (state.reservations[mk].length === 0) {
        delete state.reservations[mk];
      }

      saveReservations();
      return true;
    }
  }
  return false;
}

/** Find a reservation by id across all months */
function findReservationById (id) {
  for (var mk in state.reservations) {
    var found = state.reservations[mk].find(function (r) {
      return r.id === id;
    });
    if (found) return found;
  }
  return null;
}
/* ============================================================
7. CUSTOMER DATA LAYER
Build a deduplicated customer list from all reservations
============================================================ */
function buildCustomerList () {
  var all = getAllReservations();
  var map = {};

  all.forEach(function (r) {
    // Key by phone; fall back to name for walk-in guests
    var key = r.nomorHp
      ? r.nomorHp
      : ('**noPhone**' + (r.nama || '').toLowerCase().trim());

    if (!map[key]) {
      map[key] = {
        nama:      r.nama    || 'Tanpa Nama',
        nomorHp:   r.nomorHp || null,
        count:     0,
        totalPax:  0,
        lastDate:  '',
        firstDate: r.date || ''
      };
    }

    map[key].count++;
    map[key].totalPax += parseInt(r.jumlah, 10) || 0;

    if (!map[key].lastDate || r.date > map[key].lastDate) {
      map[key].lastDate = r.date;
    }

    if (!map[key].firstDate || r.date < map[key].firstDate) {
      map[key].firstDate = r.date;
    }
  });

  return Object.values(map).sort(function (a, b) {
    return a.nama.localeCompare(b.nama);
  });
}

/* ============================================================
8. MENU & LOCATION HELPERS
============================================================ */

/** Sorted array of menu entries: [{id, ...menuData}] */
function getMenusSorted () {
  return Object.entries(state.menus)
    .map(function (e) {
      return Object.assign({ id: e[0] }, e[1]);
    })
    .sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });
}

/** Sorted array of location entries: [{id, ...locData}] */
function getLocationsSorted () {
  return Object.entries(state.locations)
    .map(function (e) {
      return Object.assign({ id: e[0] }, e[1]);
    })
    .sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '');
    });
}

/** Find a menu object by name */
function getMenuByName (name) {
  return Object.values(state.menus).find(function (m) {
    return m.name === name;
  }) || null;
}

/** Find a location object by name */
function getLocationByName (name) {
  return Object.values(state.locations).find(function (l) {
    return l.name === name;
  }) || null;
}
/* ============================================================
9. ID GENERATOR
============================================================ */
function genId () {
  return Date.now().toString(36) +
         Math.random().toString(36).slice(2, 7);
}

/* ============================================================
10. DATE & NUMBER UTILITIES
============================================================ */
var MONTHS_ID = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
];

var MONTHS_SHORT = MONTHS_ID.map(function (m) {
  return m.slice(0, 3);
});

var DAYS_ID = [
  'Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'
];

/**
 * Format YYYY-MM-DD → "15 Januari 2025"
 */
function formatDateDisplay (dateStr) {
  if (!dateStr) return '—';

  var p = dateStr.split('-');
  return parseInt(p[2], 10) + ' ' +
         MONTHS_ID[parseInt(p[1], 10) - 1] + ' ' +
         p[0];
}

/**
 * Format YYYY-MM-DD → "Senin, 15 Jan 2025"
 */
function formatDateFull (dateStr) {
  if (!dateStr) return '—';

  var d   = new Date(dateStr + 'T12:00:00');
  var dow = DAYS_ID[d.getDay()];
  var p   = dateStr.split('-');

  return dow + ', ' +
         parseInt(p[2], 10) + ' ' +
         MONTHS_SHORT[parseInt(p[1], 10) - 1] + ' ' +
         p[0];
}

/**
 * Format number → Rupiah (1.500.000)
 */
function formatRupiah (n) {
  return (parseInt(n, 10) || 0).toLocaleString('id-ID');
}

/**
 * Compact Rupiah → 1.5jt / 250rb
 */
function formatRupiahK (n) {
  n = parseInt(n, 10) || 0;

  if (n >= 1000000) {
    return (n / 1000000)
      .toFixed(1)
      .replace('.', ',') + 'jt';
  }

  if (n >= 1000) {
    return Math.round(n / 1000) + 'rb';
  }

  return formatRupiah(n);
}

/**
 * Today → YYYY-MM-DD
 */
function todayStr () {
  return new Date().toISOString().split('T')[0];
}

/**
 * Build YYYY-MM-DD
 */
function buildDateStr (year, month1based, day) {
  return year + '-' +
    String(month1based).padStart(2, '0') + '-' +
    String(day).padStart(2, '0');
}

/**
 * Get initials (max 2 chars)
 */
function getInitials (name) {
  if (!name) return '?';

  var parts = name.trim().split(/\s+/);

  if (parts.length === 1) {
    return parts[0][0].toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
/* ============================================================
11. FORM VALIDATION HELPERS
============================================================ */

function showFieldError (errorElId, message) {
  var el = document.getElementById(errorElId);
  if (!el) return;

  el.textContent = message;
  el.classList.add('show');

  // Also mark the corresponding input
  var inputId = errorElId.replace(/^err-/, 'res-');
  var input   = document.getElementById(inputId);

  if (input) input.classList.add('error');
}

function clearFormErrors () {
  document.querySelectorAll('.form-error').forEach(function (el) {
    el.textContent = '';
    el.classList.remove('show');
  });

  document.querySelectorAll('.form-input.error, .form-select.error')
    .forEach(function (el) {
      el.classList.remove('error');
    });
}

function validatePhone (raw) {
  var digits = (raw || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
}

function normalizePhone (raw) {
  return (raw || '').replace(/\D/g, '');
}

/* ============================================================
12. MODAL HELPERS
============================================================ */

function openModal (id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal (id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/** Close modal when clicking outside panel */
function initModalOverlayClose () {
  document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        closeModal(overlay.id);
      }
    });
  });
}
/* ============================================================
13. TOAST NOTIFICATIONS
============================================================ */

var TOAST_ICONS = {
  success: 'fas fa-check-circle',
  error:   'fas fa-times-circle',
  info:    'fas fa-info-circle',
  warning: 'fas fa-exclamation-triangle'
};

function showToast (message, type, duration) {
  type     = type     || 'success';
  duration = duration || 3000;

  var container = document.getElementById('toast-container');
  if (!container) return;

  var id  = 'toast-' + Date.now();
  var div = document.createElement('div');

  div.className = 'toast toast-' + type;
  div.id        = id;

  div.innerHTML =
    '<i class="' + (TOAST_ICONS[type] || TOAST_ICONS.success) + '"></i>' +
    '<span>' + message + '</span>';

  container.appendChild(div);

  setTimeout(function () {
    div.style.opacity   = '0';
    div.style.transform = 'translateX(20px)';

    setTimeout(function () {
      if (div && div.parentNode) div.remove();
    }, 350);
  }, duration);
}

/* ============================================================
14. WHATSAPP HELPERS
============================================================ */

/**
 * Open a WhatsApp chat
 */
function openWhatsApp (phone, msg) {
  if (!phone) return;

  var formatted = phone.replace(/^0/, '62');
  var url = 'https://wa.me/' + formatted + '?text=' + encodeURIComponent(msg || '');

  window.open(url, '_blank', 'noopener');
}

/**
 * Build reservation confirmation message
 */
function buildConfirmationMsg (r) {
  var menuList = '*(tidak ada)*';

  if (Array.isArray(r.menus) && r.menus.length > 0) {
    menuList = r.menus.map(function (item) {
      var md      = getMenuByName(item.name);
      var details = md && Array.isArray(md.details) ? md.details : [];

      return (
        '  • *' + item.quantity + 'x ' + item.name + '*' +
        (details.length ? '\n    ' + details.join(', ') : '')
      );
    }).join('\n');
  }

  return (
    'Halo Kak *' + r.nama + '* 👋\n\n' +
    'Kami dari *' + state.biz.name + '* ingin konfirmasi reservasi Anda:\n\n' +
    '🗓 *Tanggal:* ' + formatDateFull(r.date) + '\n' +
    '⏰ *Jam:* ' + r.jam + '\n' +
    '📍 *Tempat:* ' + r.tempat + '\n' +
    '👥 *Jumlah:* ' + r.jumlah + ' orang\n\n' +
    '🍽 *Pesanan:*\n' + menuList + '\n\n' +
    (parseInt(r.dp, 10) > 0
      ? '💰 *DP:* Rp' + formatRupiah(r.dp) +
        (r.tipeDp ? ' via ' + r.tipeDp : ' ✅') + '\n\n'
      : '') +
    (r.tambahan
      ? '📝 *Catatan:* ' + r.tambahan + '\n\n'
      : '') +
    'Mohon konfirmasi kehadiran ya, kami tunggu! 😊'
  );
}

/**
 * Build thank-you message
 */
function buildThankYouMsg (r) {
  return (
    'Halo Kak *' + r.nama + '* 👋\n\n' +
    'Kami dari *' + state.biz.name + '* mengucapkan terima kasih banyak atas kunjungannya. 🙏\n\n' +
    'Semoga Kakak dan rombongan menikmati pengalaman bersama kami. 🌿😊\n\n' +
    'Kami sangat menghargai masukan Kakak untuk terus berkembang. Sampai jumpa lagi! ✨\n\n' +
    'Salam hangat,\n' +
    '*Tim ' + state.biz.name + '* ❤️'
  );
}

/**
 * Build daily summary message
 */
function buildDailySummaryMsg (dateStr, reservations) {
  var biz = state.biz.name;

  var msg =
    '*📋 LAPORAN RESERVASI*\n' +
    '*' + biz + '*\n\n' +
    '📅 ' + formatDateFull(dateStr) + '\n' +
    '────────────────────────────\n\n';

  if (!reservations || reservations.length === 0) {
    return msg + '*Tidak ada reservasi.*';
  }

  var sorted = reservations.slice().sort(function (a, b) {
    return (a.jam || '').localeCompare(b.jam || '');
  });

  sorted.forEach(function (r, i) {
    var menuList = '*(tidak ada)*';

    if (Array.isArray(r.menus) && r.menus.length > 0) {
      menuList = r.menus.map(function (m) {
        return '  • ' + m.quantity + 'x ' + m.name;
      }).join('\n');
    }

    msg +=
      '*' + (i + 1) + '. ' + r.nama + '*\n' +
      '⏰ ' + r.jam + ' | 📍 ' + r.tempat + ' | 👥 ' + r.jumlah + ' orang\n' +
      '🍽 Pesanan:\n' + menuList + '\n' +
      (parseInt(r.dp, 10) > 0 ? '💰 DP: Rp' + formatRupiah(r.dp) + '\n' : '') +
      (r.tambahan ? '📝 ' + r.tambahan + '\n' : '') +
      '\n';
  });

  return msg.trimEnd();
}
/* ============================================================
15. EXPORT / IMPORT
============================================================ */

/**
 * Encode current data to base64 backup string
 */
function exportData () {
  var payload = {
    v:            2,
    exportedAt:   new Date().toISOString(),
    biz:          state.biz,
    menus:        state.menus,
    locations:    state.locations,
    reservations: state.reservations
  };

  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  } catch (e) {
    console.error('[exportData]', e);
    return '';
  }
}

/**
 * Decode and apply backup string
 */
function importData (code) {
  try {
    var payload = JSON.parse(
      decodeURIComponent(escape(atob((code || '').trim())))
    );

    if (!payload.v) {
      return { ok: false, error: 'Format backup tidak valid (missing version).' };
    }

    state.biz          = payload.biz          || state.biz;
    state.menus        = payload.menus        || {};
    state.locations    = payload.locations    || {};
    state.reservations = payload.reservations || {};

    saveBiz();
    saveMenus();
    saveLocations();
    saveReservations();

    DB.set(KEYS.SETUP_DONE, true);

    return { ok: true };

  } catch (e) {
    return {
      ok: false,
      error: 'Gagal memproses kode backup: ' + e.message
    };
  }
}

/* ============================================================
16. NOTIFICATION SYSTEM
“Thank-you reminder” for reservations that finished 3h+ ago
============================================================ */

var NOTIF = {

  intervalHandle: null,

  /** Get reservations needing thank-you */
  getPendingThankYous: function () {
    var now      = Date.now();
    var sevenAgo = new Date(now - 7 * 24 * 3600 * 1000)
      .toISOString()
      .split('T')[0];

    var today = todayStr();

    return getAllReservations().filter(function (r) {
      if (!r.date || r.date < sevenAgo || r.date > today) return false;
      if (r.thankYouSent || !r.nomorHp || !r.jam) return false;

      var resTime = new Date(r.date + 'T' + r.jam).getTime();

      return now > resTime + 3 * 3600 * 1000;
    });
  },

  /** Render dropdown UI */
  render: function () {
    var pending = this.getPendingThankYous();

    var dot    = document.getElementById('notif-dot');
    var listEl = document.getElementById('notif-list');

    if (!dot || !listEl) return;

    if (pending.length === 0) {
      dot.style.display = 'none';

      listEl.innerHTML =
        '<div class="nd-empty">' +
        '<i class="fas fa-check-circle"></i><br/>' +
        'Semua ucapan terima kasih sudah terkirim!' +
        '</div>';

      return;
    }

    dot.style.display = 'block';

    listEl.innerHTML = pending.map(function (r) {
      return (
        '<div class="notif-item" id="ni-' + r.id + '">' +
          '<div class="ni-name">' + escapeHtml(r.nama) + '</div>' +
          '<div class="ni-date">' +
            formatDateDisplay(r.date) + ' · ' + r.jam +
          '</div>' +
          '<button class="btn-wa-soft" style="margin-top:8px;width:100%;" ' +
            'onclick="sendThankYouById(\'' + r.id + '\')">' +
            '<i class="fab fa-whatsapp"></i> Kirim Ucapan Terima Kasih' +
          '</button>' +
        '</div>'
      );
    }).join('');
  },

  /** Start polling */
  start: function () {
    var self = this;

    self.render();

    if (self.intervalHandle) {
      clearInterval(self.intervalHandle);
    }

    self.intervalHandle = setInterval(function () {
      self.render();
    }, 2 * 60 * 1000); // every 2 minutes
  }

};
/* ============================================================
17. PRINT HELPER
============================================================ */

function buildPrintHTML (dateStr, reservations, opts) {
  opts = opts || {};

  var items = reservations.map(function (r, i) {

    var menuHtml = '';

    if (opts.menu && Array.isArray(r.menus) && r.menus.length > 0) {
      menuHtml =
        '<p class="sec-title">🍽 Pesanan:</p><ul>' +
        r.menus.map(function (item) {

          var md      = getMenuByName(item.name);
          var details = md && Array.isArray(md.details) ? md.details : [];

          return (
            '<li><strong>' + item.quantity + 'x ' + escapeHtml(item.name) + '</strong>' +
            (details.length
              ? '<ul style="color:#555;">' +
                details.map(function (d) {
                  return '<li>' + escapeHtml(d) + '</li>';
                }).join('') +
                '</ul>'
              : '') +
            '</li>'
          );

        }).join('') +
        '</ul>';
    }

    return (
      '<div class="card">' +
        '<h3>' + (i + 1) + '. ' + escapeHtml(r.nama) + '</h3>' +
        '<p>⏰ ' + r.jam +
        ' &nbsp;|&nbsp; 📍 ' + escapeHtml(r.tempat) +
        ' &nbsp;|&nbsp; 👥 ' + r.jumlah + ' orang</p>' +
        (opts.hp && r.nomorHp ? '<p>📱 ' + r.nomorHp + '</p>' : '') +
        menuHtml +
        (opts.dp && parseInt(r.dp, 10) > 0
          ? '<p>💰 DP: Rp' + formatRupiah(r.dp) +
            (r.tipeDp ? ' (' + escapeHtml(r.tipeDp) + ')' : '') +
            '</p>'
          : '') +
        (opts.tambahan && r.tambahan
          ? '<p>📝 ' + escapeHtml(r.tambahan) + '</p>'
          : '') +
      '</div>'
    );

  }).join('');

  return (
    '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"/>' +
    '<title>Reservasi ' + formatDateDisplay(dateStr) + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Satoshi:wght@400;600;700&display=swap" rel="stylesheet"/>' +
    '<style>' +
    'body{font-family:Satoshi,sans-serif;padding:24px;color:#18181b;max-width:900px;margin:0 auto;}' +
    'h1{font-size:1.4rem;margin-bottom:2px;}' +
    '.meta{color:#71717a;font-size:0.875rem;margin-bottom:24px;}' +
    '.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;}' +
    '.card{border:1px solid #e4e4e7;border-radius:12px;padding:16px;break-inside:avoid;}' +
    'h3{margin:0 0 8px;font-size:1rem;}' +
    'p{margin:4px 0;font-size:0.85rem;}' +
    'ul{margin:4px 0;padding-left:18px;font-size:0.82rem;}' +
    '.sec-title{font-weight:600;margin-top:8px;}' +
    '@media print{.grid{grid-template-columns:repeat(2,1fr);} @page{margin:15mm;}}' +
    '@media(max-width:600px){.grid{grid-template-columns:1fr;}}' +
    '</style></head><body>' +
    '<h1>📋 Laporan Reservasi — ' + escapeHtml(state.biz.name) + '</h1>' +
    '<p class="meta">' + formatDateFull(dateStr) +
    ' · ' + reservations.length + ' reservasi</p>' +
    '<div class="grid">' + items + '</div>' +
    '</body></html>'
  );
}

/* ============================================================
18. STRING UTILITIES
============================================================ */

function escapeHtml (str) {
  if (typeof str !== 'string') return str || '';

  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

function truncate (str, maxLen) {
  if (!str || str.length <= maxLen) return str || '';
  return str.slice(0, maxLen) + '…';
}

function nameToColor (name) {
  var hash = 0;

  for (var i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  var hue = Math.abs(hash) % 360;
  return 'hsl(' + hue + ',55%,50%)';
}

/* ============================================================
19. SIDEBAR TOGGLE
============================================================ */

function toggleSidebar () {
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebar-overlay');

  var isOpen = sidebar && sidebar.classList.contains('open');

  if (isOpen) {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
  } else {
    if (sidebar) sidebar.classList.add('open');
    if (overlay) overlay.classList.add('show');
  }
}

function initSidebarOverlay () {
  if (!document.getElementById('sidebar-overlay')) {
    var el = document.createElement('div');
    el.id = 'sidebar-overlay';
    el.onclick = toggleSidebar;
    document.body.appendChild(el);
  }
}

/* ============================================================
20. KEYBOARD SHORTCUTS
============================================================ */

function initKeyboardShortcuts () {
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {

      document.querySelectorAll('.modal-overlay.open').forEach(function (m) {
        m.classList.remove('open');
      });

      var nd = document.getElementById('notif-dropdown');
      if (nd) nd.classList.remove('open');
    }
  });
}

/* ============================================================
21. SETUP WIZARD DATA
============================================================ */

var wizardData = {
  bizName:   '',
  bizType:   'restoran',
  locations: [],
  menus:     []
};

/* ============================================================
22. ANALYSIS HELPERS
============================================================ */

function computeStats (reservations) {
  var count    = reservations.length;
  var totalPax = 0;
  var totalDp  = 0;

  reservations.forEach(function (r) {
    totalPax += parseInt(r.jumlah, 10) || 0;
    totalDp  += parseInt(r.dp, 10) || 0;
  });

  return {
    count:    count,
    totalPax: totalPax,
    totalDp:  totalDp,
    avgPax:   count > 0 ? (totalPax / count).toFixed(1) : '0'
  };
}

function countBy (arr, keyFn) {
  var map = {};

  arr.forEach(function (item) {
    var k = keyFn(item);
    if (k !== null && k !== undefined) {
      map[k] = (map[k] || 0) + 1;
    }
  });

  return Object.entries(map)
    .map(function (e) { return { key: e[0], count: e[1] }; })
    .sort(function (a, b) { return b.count - a.count; });
}

function countMenus (reservations) {
  var map = {};

  reservations.forEach(function (r) {
    if (!Array.isArray(r.menus)) return;

    r.menus.forEach(function (m) {
      map[m.name] = (map[m.name] || 0) + (parseInt(m.quantity, 10) || 1);
    });
  });

  return Object.entries(map)
    .map(function (e) { return { key: e[0], count: e[1] }; })
    .sort(function (a, b) { return b.count - a.count; });
}

function generateInsights (reservations, stats) {
  if (!reservations.length) {
    return ['Belum ada data pada periode ini.'];
  }

  var insights = [];
  var byDow = countBy(reservations, function (r) {
    return r.date
      ? DAYS_ID[new Date(r.date + 'T12:00:00').getDay()]
      : null;
  });

  if (byDow.length) {
    insights.push('Hari tersibuk: ' + byDow[0].key);
  }

  var topMenus = countMenus(reservations);
  if (topMenus.length) {
    insights.push('Menu favorit: ' + topMenus[0].key);
  }

  return insights;
}

/* ============================================================
23. BROADCAST HELPERS
============================================================ */

function getBroadcastMessage () {
  return localStorage.getItem(KEYS.BC_MSG) || '';
}

function saveBroadcastMessage (msg) {
  localStorage.setItem(KEYS.BC_MSG, msg);
}

function personalizeBroadcast (template, name) {
  return template.replace(/\bkak\b/gi, 'Kak *' + name + '*');
}

/* ============================================================
24. VIEW ROUTER
============================================================ */

var PAGE_NAMES = {
  calendar:  'Kalender',
  detail:    'Detail Reservasi',
  menus:     'Menu & Paket',
  locations: 'Lokasi',
  customers: 'Pelanggan',
  analysis:  'Analisis Bisnis',
  broadcast: 'Broadcast Promo'
};

function setPageTitle (viewName) {
  var el = document.getElementById('topbar-breadcrumb');

  if (el) {
    el.innerHTML =
      '<span class="tb-page-name">' +
      (PAGE_NAMES[viewName] || viewName) +
      '</span>';
  }

  document.title = (PAGE_NAMES[viewName] || viewName) + ' — Proserva';
}
/* ============================================================
DEBUG LOGGER (FOR MOBILE DEV)
============================================================ */

var DEBUG = {
  logs: [],
  enabled: false,

  push: function(type, args) {
    var msg = '[' + type.toUpperCase() + '] ' +
      Array.from(args).map(function(a) {
        try {
          return typeof a === 'object'
            ? JSON.stringify(a)
            : String(a);
        } catch (e) {
          return '[unserializable]';
        }
      }).join(' ');

    this.logs.push(msg);

    var el = document.getElementById('debug-content');
    if (el) {
      el.textContent += msg + '\n';
      el.scrollTop = el.scrollHeight;
    }
  }
};

// Override console
(function () {
  var origLog   = console.log;
  var origError = console.error;
  var origWarn  = console.warn;

  console.log = function () {
    DEBUG.push('log', arguments);
    origLog.apply(console, arguments);
  };

  console.error = function () {
    DEBUG.push('error', arguments);
    origError.apply(console, arguments);
  };

  console.warn = function () {
    DEBUG.push('warn', arguments);
    origWarn.apply(console, arguments);
  };

  // Global error
  window.onerror = function (msg, src, line, col, err) {
    DEBUG.push('fatal', [msg, 'at', src + ':' + line + ':' + col]);
  };
})();
function debugToggle() {
  var panel = document.getElementById('debug-panel');
  if (!panel) return;

  panel.classList.toggle('debug-hidden');
}

function debugClose() {
  var panel = document.getElementById('debug-panel');
  if (panel) panel.classList.add('debug-hidden');
}

function debugClear() {
  DEBUG.logs = [];

  var el = document.getElementById('debug-content');
  if (el) el.textContent = '';
}

function debugCopy() {
  var text = DEBUG.logs.join('\n');

  navigator.clipboard.writeText(text)
    .then(function () {
      alert('Log berhasil disalin!');
    })
    .catch(function () {
      alert('Gagal copy');
    });
}
