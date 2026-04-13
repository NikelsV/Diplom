/**
 * region.js — Карта области
 * Загрузка карты, города (click-to-place), офисы, этажи.
 */

const REGION_ID = parseInt(document.getElementById('regionWrap').dataset.regionId);

let regionData = null;
let imgW = 0, imgH = 0;
let addCityMode = false, deleteCityMode = false;
let selectedCity = null;

// ==== Zoom / Pan ====
let rScale = 1, rPanX = 0, rPanY = 0, rIsPanning = false, rPanStartX = 0, rPanStartY = 0;

function initRegionZoomPan() {
    const wrap = document.getElementById('regionWrap');
    wrap.addEventListener('contextmenu', e => e.preventDefault());
    wrap.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = wrap.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top, old = rScale;
        rScale = Math.min(5, Math.max(getMinScale(), rScale * (e.deltaY > 0 ? 0.9 : 1.1)));
        rPanX = mx - (mx - rPanX) * (rScale / old);
        rPanY = my - (my - rPanY) * (rScale / old);
        applyRegionTransform();
    }, { passive: false });
    wrap.addEventListener('mousedown', (e) => {
        if (e.target.closest('.region-zoom-controls')) return;
        if (addCityMode && e.button === 0) return;
        if (e.button === 2 || e.button === 1) {
            e.preventDefault(); rIsPanning = true;
            rPanStartX = e.clientX - rPanX; rPanStartY = e.clientY - rPanY;
            wrap.classList.add('grabbing');
        }
    });
    window.addEventListener('mousemove', (e) => {
        if (!rIsPanning) return;
        rPanX = e.clientX - rPanStartX; rPanY = e.clientY - rPanStartY;
        applyRegionTransform();
    });
    window.addEventListener('mouseup', () => { rIsPanning = false; document.getElementById('regionWrap').classList.remove('grabbing'); });
}

function getMinScale() {
    const wrap = document.getElementById('regionWrap');
    if (!imgW || !imgH) return 0.1;
    return Math.min(wrap.clientWidth / imgW, wrap.clientHeight / imgH) * 0.5;
}

function applyRegionTransform() {
    clampPan();
    document.getElementById('regionInner').style.transform = `translate(${rPanX}px,${rPanY}px) scale(${rScale})`;
    document.querySelectorAll('#cityDots .city-dot').forEach(dot => {
        dot.style.transform = `translate(-50%,-50%) scale(${1/rScale})`;
    });
}

function clampPan() {
    const wrap = document.getElementById('regionWrap');
    const ww = wrap.clientWidth, wh = wrap.clientHeight;
    const sw = imgW * rScale, sh = imgH * rScale;
    if (sw <= ww) rPanX = (ww - sw) / 2; else rPanX = Math.min(0, Math.max(ww - sw, rPanX));
    if (sh <= wh) rPanY = (wh - sh) / 2; else rPanY = Math.min(0, Math.max(wh - sh, rPanY));
}

function regZoomReset() {
    const wrap = document.getElementById('regionWrap');
    if (imgW > 0 && imgH > 0) {
        rScale = Math.min(wrap.clientWidth / imgW, wrap.clientHeight / imgH) * 0.95;
        rPanX = (wrap.clientWidth - imgW * rScale) / 2;
        rPanY = (wrap.clientHeight - imgH * rScale) / 2;
    } else { rScale = 1; rPanX = 0; rPanY = 0; }
    applyRegionTransform();
}
function regZoomIn() {
    const wr = document.getElementById('regionWrap').getBoundingClientRect(), cx = wr.width/2, cy = wr.height/2, old = rScale;
    rScale = Math.min(5, rScale * 1.3); rPanX = cx-(cx-rPanX)*(rScale/old); rPanY = cy-(cy-rPanY)*(rScale/old); applyRegionTransform();
}
function regZoomOut() {
    const wr = document.getElementById('regionWrap').getBoundingClientRect(), cx = wr.width/2, cy = wr.height/2, old = rScale;
    rScale = Math.max(getMinScale(), rScale/1.3); rPanX = cx-(cx-rPanX)*(rScale/old); rPanY = cy-(cy-rPanY)*(rScale/old); applyRegionTransform();
}

// ==== Load region ====
async function loadRegion() {
    regionData = await apiFetch('regions/' + REGION_ID + '/');
    if (!regionData) return;
    document.getElementById('regionTitle').textContent = regionData.name;
    document.getElementById('bcRegionName').textContent = regionData.name;
    if (regionData.map_image) loadBgImage(regionData.map_image);
    const cities = await apiFetch('cities/?region=' + REGION_ID);
    // Load monitoring status for the region
    const statusResp = await apiFetch('monitoring/status/region/' + REGION_ID + '/');
    const cityStatuses = statusResp ? statusResp.cities : null;
    showCityDots(cities || [], cityStatuses);
}

function loadBgImage(url) {
    const img = document.getElementById('regionBgImg');
    img.onload = () => {
        imgW = img.naturalWidth; imgH = img.naturalHeight;
        img.style.display = 'block';
        img.style.width = imgW + 'px'; img.style.height = imgH + 'px';
        document.getElementById('noMapMsg').style.display = 'none';
        regZoomReset();
        // Refresh city dots (they need imgW/imgH)
        apiFetch('cities/?region=' + REGION_ID).then(cities => showCityDots(cities || []));
    };
    img.src = url;
}

// ==== City dots ====
function clearCityDots() { document.getElementById('cityDots').innerHTML = ''; }

function showCityDots(cities, statusData) {
    clearCityDots();
    if (!imgW || !imgH) return;
    cities.forEach(city => {
        const dot = document.createElement('div');
        dot.className = 'city-dot';
        dot.style.position = 'absolute';
        dot.style.left = city.x + 'px';
        dot.style.top = city.y + 'px';
        dot.style.transform = `translate(-50%,-50%) scale(${1/rScale})`;
        // Status coloring
        if (statusData) {
            const cs = statusData.find(c => c.id === city.id);
            if (cs && cs.status === true) dot.style.background = '#4caf50';
            else if (cs && cs.status === false) dot.style.background = '#e53935';
        }
        dot.innerHTML = `<span class="city-label">${esc(city.name)}</span>`;
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            if (deleteCityMode) tryDeleteCity(city);
            else onCityClick(city, dot);
        });
        document.getElementById('cityDots').appendChild(dot);
    });
}

// ==== Add city — click-to-place ====
document.getElementById('btnAddCity').addEventListener('click', () => {
    if (!imgW) { toast('Сначала загрузите карту области'); return; }
    deleteCityMode = false; document.getElementById('btnDeleteCity').classList.remove('active');
    addCityMode = !addCityMode;
    document.getElementById('btnAddCity').classList.toggle('active', addCityMode);
    document.getElementById('regionWrap').classList.toggle('placing-city', addCityMode);
    document.getElementById('toolbarHint').textContent = addCityMode ? 'Кликните на карту для размещения города' : '';
});

document.getElementById('regionInner').addEventListener('click', (e) => {
    if (!addCityMode) return;
    const wrap = document.getElementById('regionWrap');
    const rect = wrap.getBoundingClientRect();
    const clickX = (e.clientX - rect.left - rPanX) / rScale;
    const clickY = (e.clientY - rect.top - rPanY) / rScale;
    document.getElementById('newCityName').value = '';
    document.getElementById('newCityX').value = Math.round(clickX * 10) / 10;
    document.getElementById('newCityY').value = Math.round(clickY * 10) / 10;
    document.getElementById('addCityModal').style.display = 'flex';
    setTimeout(() => document.getElementById('newCityName').focus(), 100);
});

function closeAddCityModal() { document.getElementById('addCityModal').style.display = 'none'; }

async function confirmAddCity() {
    const name = document.getElementById('newCityName').value.trim();
    const x = parseFloat(document.getElementById('newCityX').value);
    const y = parseFloat(document.getElementById('newCityY').value);
    if (!name) { toast('Введите название'); return; }
    if (isNaN(x) || isNaN(y)) { toast('Координаты не определены'); return; }
    const result = await apiFetch('cities/', { method: 'POST', body: JSON.stringify({ name, x, y, region: REGION_ID }) });
    if (result) {
        toast('Город «' + name + '» создан', 'success');
        closeAddCityModal(); exitModes();
        const cities = await apiFetch('cities/?region=' + REGION_ID);
        showCityDots(cities || []);
    }
}

// ==== Delete city ====
document.getElementById('btnDeleteCity').addEventListener('click', () => {
    if (!imgW) { toast('Сначала загрузите карту области'); return; }
    addCityMode = false; document.getElementById('btnAddCity').classList.remove('active');
    document.getElementById('regionWrap').classList.remove('placing-city');
    deleteCityMode = !deleteCityMode;
    document.getElementById('btnDeleteCity').classList.toggle('active', deleteCityMode);
    document.getElementById('toolbarHint').textContent = deleteCityMode ? 'Кликните на город для удаления' : '';
});

async function tryDeleteCity(city) {
    const offices = await apiFetch('offices/?city=' + city.id);
    if (offices && offices.length > 0) { toast('Нельзя удалить — есть офисы (' + offices.length + ')', 'error'); return; }
    if (!confirm('Удалить «' + city.name + '»?')) return;
    await apiFetch('cities/' + city.id + '/', { method: 'DELETE' });
    toast('Город удалён', 'success');
    const cities = await apiFetch('cities/?region=' + REGION_ID);
    showCityDots(cities || []);
}

function exitModes() {
    addCityMode = false; deleteCityMode = false;
    document.getElementById('btnAddCity').classList.remove('active');
    document.getElementById('btnDeleteCity').classList.remove('active');
    document.getElementById('regionWrap').classList.remove('placing-city');
    document.getElementById('toolbarHint').textContent = '';
}

// ==== City click → offices popup ====
async function onCityClick(city, dotEl) {
    selectedCity = city; exitModes(); closePopup();
    const offices = await apiFetch('offices/?city=' + city.id) || [];
    showOfficePopup(city, offices, dotEl);
}

async function showOfficePopup(city, offices, anchorEl) {
    const panel = document.getElementById('popupPanel');
    document.getElementById('popupTitle').textContent = 'Офисы — ' + city.name;
    const list = document.getElementById('popupList');
    list.innerHTML = '';

    // Fetch city status for office coloring
    let cityStatus = null;
    const regionStatus = await apiFetch('monitoring/status/region/' + REGION_ID + '/');
    if (regionStatus && regionStatus.cities) {
        cityStatus = regionStatus.cities.find(c => c.id === city.id);
    }

    offices.forEach(o => {
        const li = document.createElement('li');
        let statusIcon = '';
        if (cityStatus && cityStatus.offices) {
            const os = cityStatus.offices.find(x => x.id === o.id);
            if (os && os.status === true) statusIcon = '<span style="color:#4caf50;">●</span> ';
            else if (os && os.status === false) statusIcon = '<span style="color:#e53935;">●</span> ';
        }
        li.innerHTML = statusIcon + esc(o.name) + (o.address ? ' — ' + esc(o.address) : '');
        li.addEventListener('click', () => onOfficeClick(o, city));
        list.appendChild(li);
    });
    if (!offices.length) { const li = document.createElement('li'); li.style.color='#999'; li.style.cursor='default'; li.textContent='Нет офисов'; list.appendChild(li); }
    const extra = document.getElementById('popupExtra');
    extra.innerHTML = '';
    const addBtn = document.createElement('button'); addBtn.className='popup-add-btn'; addBtn.textContent='+ Добавить офис';
    addBtn.addEventListener('click', () => openAddOfficeModal(city)); extra.appendChild(addBtn);
    // Poll city button
    const pollBtn = document.createElement('button'); pollBtn.className='popup-add-btn'; pollBtn.style.borderColor='#1565c0'; pollBtn.style.color='#1565c0'; pollBtn.style.background='#e3f2fd';
    pollBtn.textContent = '📡 Опросить город';
    pollBtn.addEventListener('click', async () => {
        pollBtn.disabled = true; pollBtn.textContent = '📡 Опрос...';
        await apiFetch('monitoring/poll/city/' + city.id + '/' + getProtocolSuffix(), { method: 'POST' });
        pollBtn.disabled = false; pollBtn.textContent = '📡 Опросить город';
        toast('Город опрошен', 'success');
        // Reload statuses
        const cities = await apiFetch('cities/?region=' + REGION_ID);
        const sr = await apiFetch('monitoring/status/region/' + REGION_ID + '/');
        showCityDots(cities || [], sr ? sr.cities : null);
    });
    extra.appendChild(pollBtn);
    positionPopup(panel, anchorEl);
}

// ==== Add office ====
let addOfficeForCity = null;
function openAddOfficeModal(city) { addOfficeForCity = city; document.getElementById('newOfficeName').value=''; document.getElementById('newOfficeAddr').value=''; document.getElementById('addOfficeModal').style.display='flex'; }
function closeAddOfficeModal() { document.getElementById('addOfficeModal').style.display = 'none'; }
async function confirmAddOffice() {
    if (!addOfficeForCity) return;
    const name = document.getElementById('newOfficeName').value.trim(), addr = document.getElementById('newOfficeAddr').value.trim();
    if (!name) { toast('Введите название офиса'); return; }
    const result = await apiFetch('offices/', { method: 'POST', body: JSON.stringify({ name, address: addr, city: addOfficeForCity.id }) });
    if (result) { toast('Офис создан', 'success'); closeAddOfficeModal(); const offices = await apiFetch('offices/?city=' + addOfficeForCity.id) || []; const dots = document.querySelectorAll('#cityDots .city-dot'); if (dots.length) showOfficePopup(addOfficeForCity, offices, dots[0]); }
}

// ==== Office → floors ====
let currentOffice = null, currentCity = null;
async function onOfficeClick(office, city) { currentOffice = office; currentCity = city; const floors = await apiFetch('floors/?office=' + office.id) || []; showFloorPopup(office, city, floors); }

async function showFloorPopup(office, city, floors) {
    document.getElementById('popupTitle').textContent = 'Этажи — ' + office.name;
    const list = document.getElementById('popupList');
    list.innerHTML = '';

    // Fetch status for floor coloring
    let officeStatus = null;
    const regionStatus = await apiFetch('monitoring/status/region/' + REGION_ID + '/');
    if (regionStatus && regionStatus.cities) {
        const cs = regionStatus.cities.find(c => c.id === city.id);
        if (cs && cs.offices) officeStatus = cs.offices.find(o => o.id === office.id);
    }

    floors.forEach(f => {
        const li = document.createElement('li');
        let statusIcon = '';
        if (officeStatus && officeStatus.floors) {
            const fs = officeStatus.floors.find(x => x.id === f.id);
            if (fs && fs.status === true) statusIcon = '<span style="color:#4caf50;">●</span> ';
            else if (fs && fs.status === false) statusIcon = '<span style="color:#e53935;">●</span> ';
        }
        li.innerHTML = statusIcon + 'Этаж ' + f.number;
        li.addEventListener('click', () => { window.location.href = '/floor/' + f.id + '/'; });
        list.appendChild(li);
    });
    if (!floors.length) { const li = document.createElement('li'); li.style.color='#999'; li.style.cursor='default'; li.textContent='Нет этажей'; list.appendChild(li); }
    const extra = document.getElementById('popupExtra'); extra.innerHTML = '';
    const addBtn = document.createElement('button'); addBtn.className='popup-add-btn'; addBtn.textContent='+ Добавить этаж'; addBtn.addEventListener('click', () => openAddFloorModal(office)); extra.appendChild(addBtn);
    // Poll office button
    const pollBtn = document.createElement('button'); pollBtn.className='popup-add-btn'; pollBtn.style.borderColor='#1565c0'; pollBtn.style.color='#1565c0'; pollBtn.style.background='#e3f2fd';
    pollBtn.textContent = '📡 Опросить офис';
    pollBtn.addEventListener('click', async () => {
        pollBtn.disabled = true; pollBtn.textContent = '📡 Опрос...';
        await apiFetch('monitoring/poll/office/' + office.id + '/' + getProtocolSuffix(), { method: 'POST' });
        pollBtn.disabled = false; pollBtn.textContent = '📡 Опросить офис';
        toast('Офис опрошен', 'success');
        const fl = await apiFetch('floors/?office=' + office.id) || [];
        showFloorPopup(office, city, fl);
    });
    extra.appendChild(pollBtn);
    const delBtn = document.createElement('button'); delBtn.className='popup-del-btn'; delBtn.textContent='🗑 Удалить офис'; delBtn.addEventListener('click', () => tryDeleteOffice(office, city)); extra.appendChild(delBtn);
}

// ==== Add floor ====
let addFloorForOffice = null;
function openAddFloorModal(office) { addFloorForOffice = office; document.getElementById('newFloorNumber').value=''; document.getElementById('addFloorModal').style.display='flex'; }
function closeAddFloorModal() { document.getElementById('addFloorModal').style.display = 'none'; }
async function confirmAddFloor() {
    if (!addFloorForOffice) return;
    const num = parseInt(document.getElementById('newFloorNumber').value);
    if (isNaN(num)) { toast('Введите номер этажа'); return; }
    const result = await apiFetch('floors/', { method: 'POST', body: JSON.stringify({ number: num, office: addFloorForOffice.id }) });
    if (result) { toast('Этаж создан', 'success'); closeAddFloorModal(); const floors = await apiFetch('floors/?office=' + addFloorForOffice.id) || []; showFloorPopup(addFloorForOffice, currentCity, floors); }
}

// ==== Delete office ====
async function tryDeleteOffice(office, city) {
    if (!confirm('Удалить офис «' + office.name + '»?')) return;
    await apiFetch('offices/' + office.id + '/', { method: 'DELETE' });
    toast('Офис удалён', 'success');
    const offices = await apiFetch('offices/?city=' + city.id) || [];
    const dots = document.querySelectorAll('#cityDots .city-dot');
    if (dots.length) showOfficePopup(city, offices, dots[0]);
}

// ==== Upload region map ====
document.getElementById('mapUpload').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData(); fd.append('map_image', file);
    try {
        const r = await fetch(API + 'regions/' + REGION_ID + '/upload-map/', { method: 'POST', headers: { 'X-CSRFToken': csrfToken() }, body: fd });
        if (!r.ok) throw new Error(r.statusText);
        const data = await r.json();
        loadBgImage(data.map_image);
        toast('Карта загружена', 'success');
    } catch(err) { toast('Ошибка: ' + err.message, 'error'); }
});

// ==== Popup positioning ====
function positionPopup(panel, anchorEl) {
    const wr = document.getElementById('regionWrap').getBoundingClientRect();
    const ar = anchorEl.getBoundingClientRect();
    panel.style.left = (ar.left - wr.left + 20) + 'px';
    panel.style.top = (ar.top - wr.top + 20) + 'px';
    panel.style.display = 'block';
}
function closePopup() { document.getElementById('popupPanel').style.display = 'none'; }

// ==== Poll region ====
let availableProtocols = [];

async function loadAvailableProtocols() {
    availableProtocols = await apiFetch('monitoring/available-protocols/') || [];
    const sel = document.getElementById('pollProtocolSelect');
    availableProtocols.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.poller_id;
        opt.textContent = p.display_name;
        sel.appendChild(opt);
    });
}

function getProtocolSuffix() {
    const v = document.getElementById('pollProtocolSelect').value;
    return v ? '?protocol=' + v : '';
}

document.getElementById('btnPollRegion').addEventListener('click', async () => {
    const btn = document.getElementById('btnPollRegion');
    btn.disabled = true; btn.textContent = '📡 Опрос...';
    await apiFetch('monitoring/poll/region/' + REGION_ID + '/' + getProtocolSuffix(), { method: 'POST' });
    btn.disabled = false; btn.textContent = '📡 Опросить регион';
    toast('Регион опрошен', 'success');
    const cities = await apiFetch('cities/?region=' + REGION_ID);
    const sr = await apiFetch('monitoring/status/region/' + REGION_ID + '/');
    showCityDots(cities || [], sr ? sr.cities : null);
});

// ==== Init ====
async function initAll() {
    await loadAvailableProtocols();
    initRegionZoomPan();
    await loadRegion();
}
initAll();
