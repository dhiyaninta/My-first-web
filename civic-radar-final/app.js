/* =========================================================
   CIVIC RADAR - APLIKASI
   Daftar isi:
   1. Konfigurasi & state
   2. Utilitas
   3. Penyimpanan (localStorage)
   4. Peta (Leaflet)
   5. Geolokasi
   6. Foto
   7. Render tampilan
   8. Event handler
   9. Inisialisasi
   ========================================================= */
(() => {
  'use strict';

  /* 1. KONFIGURASI & STATE ------------------------------- */
  const STORAGE_KEY = 'civicRadarReports';
  const DEFAULT_CENTER = [-7.9666, 112.6326]; // Malang
  const STATUS = { wait: 'Menunggu', proces: 'Diproses', done: 'Selesai' };

  const DAY = 86400000;
  const SAMPLE_REPORTS = [
    { id: 1, category: 'Jalan Rusak', title: 'Lubang besar di jalan utama', desc: 'Lubang sedalam 20 cm membahayakan pengendara motor.', lat: -7.9466, lng: 112.6149, status: 'proces', photo: '', time: Date.now() - DAY * 2 },
    { id: 2, category: 'Sampah Menumpuk', title: 'Sampah menumpuk di pinggir sungai', desc: 'Sudah lebih dari seminggu belum diangkut.', lat: -7.9797, lng: 112.6304, status: 'wait', photo: '', time: Date.now() - DAY },
    { id: 3, category: 'Lampu Jalan Mati', title: 'Lampu PJU mati satu blok', desc: 'Jalan gelap dan rawan kecelakaan di malam hari.', lat: -7.9525, lng: 112.6086, status: 'done', photo: '', time: Date.now() - DAY * 4 },
  ];

  const state = {
    reports: [],
    picked: null,      // { lat, lng } lokasi untuk form
    photoData: '',     // foto form (data URL)
    markers: {},       // marker laporan per id
    pickMarker: null,  // marker lokasi pilihan
    meCircle: null,    // lingkaran posisi pengguna
    toastTimer: null,
  };

  /* 2. UTILITAS ------------------------------------------ */
  const $ = (id) => document.getElementById(id);

  const escapeHtml = (text) =>
    String(text).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const formatDate = (time) =>
    new Date(time).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  const showToast = (message) => {
    const el = $('toast');
    el.textContent = message;
    el.style.display = 'block';
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
  };

  /* 3. PENYIMPANAN --------------------------------------- */
  const loadReports = () => {
    try {
      state.reports = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      state.reports = [];
    }
    if (!state.reports.length) state.reports = SAMPLE_REPORTS;
  };

  const saveReports = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.reports));
    } catch {
      showToast('Penyimpanan penuh, foto mungkin terlalu besar.');
    }
  };

  /* 4. PETA ---------------------------------------------- */
  const map = L.map('map').setView(DEFAULT_CENTER, 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const pinIcon = (cls) =>
    L.divIcon({
      className: '',
      html: `<div class="pin ${cls}"></div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 26],
      popupAnchor: [0, -26],
    });

  const setPickedLocation = (lat, lng) => {
    state.picked = { lat, lng };
    $('location').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    if (state.pickMarker) map.removeLayer(state.pickMarker);
    state.pickMarker = L.marker([lat, lng], { icon: pinIcon('me') })
      .addTo(map)
      .bindPopup('Lokasi laporan Anda');
  };

  const drawMarkers = () => {
    Object.values(state.markers).forEach((m) => map.removeLayer(m));
    state.markers = {};

    state.reports.forEach((r) => {
      state.markers[r.id] = L.marker([r.lat, r.lng], { icon: pinIcon(r.status) })
        .addTo(map)
        .bindPopup(`<b>${escapeHtml(r.title)}</b><br>${escapeHtml(r.category)}<br><i>${STATUS[r.status]}</i>`);
    });
  };

  const fitAllReports = () => {
    if (!state.reports.length) return;
    const bounds = L.latLngBounds(state.reports.map((r) => [r.lat, r.lng]));
    map.fitBounds(bounds, { padding: [40, 40] });
  };

  /* 5. GEOLOKASI ----------------------------------------- */
  const locateUser = (fillForm) => {
    if (!navigator.geolocation) {
      showToast('Browser tidak mendukung geolokasi.');
      return;
    }
    showToast('Mencari lokasi Anda...');

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude: lat, longitude: lng, accuracy } = coords;
        map.setView([lat, lng], 16);

        if (state.meCircle) map.removeLayer(state.meCircle);
        state.meCircle = L.circle([lat, lng], { radius: accuracy, color: '#1d4ed8', fillOpacity: 0.12 }).addTo(map);

        if (fillForm) setPickedLocation(lat, lng);
        showToast('Lokasi ditemukan.');
      },
      (err) => {
        showToast(err.code === 1
          ? 'Izin lokasi ditolak. Aktifkan di pengaturan browser.'
          : 'Lokasi tidak dapat ditentukan.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  /* 6. FOTO (dikecilkan agar hemat penyimpanan) ---------- */
  const handlePhoto = (file) => {
    if (!file) return;
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 800 / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

        state.photoData = canvas.toDataURL('image/jpeg', 0.7);
        $('preview').src = state.photoData;
        $('preview').style.display = 'block';
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  /* 7. RENDER TAMPILAN ----------------------------------- */
  const countByStatus = (status) => state.reports.filter((r) => r.status === status).length;

  const renderStats = () => {
    $('statTotal').textContent = state.reports.length;
    $('statWait').textContent = countByStatus('wait');
    $('statProces').textContent = countByStatus('proces');
    $('statDone').textContent = countByStatus('done');
  };

  const reportCard = (r) => `
    <article class="report-item" data-id="${r.id}">
      ${r.photo ? `<img src="${r.photo}" alt="Foto laporan">` : ''}
      <div class="report-top">
        <div>
          <h3>${escapeHtml(r.title)}</h3>
          <span class="report-meta">${escapeHtml(r.category)}</span>
        </div>
        <span class="badge ${r.status}">${STATUS[r.status]}</span>
      </div>
      <p>${escapeHtml(r.desc)}</p>
      <div class="report-meta">${formatDate(r.time)} &bull; ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}</div>
      <div class="status-row">
        ${Object.entries(STATUS).map(([key, label]) =>
          `<button type="button" data-status="${key}" class="${r.status === key ? 'on' : ''}">${label}</button>`
        ).join('')}
      </div>
    </article>`;

  const renderList = () => {
    const filter = $('filter').value;
    const list = state.reports.filter((r) => filter === 'all' || r.status === filter);

    $('reportList').innerHTML = list.length
      ? list.map(reportCard).join('')
      : '<div class="empty">Belum ada laporan pada status ini.</div>';
  };

  const render = () => {
    renderStats();
    renderList();
    drawMarkers();
  };

  /* 8. EVENT HANDLER ------------------------------------- */
  const resetForm = () => {
    $('form').reset();
    state.picked = null;
    state.photoData = '';
    $('preview').style.display = 'none';
    if (state.pickMarker) {
      map.removeLayer(state.pickMarker);
      state.pickMarker = null;
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const category = $('category').value;
    const title = $('title').value.trim();
    const desc = $('desc').value.trim();

    if (!category || !title || !desc) return showToast('Lengkapi kategori, judul, dan deskripsi.');
    if (!state.picked) return showToast('Pilih lokasi dengan klik peta atau tombol GPS.');

    state.reports.unshift({
      id: Date.now(),
      category, title, desc,
      lat: state.picked.lat,
      lng: state.picked.lng,
      status: 'wait',
      photo: state.photoData,
      time: Date.now(),
    });

    saveReports();
    resetForm();
    render();
    showToast('Laporan terkirim dan berstatus Menunggu.');
    $('reports').scrollIntoView({ behavior: 'smooth' });
  };

  const onListClick = (e) => {
    const item = e.target.closest('.report-item');
    if (!item) return;

    const report = state.reports.find((r) => r.id === Number(item.dataset.id));
    const statusBtn = e.target.closest('button[data-status]');

    if (statusBtn) {
      report.status = statusBtn.dataset.status;
      saveReports();
      render();
      showToast(`Status diubah menjadi ${STATUS[report.status]}.`);
      return;
    }

    map.setView([report.lat, report.lng], 17);
    state.markers[report.id].openPopup();
    $('mapSection').scrollIntoView({ behavior: 'smooth' });
  };

  const onNavClick = (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    document.querySelectorAll('.nav a').forEach((a) => a.classList.remove('active'));
    link.classList.add('active');
    $(link.dataset.target).scrollIntoView({ behavior: 'smooth' });
  };

  const bindEvents = () => {
    map.on('click', (e) => setPickedLocation(e.latlng.lat, e.latlng.lng));
    $('btnLocate').addEventListener('click', () => locateUser(false));
    $('btnGps').addEventListener('click', () => locateUser(true));
    $('btnFit').addEventListener('click', fitAllReports);
    $('photo').addEventListener('change', (e) => handlePhoto(e.target.files[0]));
    $('form').addEventListener('submit', onSubmit);
    $('filter').addEventListener('change', renderList);
    $('reportList').addEventListener('click', onListClick);
    $('nav').addEventListener('click', onNavClick);
  };

  /* 9. INISIALISASI -------------------------------------- */
  loadReports();
  bindEvents();
  render();
})();
