'use strict';

/* ============================================================
1. BOOT SEQUENCE
============================================================ */
function boot () {
  // Add banner offset class
  document.body.classList.add('has-banner');

  // Trial: enforce expiry before anything else
  TRIAL.checkAndEnforce();

  if (DB.get(KEYS.SETUP_DONE)) {
    // Returning user - go straight to app
    document.getElementById('setup-wizard').style.display = 'none';
    document.getElementById('app-shell').style.display    = 'block';
    initApp();
  } else {
    // First time - show wizard
    document.getElementById('setup-wizard').style.display = 'block';
    document.getElementById('app-shell').style.display    = 'none';
  }

  // Global helpers
  initModalOverlayClose();
  initKeyboardShortcuts();
  initSidebarOverlay();
  TRIAL.startTicker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* ============================================================
2. APP INIT
============================================================ */
function initApp () {
  loadState();

  // Header
  var bizName = (state.biz && state.biz.name) ? state.biz.name : 'Usaha Saya';

  var el = document.getElementById('cal-biz-name');
  if (el) el.textContent = bizName;

  var sub = document.getElementById('cal-subtitle');
  if (sub) {
    sub.textContent = 'Selamat datang kembali! Kelola reservasi ' + bizName + ' dengan mudah.';
  }

  var sbBiz = document.getElementById('sidebar-biz-name');
  if (sbBiz) sbBiz.textContent = bizName;

  // Default view
  renderCalendar();
  setPageTitle('calendar');

  // Notification
  NOTIF.start();

  // Close notif dropdown on outside click
  if (!window._notifBound) {
  document.addEventListener('click', closeNotifHandler);
  window._notifBound = true;
}

}
/* ============================================================
3. VIEW ROUTER
============================================================ */
function showView (name) {
  // Hide all views
  var views = document.querySelectorAll('#content .view');
  views.forEach(function (v) {
    v.style.display = 'none';
    v.classList.remove('active-view');
  });

  // Show target
  var target = document.getElementById('view-' + name);
  if (target) {
    target.style.display = 'block';
    target.classList.add('active-view');
  }

  // Sidebar active state
  var navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(function (n) {
    n.classList.toggle('active', n.dataset.view === name);
  });

  // Breadcrumb
  setPageTitle(name);

  // Close mobile sidebar
  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebar-overlay');

  if (sidebar && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
  }

  // View-specific init
  if (name === 'menus')     renderMenusTable();
  if (name === 'locations') renderLocationsTable();
  if (name === 'customers') renderCustomersTable();
  if (name === 'analysis') {
    setupAnalysisSelectors();
    runAnalysis();
  }
  if (name === 'broadcast') loadBroadcastView();

  // Toggle add button
  var addBtn = document.getElementById('btn-add-res');
  if (addBtn) {
    addBtn.style.display = (name === 'detail') ? 'none' : 'flex';
  }
}
/* ============================================================
4. SETUP WIZARD CONTROLLER
============================================================ */

var wizardData = {
  bizName: '',
  bizType: '',
  locations: [],
  menus: []
};

function wizardNext (step) {
  // Validate step 1
  if (step === 2) {
    var name = document.getElementById('wz-biz-name').value.trim();
    if (!name) {
      showToast('Nama usaha wajib diisi!', 'error');
      return;
    }
    wizardData.bizName = name;
    wizardData.bizType = document.getElementById('wz-biz-type').value;
  }

  var steps = document.querySelectorAll('.wizard-step');
  steps.forEach(function (s) {
    s.classList.remove('active');
  });

  var next = document.getElementById('wizard-' + step);
  if (next) next.classList.add('active');
}
window.wizardNext = wizardNext;
/* ===================== LOCATION ===================== */

function wizardAddLocation () {
  var name = document.getElementById('wz-loc-name').value.trim();
  var cap  = parseInt(document.getElementById('wz-loc-cap').value, 10);

  if (!name || isNaN(cap) || cap < 1) {
    showToast('Isi nama lokasi dan kapasitas!', 'error');
    return;
  }

  var exists = wizardData.locations.some(function (l) {
    return l.name.toLowerCase() === name.toLowerCase();
  });

  if (exists) {
    showToast('Nama lokasi sudah ditambahkan!', 'error');
    return;
  }

  wizardData.locations.push({
    name: name,
    capacity: cap
  });

  document.getElementById('wz-loc-name').value = '';
  document.getElementById('wz-loc-cap').value  = '';

  _renderWizardLocations();
}

function _renderWizardLocations () {
  renderWizardList(
    'wz-locations-list',
    wizardData.locations,
    function (i) {
      wizardData.locations.splice(i, 1);
      _renderWizardLocations();
    },
    function (l) {
      return '<strong>' + escapeHtml(l.name) + '</strong> - ' + l.capacity + ' orang';
    }
  );
}
window.wizardAddLocation = wizardAddLocation;
/* ===================== MENU ===================== */

function wizardAddMenu () {
  var name = document.getElementById('wz-menu-name').value.trim();
  var price = parseInt(document.getElementById('wz-menu-price').value, 10) || 0;

  var details = document.getElementById('wz-menu-detail').value
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);

  if (!name) {
    showToast('Isi nama menu!', 'error');
    return;
  }

  var exists = wizardData.menus.some(function (m) {
    return m.name.toLowerCase() === name.toLowerCase();
  });

  if (exists) {
    showToast('Nama menu sudah ditambahkan!', 'error');
    return;
  }

  wizardData.menus.push({
    name: name,
    price: price,
    details: details
  });

  document.getElementById('wz-menu-name').value   = '';
  document.getElementById('wz-menu-price').value  = '';
  document.getElementById('wz-menu-detail').value = '';

  _renderWizardMenus();
}

function _renderWizardMenus () {
  renderWizardList(
    'wz-menus-list',
    wizardData.menus,
    function (i) {
      wizardData.menus.splice(i, 1);
      _renderWizardMenus();
    },
    function (m) {
      return '<strong>' + escapeHtml(m.name) + '</strong> - Rp' + formatRupiah(m.price);
    }
  );
}
window.wizardAddMenu = wizardAddMenu;
/* ===================== GENERIC LIST ===================== */

function renderWizardList (containerId, arr, onRemove, labelFn) {
  var el = document.getElementById(containerId);
  if (!el) return;

  if (!arr.length) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = arr.map(function (item, i) {
    return (
      '<div class="wz-added-item">' +
        '<span>' + labelFn(item) + '</span>' +
        (onRemove
          ? '<button class="wz-remove" onclick="wizardRemoveItem(\'' + containerId + '\',' + i + ')" title="Hapus">' +
              '<i class="fas fa-times"></i>' +
            '</button>'
          : '') +
      '</div>'
    );
  }).join('');
}

function wizardRemoveItem (containerId, index) {
  if (containerId === 'wz-locations-list') {
    wizardData.locations.splice(index, 1);
    _renderWizardLocations();
  } else {
    wizardData.menus.splice(index, 1);
    _renderWizardMenus();
  }
}

/* ===================== FINISH ===================== */

function wizardFinish () {
  if (!wizardData.bizName) {
    showToast('Nama usaha belum diisi!', 'error');
    wizardNext(1);
    return;
  }

  // Save biz
  state.biz = {
    name: wizardData.bizName,
    type: wizardData.bizType
  };
  saveBiz();

  // Save locations
  wizardData.locations.forEach(function (loc) {
    state.locations[genId()] = {
      name: loc.name,
      capacity: loc.capacity
    };
  });
  saveLocations();

  // Save menus
  wizardData.menus.forEach(function (m) {
    state.menus[genId()] = {
      name: m.name,
      price: m.price,
      details: m.details
    };
  });
  saveMenus();

  // Finalize
  DB.set(KEYS.SETUP_DONE, true);
  TRIAL.init();

  document.getElementById('setup-wizard').style.display = 'none';
  document.getElementById('app-shell').style.display    = 'block';

  initApp();

  showToast('Selamat datang di Proserva! 🎉', 'success', 4000);
}
window.wizardFinish = wizardFinish
/* ============================================================
5. CALENDAR VIEW
============================================================ */

function navMonth (dir) {
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

function goToToday () {
  var now = new Date();
  state.currentMonth = now.getMonth();
  state.currentYear  = now.getFullYear();
  renderCalendar();
}

function renderCalendar () {
  var m = state.currentMonth;
  var y = state.currentYear;

  var label = document.getElementById('cal-month-label');
  if (label) label.textContent = MONTHS_ID[m] + ' ' + y;

  var firstDay    = new Date(y, m, 1).getDay();
  var daysInMonth = new Date(y, m + 1, 0).getDate();
  var monthRes    = getResForMonth(y, m);

  var dayCounts = {};
  var dayNames  = {};

  monthRes.forEach(function (r) {
    if (!r.date) return;

    var parts = r.date.split('-');
    var d = parseInt(parts[2], 10);

    dayCounts[d] = (dayCounts[d] || 0) + 1;

    if (!dayNames[d]) dayNames[d] = [];
    if (dayNames[d].length < 3) {
      dayNames[d].push(r.nama || '?');
    }
  });

  // Stats
  var totalPax = monthRes.reduce(function (s, r) {
    return s + (parseInt(r.jumlah, 10) || 0);
  }, 0);

  var totalDp = monthRes.reduce(function (s, r) {
    return s + (parseInt(r.dp, 10) || 0);
  }, 0);

  var busiestDay = '-';

  if (Object.keys(dayCounts).length > 0) {
    var top = Object.entries(dayCounts)
      .sort(function (a, b) { return b[1] - a[1]; })[0];

    busiestDay = top[0] + ' ' + MONTHS_SHORT[m] + ' (' + top[1] + ')';
  }

  setText('stat-total', monthRes.length);
  setText('stat-pax', totalPax);
  setText('stat-dp', 'Rp' + formatRupiahK(totalDp));
  setText('stat-busiest', busiestDay);

  var today = new Date();
  var calEl = document.getElementById('cal-days');
  if (!calEl) return;

  calEl.innerHTML = '';

  // Offset kosong
  for (var i = 0; i < firstDay; i++) {
    calEl.insertAdjacentHTML('beforeend', '<div class="cal-day empty"></div>');
  }

  // Render hari
  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = buildDateStr(y, m + 1, d);

    var isToday =
      today.getFullYear() === y &&
      today.getMonth() === m &&
      today.getDate() === d;

    var isSelected = state.selectedDate === dateStr;

    var count = dayCounts[d] || 0;
    var names = dayNames[d]  || [];

    var cls = 'cal-day';
    if (isToday) cls += ' today';
    if (isSelected) cls += ' selected';

    var pillHtml = '';
    if (count > 0) {
      pillHtml =
        '<div class="cal-res-pill">' +
          '<i class="fas fa-calendar-check"></i> ' + count +
        '</div>';
    }

    var namesHtml = '';
    if (names.length > 0) {
      namesHtml =
        '<div class="cal-mini-names">' +
          names.map(function (n) {
            return '<div class="cal-mini-name">' + escapeHtml(n) + '</div>';
          }).join('') +
        '</div>';
    }

    calEl.insertAdjacentHTML(
      'beforeend',
      '<div class="' + cls + '" onclick="selectDate(\'' + dateStr + '\')">' +
        '<div class="cal-day-num">' + d + '</div>' +
        pillHtml +
        namesHtml +
      '</div>'
    );
  }
}

/* ===================== SELECT DATE ===================== */

function selectDate (dateStr) {
  state.selectedDate = dateStr;

  var parts = dateStr.split('-');
  var d = parseInt(parts[2], 10);
  var m = parseInt(parts[1], 10) - 1;
  var y = parseInt(parts[0], 10);

  setText('detail-title', d + ' ' + MONTHS_ID[m] + ' ' + y);
  setPageTitle('detail');

  // Switch view manual
  var views = document.querySelectorAll('#content .view');
  views.forEach(function (v) {
    v.style.display = 'none';
    v.classList.remove('active-view');
  });

  var dv = document.getElementById('view-detail');
  if (dv) {
    dv.style.display = 'block';
    dv.classList.add('active-view');
  }

  var navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(function (n) {
    n.classList.remove('active');
  });

  // Hide add button
  var addBtn = document.getElementById('btn-add-res');
  if (addBtn) addBtn.style.display = 'none';

  renderDetailList(getResForDate(dateStr));

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function backToCalendar () {
  state.selectedDate = null;
  showView('calendar');
  renderCalendar();
}
/* ============================================================
6. DETAIL VIEW - Reservation Cards
============================================================ */

function renderDetailList (reservations) {
  var el = document.getElementById('detail-list');
  if (!el) return;

  if (!reservations || reservations.length === 0) {
    el.innerHTML =
      '<div class="empty-state">' +
        '<div class="es-icon"><i class="fas fa-calendar-times"></i></div>' +
        '<div class="es-title">Belum ada reservasi</div>' +
        '<div class="es-sub">Klik tombol <strong>Tambah</strong> untuk menambah reservasi baru</div>' +
      '</div>';
    return;
  }

  var sorted = reservations.slice().sort(function (a, b) {
    return (a.jam || '').localeCompare(b.jam || '');
  });

  el.innerHTML = sorted.map(buildResCardHTML).join('');
}

function buildResCardHTML (r) {
  /* ===== MENU SECTION ===== */
  var menuHtml =
    '<div style="color:var(--ink-4);font-size:0.82rem;font-style:italic;">Tidak ada pesanan</div>';

  if (Array.isArray(r.menus) && r.menus.length > 0) {
    menuHtml = r.menus.map(function (item) {
      var md = getMenuByName(item.name);
      var details = md ? (md.details || []) : [];

      return (
        '<div class="rc-menu-item">' +
          '<strong>' + item.quantity + 'x ' + escapeHtml(item.name) + '</strong>' +
          (details.length
            ? '<div class="rc-menu-sub">' + details.map(escapeHtml).join(' · ') + '</div>'
            : '') +
        '</div>'
      );
    }).join('');
  }

  /* ===== INFO CHIPS ===== */
  var chips = '';

  if (r.nomorHp) {
    chips +=
      '<div class="rc-info-chip">' +
        '<i class="fas fa-phone"></i>' + escapeHtml(r.nomorHp) +
      '</div>';
  }

  if (r.dp > 0) {
    chips +=
      '<div class="rc-info-chip">' +
        '<i class="fas fa-money-bill-wave"></i>' +
        'DP Rp' + formatRupiah(r.dp) +
        (r.tipeDp ? ' · ' + escapeHtml(r.tipeDp) : '') +
      '</div>';
  }

  if (r.tambahan) {
    chips +=
      '<div class="rc-info-chip">' +
        '<i class="fas fa-comment-dots"></i>' +
        escapeHtml(r.tambahan) +
      '</div>';
  }

  /* ===== THANK YOU BUTTON ===== */
  var thankBtn = '';

  if (r.nomorHp) {
    if (r.thankYouSent) {
      thankBtn =
        '<button class="btn-success-soft" disabled>' +
          '<i class="fas fa-check-circle"></i> Terima Kasih Terkirim' +
        '</button>';
    } else {
      thankBtn =
        '<button class="btn-secondary" style="font-size:0.78rem;padding:7px 11px;" onclick="sendThankYouById(\'' + r.id + '\')">' +
          '<i class="fas fa-gift"></i> Ucapan Terima Kasih' +
        '</button>';
    }
  }

  var initials = getInitials(r.nama || '?');
  var avatarBg = nameToColor(r.nama || '?');

  /* ===== CARD ===== */
  return (
    '<div class="res-card" id="res-card-' + r.id + '">' +

      /* TOP */
      '<div class="rc-top">' +
        '<div class="rc-name">' +
          '<div class="rc-avatar" style="background:' + avatarBg + ';">' +
            initials +
          '</div>' +
          escapeHtml(r.nama || 'Tanpa Nama') +
        '</div>' +

        '<div class="rc-badges">' +
          '<span class="badge badge-orange"><i class="far fa-clock"></i> ' + escapeHtml(r.jam || '?') + '</span>' +
          '<span class="badge badge-gray"><i class="fas fa-map-pin"></i> ' + escapeHtml(r.tempat || '?') + '</span>' +
          '<span class="badge badge-green"><i class="fas fa-users"></i> ' + (r.jumlah || '?') + ' orang</span>' +
        '</div>' +
      '</div>' +

      /* BODY */
      '<div class="rc-body">' +
        '<div class="rc-section-title">Pesanan</div>' +
        menuHtml +
        (chips ? '<div style="margin-top:12px;">' + chips + '</div>' : '') +
      '</div>' +

      /* FOOTER */
      '<div class="rc-footer">' +

        (r.nomorHp
          ? '<button class="btn-wa-soft" onclick="contactWA(\'' + r.id + '\')">' +
              '<i class="fab fa-whatsapp"></i> Hubungi' +
            '</button>'
          : '') +

        thankBtn +

        '<button class="btn-info-soft" onclick="openEditReservationModal(\'' + r.id + '\')">' +
          '<i class="fas fa-edit"></i> Edit' +
        '</button>' +

        '<button class="btn-danger-soft" onclick="deleteRes(\'' + r.id + '\')">' +
          '<i class="fas fa-trash-alt"></i>' +
        '</button>' +

      '</div>' +

    '</div>'
  );
}

/* ===================== FILTER ===================== */

function filterDetailList (q) {
  if (!state.selectedDate) return;

  var all = getResForDate(state.selectedDate);
  var query = q.toLowerCase();

  var result = !query
    ? all
    : all.filter(function (r) {
        return (
          (r.nama && r.nama.toLowerCase().includes(query)) ||
          (r.tempat && r.tempat.toLowerCase().includes(query)) ||
          (r.nomorHp && r.nomorHp.includes(query)) ||
          (Array.isArray(r.menus) && r.menus.some(function (m) {
            return m.name.toLowerCase().includes(query);
          }))
        );
      });

  renderDetailList(result);
}
/* ============================================================
7. RESERVATION CRUD
============================================================ */

function openAddReservationModal () {
  clearFormErrors();

  document.getElementById('res-edit-id').value = '';
  document.getElementById('res-modal-title').innerHTML =
    '<i class="fas fa-calendar-plus"></i> Tambah Reservasi';

  // Reset fields
  ['res-nama', 'res-hp', 'res-tambahan'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });

  document.getElementById('res-jam').value     = '';
  document.getElementById('res-jumlah').value  = '';
  document.getElementById('res-dp').value      = '0';
  document.getElementById('res-tipe-dp').value = '';
  document.getElementById('res-cap-hint').textContent = '';

  populateLocationSelect('res-tempat', '');

  var mc = document.getElementById('res-menus-container');
  if (mc) mc.innerHTML = '';

  addMenuRow('res-menus-container');

  openModal('modal-reservation');
}

function openEditReservationModal (id) {
  var r = findReservationById(id);
  if (!r) {
    showToast('Reservasi tidak ditemukan!', 'error');
    return;
  }

  clearFormErrors();

  document.getElementById('res-edit-id').value = id;
  document.getElementById('res-modal-title').innerHTML =
    '<i class="fas fa-edit"></i> Edit Reservasi';

  document.getElementById('res-nama').value     = r.nama || '';
  document.getElementById('res-hp').value       = r.nomorHp || '';
  document.getElementById('res-jam').value      = r.jam || '';
  document.getElementById('res-jumlah').value   = r.jumlah || '';
  document.getElementById('res-dp').value       = r.dp || 0;
  document.getElementById('res-tipe-dp').value  = r.tipeDp || '';
  document.getElementById('res-tambahan').value = r.tambahan || '';

  populateLocationSelect('res-tempat', r.tempat);
  onLocationChange();

  var mc = document.getElementById('res-menus-container');
  if (mc) {
    mc.innerHTML = '';

    if (Array.isArray(r.menus) && r.menus.length > 0) {
      r.menus.forEach(function (item) {
        addMenuRow('res-menus-container', item.name, item.quantity);
      });
    } else {
      addMenuRow('res-menus-container');
    }
  }

  openModal('modal-reservation');
}

function saveReservation () {
  clearFormErrors();

  var nama     = document.getElementById('res-nama').value.trim();
  var hp       = document.getElementById('res-hp').value.trim();
  var jam      = document.getElementById('res-jam').value;
  var jumlah   = parseInt(document.getElementById('res-jumlah').value, 10);
  var tempat   = document.getElementById('res-tempat').value;
  var dp       = parseInt(document.getElementById('res-dp').value, 10) || 0;
  var tipeDp   = document.getElementById('res-tipe-dp').value;
  var tambahan = document.getElementById('res-tambahan').value.trim();

  var valid = true;

  if (!nama) {
    showFieldError('err-nama', 'Nama wajib diisi');
    valid = false;
  }

  if (hp && !validatePhone(hp)) {
    showFieldError('err-hp', 'Nomor HP tidak valid (10-13 digit)');
    valid = false;
  }

  if (!jam) {
    showFieldError('err-jam', 'Jam wajib diisi');
    valid = false;
  }

  if (!jumlah || jumlah < 1) {
    showFieldError('err-jumlah', 'Jumlah tamu minimal 1');
    valid = false;
  }

  if (!tempat) {
    showFieldError('err-tempat', 'Lokasi wajib dipilih');
    valid = false;
  }

  // Capacity check
  if (tempat && jumlah) {
    var loc = getLocationByName(tempat);
    if (loc && jumlah > loc.capacity) {
      showFieldError(
        'err-jumlah',
        'Melebihi kapasitas lokasi (maks. ' + loc.capacity + ' orang)'
      );
      valid = false;
    }
  }

  /* ===== MENUS ===== */
  var menus = [];
  var usedNames = {};
  var menuValid = true;

  var rows = document.querySelectorAll('#res-menus-container .menu-row');

  rows.forEach(function (row) {
    var sel = row.querySelector('select');
    var qtyInput = row.querySelector('input[type="number"]');

    var val = sel ? sel.value : '';
    var qty = parseInt(qtyInput ? qtyInput.value : 0, 10);

    if (!val) return;

    if (!qty || qty < 1) {
      showFieldError('err-menus', 'Jumlah menu minimal 1');
      menuValid = false;
      return;
    }

    if (usedNames[val]) {
      showFieldError('err-menus', 'Menu ' + val + ' dipilih lebih dari satu kali');
      menuValid = false;
      return;
    }

    usedNames[val] = true;

    menus.push({
      name: val,
      quantity: qty
    });
  });

  if (!menuValid) valid = false;
  if (!valid) return;

  var editId  = document.getElementById('res-edit-id').value;
  var dateStr = state.selectedDate || todayStr();

  if (editId) {
    var existing = findReservationById(editId);
    if (!existing) {
      showToast('Reservasi tidak ditemukan!', 'error');
      return;
    }

    var updated = Object.assign({}, existing, {
      nama: nama,
      nomorHp: normalizePhone(hp),
      jam: jam,
      jumlah: jumlah,
      dp: dp,
      tipeDp: tipeDp,
      tempat: tempat,
      tambahan: tambahan,
      menus: menus
    });

    updateReservation(updated);
    showToast('Reservasi berhasil diperbarui!', 'success');

  } else {
    var newRes = {
      id: genId(),
      date: dateStr,
      nama: nama,
      nomorHp: normalizePhone(hp),
      jam: jam,
      jumlah: jumlah,
      dp: dp,
      tipeDp: tipeDp,
      tempat: tempat,
      tambahan: tambahan,
      menus: menus,
      createdAt: Date.now(),
      thankYouSent: false
    };

    addReservation(newRes);
    showToast('Reservasi berhasil disimpan! 🎉', 'success');
  }

  closeModal('modal-reservation');

  if (state.selectedDate) {
    renderDetailList(getResForDate(state.selectedDate));
  }

  renderCalendar();
}

function deleteRes (id) {
  var r = findReservationById(id);
  var name = r ? r.nama : 'reservasi ini';

  if (!confirm('Hapus reservasi untuk ' + name + '?\n\nTindakan ini tidak bisa dibatalkan.')) {
    return;
  }

  deleteReservation(id);

  showToast('Reservasi dihapus', 'info');

  if (state.selectedDate) {
    renderDetailList(getResForDate(state.selectedDate));
  }

  renderCalendar();
}
/* ============================================================
8. MENU ROWS (multi-item picker inside reservation modal)
============================================================ */

function addMenuRow (containerId, menuName, qty) {
  menuName = menuName || '';
  qty      = qty || 1;

  var container = document.getElementById(containerId);
  if (!container) return;

  var menus = getMenusSorted();

  if (menus.length === 0) {
    container.innerHTML =
      '<div style="padding:12px;text-align:center;color:var(--ink-4);font-size:0.82rem;">' +
      'Belum ada menu. <a onclick="showView(\\'menus\\')" style="color:var(--accent);cursor:pointer;">Tambah menu dulu</a>' +
      '</div>';
    return;
  }

  var opts = menus.map(function (m) {
    var sel   = m.name === menuName ? ' selected' : '';
    var price = m.price ? ' — Rp' + formatRupiah(m.price) : '';

    return '<option value="' + escapeHtml(m.name) + '"' + sel + '>' +
           escapeHtml(m.name) + price +
           '</option>';
  }).join('');

  var uid = genId();

  var div = document.createElement('div');
  div.className = 'menu-row';

  div.innerHTML =
    '<select class="form-input mr-select" onchange="updateMenuRowPrice(this)">' +
      '<option value="">Pilih menu…</option>' +
      opts +
    '</select>' +

    '<input type="number" class="form-input mr-qty" value="' + qty + '" min="1"/>' +

    '<span class="mr-price" id="mrp-' + uid + '"></span>' +

    '<button class="mr-del" onclick="this.closest(\'.menu-row\').remove()" title="Hapus baris">' +
      '<i class="fas fa-times"></i>' +
    '</button>';

  container.appendChild(div);

  if (menuName) {
    updateMenuRowPrice(div.querySelector('select'));
  }
}

function updateMenuRowPrice (sel) {
  var row = sel.closest('.menu-row');
  if (!row) return;

  var priceEl = row.querySelector('.mr-price');
  if (!priceEl) return;

  var m = getMenuByName(sel.value);

  priceEl.textContent = (m && m.price)
    ? 'Rp' + formatRupiah(m.price)
    : '';
}

/* ============================================================
LOCATION SELECT + CAPACITY HINT
============================================================ */

function populateLocationSelect (selectId, selectedValue) {
  var sel = document.getElementById(selectId);
  if (!sel) return;

  sel.innerHTML = '<option value="">Pilih lokasi…</option>';

  getLocationsSorted().forEach(function (loc) {
    var opt = document.createElement('option');

    opt.value = loc.name;
    opt.textContent = loc.name + ' (maks. ' + loc.capacity + ' orang)';

    if (loc.name === selectedValue) {
      opt.selected = true;
    }

    sel.appendChild(opt);
  });
}

function onLocationChange () {
  var tempat = document.getElementById('res-tempat').value;
  var loc    = getLocationByName(tempat);

  var hint = document.getElementById('res-cap-hint');

  if (hint) {
    hint.textContent = loc
      ? 'Kapasitas: ' + loc.capacity + ' orang'
      : '';
  }
}
/* ============================================================
9. MENUS MANAGEMENT
============================================================ */

function renderMenusTable () {
  var tbody = document.getElementById('menus-tbody');
  if (!tbody) return;

  var menus = getMenusSorted();

  if (menus.length === 0) {
    tbody.innerHTML =
      '<tr>' +
        '<td colspan="4" style="text-align:center;padding:36px;color:var(--ink-4);">' +
          'Belum ada menu. Klik <strong>Tambah Menu</strong> untuk mulai.' +
        '</td>' +
      '</tr>';
    return;
  }

  tbody.innerHTML = menus.map(function (m) {
    return (
      '<tr>' +
        '<td><strong>' + escapeHtml(m.name) + '</strong></td>' +

        '<td>' +
          (m.price
            ? '<span class="chip chip-orange">Rp ' + formatRupiah(m.price) + '</span>'
            : '<span class="chip chip-gray">Gratis</span>') +
        '</td>' +

        '<td>' +
          '<span style="font-size:0.82rem;color:var(--ink-3);">' +
            (m.details && m.details.length
              ? m.details.map(escapeHtml).join(', ')
              : '—') +
          '</span>' +
        '</td>' +

        '<td>' +
          '<div style="display:flex;gap:6px;">' +

            '<button class="btn-info-soft" onclick="openMenuModal(\'' + m.id + '\')">' +
              '<i class="fas fa-edit"></i>' +
            '</button>' +

            '<button class="btn-danger-soft" onclick="deleteMenu(\'' + m.id + '\')">' +
              '<i class="fas fa-trash-alt"></i>' +
            '</button>' +

          '</div>' +
        '</td>' +
      '</tr>'
    );
  }).join('');
}

function openMenuModal (editId) {
  editId = editId || null;

  document.getElementById('menu-edit-id').value = editId || '';

  if (editId && state.menus[editId]) {
    var m = state.menus[editId];

    document.getElementById('menu-modal-title').innerHTML =
      '<i class="fas fa-edit"></i> Edit Menu';

    document.getElementById('menu-name').value    = m.name;
    document.getElementById('menu-price').value   = m.price || '';
    document.getElementById('menu-details').value = (m.details || []).join(', ');

  } else {
    document.getElementById('menu-modal-title').innerHTML =
      '<i class="fas fa-utensils"></i> Tambah Menu';

    document.getElementById('menu-name').value    = '';
    document.getElementById('menu-price').value   = '';
    document.getElementById('menu-details').value = '';
  }

  openModal('modal-menu');
}

function saveMenu () {
  var name    = document.getElementById('menu-name').value.trim();
  var price   = parseInt(document.getElementById('menu-price').value, 10) || 0;
  var details = document.getElementById('menu-details').value
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);

  var editId = document.getElementById('menu-edit-id').value;

  if (!name) {
    showToast('Nama menu wajib diisi!', 'error');
    return;
  }

  // Duplicate check (exclude self)
  var isDupe = Object.entries(state.menus).some(function (entry) {
    return entry[1].name.toLowerCase() === name.toLowerCase() &&
           entry[0] !== editId;
  });

  if (isDupe) {
    showToast('Nama menu sudah ada!', 'error');
    return;
  }

  if (editId) {
    state.menus[editId] = {
      name: name,
      price: price,
      details: details
    };
  } else {
    state.menus[genId()] = {
      name: name,
      price: price,
      details: details
    };
  }

  saveMenus();
  renderMenusTable();
  closeModal('modal-menu');

  showToast('Menu "' + name + '" berhasil disimpan!', 'success');
}

function deleteMenu (id) {
  var name = state.menus[id] ? state.menus[id].name : 'menu ini';

  if (!confirm('Hapus menu "' + name + '"?\n\nMenu ini juga akan hilang dari semua reservasi yang sudah ada.')) {
    return;
  }

  delete state.menus[id];

  saveMenus();
  renderMenusTable();

  showToast('Menu dihapus', 'info');
}
/* ============================================================
10. LOCATIONS MANAGEMENT
============================================================ */

function renderLocationsTable () {
  var tbody = document.getElementById('locations-tbody');
  if (!tbody) return;

  var locs = getLocationsSorted();

  if (locs.length === 0) {
    tbody.innerHTML =
      '<tr>' +
        '<td colspan="3" style="text-align:center;padding:36px;color:var(--ink-4);">' +
          'Belum ada lokasi. Klik <strong>Tambah Lokasi</strong> untuk mulai.' +
        '</td>' +
      '</tr>';
    return;
  }

  tbody.innerHTML = locs.map(function (loc) {
    return (
      '<tr>' +
        '<td><strong>' + escapeHtml(loc.name) + '</strong></td>' +

        '<td>' +
          '<span class="chip chip-blue">' +
            '<i class="fas fa-users"></i> ' + loc.capacity + ' orang' +
          '</span>' +
        '</td>' +

        '<td>' +
          '<div style="display:flex;gap:6px;">' +

            '<button class="btn-info-soft" onclick="openLocationModal(\'' + loc.id + '\')">' +
              '<i class="fas fa-edit"></i>' +
            '</button>' +

            '<button class="btn-danger-soft" onclick="deleteLocation(\'' + loc.id + '\')">' +
              '<i class="fas fa-trash-alt"></i>' +
            '</button>' +

          '</div>' +
        '</td>' +
      '</tr>'
    );
  }).join('');
}

function openLocationModal (editId) {
  editId = editId || null;

  document.getElementById('loc-edit-id').value = editId || '';

  if (editId && state.locations[editId]) {
    var loc = state.locations[editId];

    document.getElementById('loc-modal-title').innerHTML =
      '<i class="fas fa-edit"></i> Edit Lokasi';

    document.getElementById('loc-name').value     = loc.name;
    document.getElementById('loc-capacity').value = loc.capacity;

  } else {
    document.getElementById('loc-modal-title').innerHTML =
      '<i class="fas fa-map-marker-alt"></i> Tambah Lokasi';

    document.getElementById('loc-name').value     = '';
    document.getElementById('loc-capacity').value = '';
  }

  openModal('modal-location');
}

function saveLocation () {
  var name     = document.getElementById('loc-name').value.trim();
  var capacity = parseInt(document.getElementById('loc-capacity').value, 10);
  var editId   = document.getElementById('loc-edit-id').value;

  if (!name) {
    showToast('Nama lokasi wajib diisi!', 'error');
    return;
  }

  if (!capacity || capacity < 1) {
    showToast('Kapasitas minimal 1 orang!', 'error');
    return;
  }

  // Duplicate check (exclude self)
  var isDupe = Object.entries(state.locations).some(function (entry) {
    return entry[1].name.toLowerCase() === name.toLowerCase() &&
           entry[0] !== editId;
  });

  if (isDupe) {
    showToast('Nama lokasi sudah ada!', 'error');
    return;
  }

  if (editId) {
    state.locations[editId] = {
      name: name,
      capacity: capacity
    };
  } else {
    state.locations[genId()] = {
      name: name,
      capacity: capacity
    };
  }

  saveLocations();
  renderLocationsTable();
  closeModal('modal-location');

  showToast('Lokasi "' + name + '" berhasil disimpan!', 'success');
}

function deleteLocation (id) {
  var name = state.locations[id]
    ? state.locations[id].name
    : 'lokasi ini';

  if (!confirm('Hapus lokasi "' + name + '"?')) return;

  delete state.locations[id];

  saveLocations();
  renderLocationsTable();

  showToast('Lokasi dihapus', 'info');
}
/* ============================================================
11. CUSTOMERS VIEW
============================================================ */

var _allCustomers = [];

function renderCustomersTable (filter) {
  filter = filter || '';

  _allCustomers = buildCustomerList();

  var tbody = document.getElementById('customers-tbody');
  if (!tbody) return;

  var list = filter
    ? _allCustomers.filter(function (c) {
        return (
          c.nama.toLowerCase().includes(filter.toLowerCase()) ||
          (c.nomorHp && c.nomorHp.includes(filter))
        );
      })
    : _allCustomers;

  if (list.length === 0) {
    tbody.innerHTML =
      '<tr>' +
        '<td colspan="5" style="text-align:center;padding:36px;color:var(--ink-4);">' +
          (filter
            ? 'Tidak ada hasil untuk "' + escapeHtml(filter) + '"'
            : 'Belum ada data pelanggan.') +
        '</td>' +
      '</tr>';
    return;
  }

  tbody.innerHTML = list.map(function (c) {

    var waBtn = '';

    if (c.nomorHp) {
      waBtn =
        '<button class="btn-wa-soft" ' +
          'data-phone="' + escapeHtml(c.nomorHp) + '" ' +
          'data-name="'  + escapeHtml(c.nama)    + '" ' +
          'onclick="contactCustomerWAFromBtn(this)">' +
          '<i class="fab fa-whatsapp"></i> Hubungi' +
        '</button>';
    }

    return (
      '<tr>' +

        '<td>' +
          '<div style="display:flex;align-items:center;gap:9px;">' +

            '<div style="' +
              'width:32px;height:32px;border-radius:50%;' +
              'background:' + nameToColor(c.nama) + ';' +
              'color:white;font-size:0.72rem;font-weight:700;' +
              'display:flex;align-items:center;justify-content:center;' +
              'flex-shrink:0;">' +
              getInitials(c.nama) +
            '</div>' +

            '<strong>' + escapeHtml(c.nama) + '</strong>' +
          '</div>' +
        '</td>' +

        '<td>' +
          (c.nomorHp
            ? '<span class="chip chip-gray">' + escapeHtml(c.nomorHp) + '</span>'
            : '<span style="color:var(--ink-4);">—</span>') +
        '</td>' +

        '<td>' +
          '<span class="chip chip-orange">' + c.count + 'x kunjungan</span>' +
        '</td>' +

        '<td>' +
          (c.lastDate ? formatDateDisplay(c.lastDate) : '—') +
        '</td>' +

        '<td>' + waBtn + '</td>' +

      '</tr>'
    );
  }).join('');
}

/* ============================================================
CUSTOMER ACTIONS
============================================================ */

function contactCustomerWAFromBtn (btn) {
  var phone = btn.getAttribute('data-phone');
  var name  = btn.getAttribute('data-name');

  if (!phone || !name) return;

  contactCustomerWA(phone, name);
}

function filterCustomers (q) {
  renderCustomersTable(q);
}

function contactCustomerWA (phone, name) {
  var msg =
    'Halo Kak *' + name + '* 👋\n\n' +
    'Kami dari *' + state.biz.name + '* ingin menyapa. ' +
    'Terima kasih sudah pernah berkunjung! 😊\n\n' +
    'Ada yang bisa kami bantu atau ada pertanyaan mengenai reservasi?';

  openWhatsApp(phone, msg);
}
/* ============================================================
12. WHATSAPP ACTIONS
============================================================ */

function contactWA (id) {
  var r = findReservationById(id);

  if (!r || !r.nomorHp) {
    showToast('Nomor HP tidak tersedia', 'error');
    return;
  }

  openWhatsApp(r.nomorHp, buildConfirmationMsg(r));
}

function sendThankYouById (id) {
  var r = findReservationById(id);

  if (!r || !r.nomorHp) {
    showToast('Nomor HP tidak tersedia', 'error');
    return;
  }

  // Kirim pesan
  openWhatsApp(r.nomorHp, buildThankYouMsg(r));

  // Mark as sent
  var updated = Object.assign({}, r, {
    thankYouSent: true
  });

  updateReservation(updated);

  showToast('Pesan terima kasih dikirim! 🎉', 'success');

  // Update tombol di card tanpa re-render full
  var card = document.getElementById('res-card-' + id);

  if (card) {
    var btn = card.querySelector('[onclick*="sendThankYouById"]');

    if (btn) {
      btn.outerHTML =
        '<button class="btn-success-soft" disabled>' +
          '<i class="fas fa-check-circle"></i> Terima Kasih Terkirim' +
        '</button>';
    }
  }

  // Refresh notif list
  NOTIF.render();

  // Hapus dari dropdown notif (jika ada)
  var ni = document.getElementById('ni-' + id);

  if (ni) {
    ni.style.opacity   = '0';
    ni.style.transform = 'translateY(-6px)';
    ni.style.transition = 'all 0.25s ease';

    setTimeout(function () {
      ni.remove();
      NOTIF.render();
    }, 280);
  }
}

/* ============================================================
SHARE VIA WHATSAPP
============================================================ */

function shareWA (scope) {
  if (scope === 'day' && state.selectedDate) {

    var res = getResForDate(state.selectedDate)
      .slice()
      .sort(function (a, b) {
        return (a.jam || '').localeCompare(b.jam || '');
      });

    var msg = buildDailySummaryMsg(state.selectedDate, res);

    window.open(
      'https://wa.me/?text=' + encodeURIComponent(msg),
      '_blank',
      'noopener'
    );
  }
}
/* ============================================================
13. PRINT
============================================================ */

function showPrintOptions () {
  openModal('modal-print');
}

function executePrint () {
  closeModal('modal-print');

  var reservations = getResForDate(state.selectedDate || '')
    .slice()
    .sort(function (a, b) {
      return (a.jam || '').localeCompare(b.jam || '');
    });

  var opts = {
    menu:     document.getElementById('po-menu').checked,
    hp:       document.getElementById('po-hp').checked,
    dp:       document.getElementById('po-dp').checked,
    tambahan: document.getElementById('po-tambahan').checked
  };

  var html = buildPrintHTML(state.selectedDate || '', reservations, opts);

  var w = window.open('', '_blank', 'noopener');

  if (!w) {
    showToast('Pop-up diblokir. Izinkan pop-up untuk mencetak.', 'error');
    return;
  }

  w.document.write(html);
  w.document.close();

  // Delay kecil agar DOM siap sebelum print
  setTimeout(function () {
    w.print();
  }, 600);
}
/* ============================================================
14. EXPORT / IMPORT UI
============================================================ */

function handleExport () {
  var code = exportData();

  document.getElementById('export-output').value = code;
  document.getElementById('import-input').value  = '';

  openModal('modal-export');
}

function copyExport () {
  var el = document.getElementById('export-output');

  if (!el || !el.value) {
    showToast('Tidak ada data untuk disalin', 'error');
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(el.value)
      .then(function () {
        showToast('Kode backup berhasil disalin! 📋', 'success');
      })
      .catch(function () {
        fallbackCopy(el);
      });
  } else {
    fallbackCopy(el);
  }
}

function fallbackCopy (el) {
  el.select();
  document.execCommand('copy');

  showToast('Kode backup disalin!', 'success');
}

function doImportData () {
  var code = document.getElementById('import-input').value.trim();

  if (!code) {
    showToast('Tempel kode backup terlebih dahulu!', 'error');
    return;
  }

  var validated;

  try {
    validated = JSON.parse(
      decodeURIComponent(
        escape(
          atob(code.trim())
        )
      )
    );

    if (!validated.v) {
      throw new Error('format tidak valid (missing version)');
    }

  } catch (e) {
    showToast('Kode backup tidak valid: ' + e.message, 'error');
    return;
  }

  if (!confirm('Import akan menggantikan semua data saat ini. Lanjutkan?')) {
    return;
  }

  // Assign data (safe fallback)
  state.biz          = validated.biz          || state.biz;
  state.menus        = validated.menus        || {};
  state.locations    = validated.locations    || {};
  state.reservations = validated.reservations || {};

  saveBiz();
  saveMenus();
  saveLocations();
  saveReservations();

  DB.set(KEYS.SETUP_DONE, true);

  showToast('Data berhasil diimport! ✅', 'success');

  closeModal('modal-export');
  initApp();
}
/* ============================================================
15. ANALYSIS VIEW
============================================================ */

var _anlChartInstance = null;

function setupAnalysisSelectors () {
  var yearSel  = document.getElementById('anl-year');
  var monthSel = document.getElementById('anl-month');

  if (!yearSel || !monthSel) return;

  var curYear = new Date().getFullYear();

  yearSel.innerHTML = '';

  for (var y = curYear; y >= curYear - 4; y--) {
    yearSel.insertAdjacentHTML(
      'beforeend',
      '<option value="' + y + '">' + y + '</option>'
    );
  }

  monthSel.innerHTML = '<option value="all">Satu Tahun Penuh</option>';

  MONTHS_ID.forEach(function (name, i) {
    var sel = i === new Date().getMonth() ? ' selected' : '';

    monthSel.insertAdjacentHTML(
      'beforeend',
      '<option value="' + i + '"' + sel + '>' + name + '</option>'
    );
  });
}

function runAnalysis () {
  var year     = parseInt(document.getElementById('anl-year').value, 10);
  var monthVal = document.getElementById('anl-month').value;

  var allRes = getAllReservations();

  var filtered, chartMode, chartMonth;

  if (monthVal === 'all') {
    filtered = allRes.filter(function (r) {
      return r.date && r.date.startsWith(String(year));
    });

    chartMode  = 'month';
    chartMonth = null;

  } else {
    var mIdx = parseInt(monthVal, 10);
    var mk   = getMonthKey(year, mIdx);

    filtered   = state.reservations[mk] || [];
    chartMode  = 'day';
    chartMonth = mIdx;
  }

  var stats = computeStats(filtered);

  document.getElementById('anl-stats').innerHTML =
    anlCard(stats.count,                          'Total Reservasi',          'fas fa-calendar-check') +
    anlCard(stats.totalPax,                       'Total Tamu',               'fas fa-users') +
    anlCard('Rp' + formatRupiahK(stats.totalDp), 'Total DP Masuk',           'fas fa-money-bill-wave') +
    anlCard(stats.avgPax,                         'Rata-rata Tamu/Reservasi', 'fas fa-chart-line');

  var chartData = buildChartData(filtered, chartMode, year, chartMonth);

  renderAnalysisChart(
    chartData.labels,
    chartData.data,
    chartMode === 'month'
      ? 'Reservasi per Bulan'
      : 'Reservasi per Tanggal'
  );

  /* =========================
     INSIGHTS + TOP DATA
  ========================= */

  var insights = generateInsights(filtered, stats);

  document.getElementById('anl-insight').innerHTML =
    '<h5><i class="fas fa-robot"></i> Insight Otomatis</h5>' +
    '<ul>' +
      insights.map(function (i) {
        return '<li>' + i + '</li>';
      }).join('') +
    '</ul>';

  // Top customers
  var custCounts = {};

  filtered.forEach(function (r) {
    if (!r.nomorHp) return;

    if (!custCounts[r.nomorHp]) {
      custCounts[r.nomorHp] = {
        name: r.nama,
        count: 0
      };
    }

    custCounts[r.nomorHp].count++;
  });

  var topCusts = Object.values(custCounts)
    .sort(function (a, b) { return b.count - a.count; })
    .slice(0, 5);

  document.getElementById('anl-frequent').innerHTML = topCusts.length
    ? topCusts.map(function (c) {
        return (
          '<li class="rank-item">' +
            '<span class="ri-name">' + escapeHtml(c.name) + '</span>' +
            '<span class="ri-val">' + c.count + 'x</span>' +
          '</li>'
        );
      }).join('')
    : '<li style="color:var(--ink-4);font-size:0.85rem;padding:12px 0;">Belum ada data</li>';

  // Top menus
  var topMenusList = countMenus(filtered).slice(0, 5);

  document.getElementById('anl-menus').innerHTML = topMenusList.length
    ? topMenusList.map(function (m) {
        return (
          '<li class="rank-item">' +
            '<span class="ri-name">' + escapeHtml(m.key) + '</span>' +
            '<span class="ri-val">' + m.count + ' porsi</span>' +
          '</li>'
        );
      }).join('')
    : '<li style="color:var(--ink-4);font-size:0.85rem;padding:12px 0;">Belum ada data</li>';
}
/* ============================================================
ANALYSIS CHART RENDERER
============================================================ */

function anlCard (value, label, icon) {
  return (
    '<div class="anl-card">' +

      '<div style="font-size:0.75rem;color:var(--accent);margin-bottom:8px;">' +
        '<i class="' + icon + '"></i>' +
      '</div>' +

      '<div class="anl-val">' + value + '</div>' +
      '<div class="anl-label">' + label + '</div>' +

    '</div>'
  );
}

function renderAnalysisChart (labels, data, title) {
  var ctx = document.getElementById('anl-chart');

  if (!ctx) return;

  // Destroy previous instance (prevent memory leak)
  if (_anlChartInstance) {
    _anlChartInstance.destroy();
    _anlChartInstance = null;
  }

  _anlChartInstance = new Chart(ctx.getContext('2d'), {
    type: 'bar',

    data: {
      labels: labels,

      datasets: [{
        label: 'Reservasi',
        data: data,

        backgroundColor: function (context) {
          var chart = context.chart;
          var ctx2  = chart.ctx;
          var area  = chart.chartArea;

          // Chart belum siap → fallback warna solid
          if (!area) {
            return 'rgba(232,99,10,0.7)';
          }

          var gradient = ctx2.createLinearGradient(
            0,
            area.top,
            0,
            area.bottom
          );

          gradient.addColorStop(0, 'rgba(232,99,10,0.85)');
          gradient.addColorStop(1, 'rgba(232,99,10,0.25)');

          return gradient;
        },

        borderRadius: 8,
        borderSkipped: false,

        hoverBackgroundColor: 'rgba(232,99,10,1)'
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      plugins: {
        legend: {
          display: false
        },

        title: {
          display: true,
          text: title,
          font: { size: 13, weight: '600' },
          color: '#3f3f46',
          padding: { bottom: 16 }
        },

        tooltip: {
          backgroundColor: '#18181b',
          titleFont: { size: 12 },
          bodyFont: { size: 13 },
          padding: 10,
          cornerRadius: 8,

          callbacks: {
            label: function (ctx) {
              return ' ' + ctx.raw + ' reservasi';
            }
          }
        }
      },

      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#a1a1aa',
            font: { size: 11 }
          }
        },

        y: {
          beginAtZero: true,

          ticks: {
            stepSize: 1,
            color: '#a1a1aa',
            font: { size: 11 }
          },

          grid: {
            color: 'rgba(0,0,0,0.04)'
          }
        }
      }
    }
  });
}
/* ============================================================
16. BROADCAST VIEW
============================================================ */

function loadBroadcastView () {
  var savedMsg = getBroadcastMessage();

  var el = document.getElementById('broadcast-msg');
  if (el) el.value = savedMsg;

  var all = getAllReservations();
  var map = {};

  // Build unique customer list (by phone)
  all.forEach(function (r) {
    if (r.nomorHp && !map[r.nomorHp]) {
      map[r.nomorHp] = {
        name: r.nama,
        phone: r.nomorHp
      };
    }
  });

  state.bcList = Object.values(map)
    .sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

  renderBcList(state.bcList);
}

function saveBroadcastMsg () {
  var msg = (document.getElementById('broadcast-msg').value || '').trim();

  if (!msg) {
    showToast('Pesan tidak boleh kosong!', 'error');
    return;
  }

  saveBroadcastMessage(msg);

  showToast('Pesan broadcast disimpan!', 'success');
}

function renderBcList (list) {
  var el = document.getElementById('bc-list');
  if (!el) return;

  if (!list.length) {
    el.innerHTML =
      '<div style="text-align:center;padding:32px;color:var(--ink-4);font-size:0.875rem;">' +
        'Belum ada data pelanggan dengan nomor HP.' +
      '</div>';
    return;
  }

  el.innerHTML = list.map(function (c) {
    return (
      '<div class="bc-item" id="bc-item-' + escapeHtml(c.phone) + '">' +

        '<div>' +
          '<div class="bc-name">' + escapeHtml(c.name) + '</div>' +
          '<div class="bc-phone">' + escapeHtml(c.phone) + '</div>' +
        '</div>' +

        '<button class="btn-wa-soft" ' +
          'id="bc-btn-' + escapeHtml(c.phone) + '" ' +
          'data-phone="' + escapeHtml(c.phone) + '" ' +
          'data-name="'  + escapeHtml(c.name)  + '" ' +
          'onclick="sendBroadcastFromBtn(this)">' +

          '<i class="fab fa-whatsapp"></i> Kirim' +
        '</button>' +

      '</div>'
    );
  }).join('');
}

/* ============================================================
BROADCAST ACTIONS
============================================================ */

function sendBroadcastFromBtn (btn) {
  var phone = btn.getAttribute('data-phone');
  var name  = btn.getAttribute('data-name');

  if (!phone || !name) return;

  sendBroadcast(phone, name);
}

function filterBcList (q) {
  var query = q.toLowerCase();

  var filtered = q
    ? state.bcList.filter(function (c) {
        return (
          c.name.toLowerCase().includes(query) ||
          c.phone.includes(query)
        );
      })
    : state.bcList;

  renderBcList(filtered);
}

function sendBroadcast (phone, name) {
  var template = getBroadcastMessage();

  if (!template) {
    showToast('Atur pesan broadcast dulu!', 'error');
    return;
  }

  var msg = personalizeBroadcast(template, name);

  openWhatsApp(phone, msg);

  // Update button state (no re-render)
  var btn = document.getElementById('bc-btn-' + phone);

  if (btn) {
    btn.innerHTML = '<i class="fas fa-check"></i> Terkirim';
    btn.className = 'btn-success-soft';
    btn.disabled  = true;
  }
}
/* ============================================================
17. NOTIFICATION DROPDOWN TOGGLE
============================================================ */

function toggleNotifDropdown (e) {
  // Prevent click bubbling ke document (yang akan langsung menutup dropdown)
  if (e && typeof e.stopPropagation === 'function') {
    e.stopPropagation();
  }

  var nd = document.getElementById('notif-dropdown');
  if (!nd) return;

  nd.classList.toggle('open');
}
/* ============================================================
18. DOM UTILITIES
============================================================ */

function setText (id, value) {
  var el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}
function closeNotifHandler (e) {
  var nd = document.getElementById('notif-dropdown');
  var btn = document.getElementById('notif-btn');

  if (!nd) return;

  // Kalau klik di dalam dropdown → jangan tutup
  if (nd.contains(e.target)) return;

  // Kalau klik tombol notif → jangan tutup
  if (btn && btn.contains(e.target)) return;

  nd.classList.remove('open');
}
/* ============================================================
SAFE HTML ESCAPE (CRITICAL)
============================================================ */

function escapeHtml (str) {
  if (str === null || str === undefined) return '';

  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/* ============================================================
SMALL HELPERS
============================================================ */

function clearFormErrors () {
  document.querySelectorAll('.form-error').forEach(function (el) {
    el.textContent = '';
  });
}

function showFieldError (id, msg) {
  var el = document.getElementById(id);
  if (el) {
    el.textContent = msg;
  }
}

function setPageTitle (name) {
  var el = document.getElementById('page-title');
  if (!el) return;

  var map = {
    calendar:  'Kalender',
    detail:    'Detail Reservasi',
    menus:     'Menu',
    locations: 'Lokasi',
    customers: 'Pelanggan',
    analysis:  'Analisis',
    broadcast: 'Broadcast'
  };

  el.textContent = map[name] || '';
}
/* ============================================================
19. GLOBAL HELPERS
============================================================ */

/* ---------- ID & DATE ---------- */

function genId () {
  // Simple unique id (timestamp + random)
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function todayStr () {
  var d = new Date();
  return buildDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function pad2 (n) {
  return n < 10 ? '0' + n : '' + n;
}

function buildDateStr (y, m, d) {
  return y + '-' + pad2(m) + '-' + pad2(d);
}

/* ---------- FORMAT ---------- */

function formatRupiah (num) {
  num = parseInt(num, 10) || 0;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatRupiahK (num) {
  num = parseInt(num, 10) || 0;

  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace('.0', '') + 'k';
  }

  return String(num);
}

function formatDateDisplay (dateStr) {
  if (!dateStr) return '';

  var parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10) - 1;
  var d = parseInt(parts[2], 10);

  return d + ' ' + (MONTHS_ID[m] || '') + ' ' + y;
}

/* ---------- STRING & NAME ---------- */

function getInitials (name) {
  if (!name) return '?';

  var parts = name.trim().split(/\s+/);

  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  return (
    parts[0].charAt(0) +
    parts[parts.length - 1].charAt(0)
  ).toUpperCase();
}

function nameToColor (name) {
  if (!name) return '#64748b';

  var hash = 0;

  for (var i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  var colors = [
    '#ef4444', '#f97316', '#eab308',
    '#22c55e', '#06b6d4', '#3b82f6',
    '#8b5cf6', '#ec4899'
  ];

  return colors[Math.abs(hash) % colors.length];
}

/* ---------- VALIDATION ---------- */

function validatePhone (hp) {
  if (!hp) return false;

  var cleaned = hp.replace(/\D/g, '');

  // 10–13 digit
  return cleaned.length >= 10 && cleaned.length <= 13;
}

function normalizePhone (hp) {
  if (!hp) return '';

  var cleaned = hp.replace(/\D/g, '');

  // Convert 08xxx → 628xxx
  if (cleaned.startsWith('0')) {
    return '62' + cleaned.slice(1);
  }

  // Already 62...
  if (cleaned.startsWith('62')) {
    return cleaned;
  }

  return cleaned;
}
/* ============================================================
20. GLUE FUNCTIONS (STATE + DATA ACCESS HELPERS)
============================================================ */

/* ---------- RESERVATION FINDERS ---------- */

function findReservationById (id) {
  if (!id) return null;

  var all = getAllReservations();

  for (var i = 0; i < all.length; i++) {
    if (all[i].id === id) {
      return all[i];
    }
  }

  return null;
}

function getResForDate (dateStr) {
  if (!dateStr) return [];

  var parts = dateStr.split('-');
  if (parts.length !== 3) return [];

  var y = parts[0];
  var m = parseInt(parts[1], 10) - 1;

  var mk = getMonthKey(parseInt(y, 10), m);

  var arr = state.reservations[mk] || [];

  return arr.filter(function (r) {
    return r.date === dateStr;
  });
}

function getResForMonth (year, monthIdx) {
  var mk = getMonthKey(year, monthIdx);
  return state.reservations[mk] || [];
}

function getAllReservations () {
  var all = [];

  Object.values(state.reservations || {}).forEach(function (arr) {
    if (Array.isArray(arr)) {
      all = all.concat(arr);
    }
  });

  return all;
}

/* ---------- MENU & LOCATION LOOKUP ---------- */

function getMenuByName (name) {
  var list = Object.values(state.menus || {});

  for (var i = 0; i < list.length; i++) {
    if (list[i].name === name) {
      return list[i];
    }
  }

  return null;
}

function getMenusSorted () {
  return Object.entries(state.menus || {})
    .map(function (entry) {
      return Object.assign({ id: entry[0] }, entry[1]);
    })
    .sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
}

function getLocationByName (name) {
  var list = Object.values(state.locations || {});

  for (var i = 0; i < list.length; i++) {
    if (list[i].name === name) {
      return list[i];
    }
  }

  return null;
}

function getLocationsSorted () {
  return Object.entries(state.locations || {})
    .map(function (entry) {
      return Object.assign({ id: entry[0] }, entry[1]);
    })
    .sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
}

/* ---------- CUSTOMER BUILDER ---------- */

function buildCustomerList () {
  var map = {};

  getAllReservations().forEach(function (r) {
    var key = r.nomorHp || (r.nama + '_' + r.date);

    if (!map[key]) {
      map[key] = {
        nama: r.nama || 'Tanpa Nama',
        nomorHp: r.nomorHp || '',
        count: 0,
        lastDate: r.date
      };
    }

    map[key].count++;

    if (r.date > map[key].lastDate) {
      map[key].lastDate = r.date;
    }
  });

  return Object.values(map).sort(function (a, b) {
    return b.count - a.count;
  });
}

/* ---------- SIMPLE STATS ---------- */

function computeStats (arr) {
  arr = arr || [];

  var totalPax = 0;
  var totalDp  = 0;

  arr.forEach(function (r) {
    totalPax += parseInt(r.jumlah, 10) || 0;
    totalDp  += parseInt(r.dp, 10)     || 0;
  });

  return {
    count:    arr.length,
    totalPax: totalPax,
    totalDp:  totalDp,
    avgPax:   arr.length ? Math.round(totalPax / arr.length) : 0
  };
}
/* ============================================================
21. FINALIZATION & SAFETY GUARD
============================================================ */

// Basic runtime sanity check (optional, ringan)
(function () {
  try {
    if (!window.state) {
      console.warn('[Proserva] state belum terinisialisasi');
    }

    if (!window.DB || !window.KEYS) {
      console.warn('[Proserva] DB / KEYS belum tersedia');
    }

    if (!window.getMonthKey) {
      console.warn('[Proserva] getMonthKey tidak ditemukan');
    }

  } catch (e) {
    console.error('[Proserva] Init check error:', e);
  }
})();