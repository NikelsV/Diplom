let selectedRegion = null;
let selectedCity = null;
let allRegionsFromDB = null;
let addCityMode = false;
let deleteCityMode = false;

async function getRegionsFromDB() {
    if (allRegionsFromDB) return allRegionsFromDB;
    allRegionsFromDB = await apiFetch('regions/') || [];
    return allRegionsFromDB;
}

// ==== Load SVG ====
async function loadMap() {
    const resp = await fetch(document.getElementById('mapWrap').dataset.svgUrl);
    const svgText = await resp.text();
    const wrap = document.getElementById('mapWrap');
    const saved = Array.from(wrap.children);
    wrap.innerHTML = svgText;
    saved.forEach(child => wrap.appendChild(child));
    initMapInteraction();
    initZoomPan();
    initPlaceCityClick();
    await getRegionsFromDB();
}

function getSvg() { return document.getElementById('russia-map'); }

// ==== Map interaction ====
function initMapInteraction() {
    document.querySelectorAll('#russia-map .region').forEach(pathEl => {
        pathEl.addEventListener('click', (e) => {
            if (addCityMode) return; // не переключать регион в режиме размещения
            e.stopPropagation();
            onRegionClick(pathEl);
        });
        pathEl.addEventListener('mouseenter', () => onRegionHover(pathEl));
        pathEl.addEventListener('mouseleave', () => onRegionLeave());
    });
}

function onRegionHover(pathEl) {
    const groupId = pathEl.getAttribute('data-group');
    const regionId = groupId || pathEl.getAttribute('data-fill');
    const infoBox = document.getElementById('regionInfo');
    infoBox.querySelector('.info-id').textContent = 'id: ' + pathEl.getAttribute('data-fill') + (groupId ? '  (группа: ' + groupId + ')' : '');
    if (allRegionsFromDB) {
        const region = allRegionsFromDB.find(r => r.svg_id === regionId);
        infoBox.querySelector('.info-name').textContent = region ? region.name : '(не в БД)';
    } else {
        infoBox.querySelector('.info-name').textContent = '...';
    }
    infoBox.classList.add('visible');
}

function onRegionLeave() { document.getElementById('regionInfo').classList.remove('visible'); }

async function onRegionClick(pathEl) {
    document.querySelectorAll('#russia-map .region.active').forEach(p => p.classList.remove('active'));
    const groupId = pathEl.getAttribute('data-group');
    if (groupId) {
        document.querySelectorAll('#russia-map .region[data-group="' + groupId + '"]').forEach(p => p.classList.add('active'));
    } else {
        pathEl.classList.add('active');
    }
    const regionId = groupId || pathEl.getAttribute('data-fill');
    if (!regionId) return;
    const regions = await getRegionsFromDB();
    const region = regions.find(r => r.svg_id === regionId);
    if (!region) { toast('Регион не в БД. svg_id="' + regionId + '"', 'error'); clearCityDots(); return; }
    selectedRegion = region;
    selectedCity = null;
    exitModes();
    updateBreadcrumb([region.name]);
    const cities = await apiFetch('cities/?region=' + region.id);
    showCityDots(cities || []);
}

// ==== Zoom & Pan ====
let scale = 1, panX = 0, panY = 0, isPanning = false, panStartX = 0, panStartY = 0;
const MIN_SCALE = 0.5, MAX_SCALE = 8;

function initZoomPan() {
    const wrap = document.getElementById('mapWrap');
    wrap.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = wrap.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top, old = scale;
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * (e.deltaY > 0 ? 0.9 : 1.1)));
        panX = mx - (mx - panX) * (scale / old); panY = my - (my - panY) * (scale / old);
        applyTransform();
    }, { passive: false });
    wrap.addEventListener('mousedown', (e) => {
        if (e.target.closest('.zoom-controls') || addCityMode) return;
        isPanning = true; panStartX = e.clientX - panX; panStartY = e.clientY - panY;
        wrap.classList.add('grabbing');
    });
    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        panX = e.clientX - panStartX; panY = e.clientY - panStartY; applyTransform();
    });
    window.addEventListener('mouseup', () => { isPanning = false; document.getElementById('mapWrap').classList.remove('grabbing'); });
    let lastTouchDist = 0;
    wrap.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) { isPanning = true; panStartX = e.touches[0].clientX - panX; panStartY = e.touches[0].clientY - panY; }
        else if (e.touches.length === 2) { lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
    }, { passive: false });
    wrap.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && isPanning) { panX = e.touches[0].clientX - panStartX; panY = e.touches[0].clientY - panStartY; applyTransform(); }
        else if (e.touches.length === 2) { const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (lastTouchDist > 0) { scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * (dist / lastTouchDist))); applyTransform(); } lastTouchDist = dist; }
    }, { passive: false });
    wrap.addEventListener('touchend', () => { isPanning = false; lastTouchDist = 0; });
}

function applyTransform() {
    const svgEl = getSvg(), dots = document.getElementById('cityDots');
    const t = `translate(${panX}px, ${panY}px) scale(${scale})`;
    if (svgEl) svgEl.style.transform = t;
    if (dots) dots.style.transform = t;
    document.querySelectorAll('#cityDots .city-dot').forEach(dot => {
        dot.style.transform = `translate(-50%, -50%) scale(${1/scale})`;
    });
}

function zoomIn() { const wr=document.getElementById('mapWrap').getBoundingClientRect(), cx=wr.width/2, cy=wr.height/2, old=scale; scale=Math.min(MAX_SCALE,scale*1.3); panX=cx-(cx-panX)*(scale/old); panY=cy-(cy-panY)*(scale/old); applyTransform(); }
function zoomOut() { const wr=document.getElementById('mapWrap').getBoundingClientRect(), cx=wr.width/2, cy=wr.height/2, old=scale; scale=Math.max(MIN_SCALE,scale/1.3); panX=cx-(cx-panX)*(scale/old); panY=cy-(cy-panY)*(scale/old); applyTransform(); }
function zoomReset() { scale=1; panX=0; panY=0; applyTransform(); }

// ==== City dots ====
function clearCityDots() { document.getElementById('cityDots').innerHTML = ''; }

function showCityDots(cities) {
    clearCityDots(); closePopup();
    const container = document.getElementById('cityDots');
    const svgEl = getSvg();
    if (!svgEl) return;
    const vb = svgEl.viewBox.baseVal;
    cities.forEach(city => {
        const dot = document.createElement('div');
        dot.className = 'city-dot';
        dot.style.position = 'absolute';
        dot.style.left = ((city.x - vb.x) / vb.width * 100) + '%';
        dot.style.top = ((city.y - vb.y) / vb.height * 100) + '%';
        dot.style.transform = `translate(-50%, -50%) scale(${1/scale})`;
        dot.innerHTML = `<span class="city-label">${city.name}</span>`;
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            if (deleteCityMode) tryDeleteCity(city);
            else onCityClick(city, dot);
        });
        container.appendChild(dot);
    });
}

// ==== Mode management ====
function exitModes() {
    addCityMode = false; deleteCityMode = false;
    document.getElementById('btnAddCity').classList.remove('active');
    document.getElementById('btnDeleteCity').classList.remove('active');
    document.getElementById('mapWrap').classList.remove('placing-city');
    document.getElementById('toolbarHint').textContent = '';
}

// ==== Add city: click-to-place ====
document.getElementById('btnAddCity').addEventListener('click', () => {
    if (!selectedRegion) { toast('Сначала выберите регион'); return; }
    deleteCityMode = false;
    document.getElementById('btnDeleteCity').classList.remove('active');
    addCityMode = !addCityMode;
    document.getElementById('btnAddCity').classList.toggle('active', addCityMode);
    document.getElementById('mapWrap').classList.toggle('placing-city', addCityMode);
    document.getElementById('toolbarHint').textContent = addCityMode ? 'Кликните на место на карте для размещения города' : '';
});

function initPlaceCityClick() {
    const wrap = document.getElementById('mapWrap');
    wrap.addEventListener('click', (e) => {
        if (!addCityMode) return;
        // Вычислить координаты viewBox по позиции клика
        const svgEl = getSvg();
        if (!svgEl) return;
        const vb = svgEl.viewBox.baseVal;
        const rect = wrap.getBoundingClientRect();
        // Клик в пикселях экрана → координаты viewBox с учётом pan/scale
        const clickX = (e.clientX - rect.left - panX) / scale;
        const clickY = (e.clientY - rect.top - panY) / scale;
        // clickX/clickY — пиксели SVG на экране, нужно перевести в viewBox
        const svgDisplayW = svgEl.clientWidth || svgEl.getBoundingClientRect().width / scale;
        const svgDisplayH = svgEl.clientHeight || svgEl.getBoundingClientRect().height / scale;
        const vbX = vb.x + (clickX / svgDisplayW) * vb.width;
        const vbY = vb.y + (clickY / svgDisplayH) * vb.height;

        // Открыть модалку с автозаполненными координатами
        document.getElementById('newCityName').value = '';
        document.getElementById('newCityX').value = Math.round(vbX * 10) / 10;
        document.getElementById('newCityY').value = Math.round(vbY * 10) / 10;
        document.getElementById('addCityModal').style.display = 'flex';
        // Фокус на поле имени
        setTimeout(() => document.getElementById('newCityName').focus(), 100);
    });
}

function closeAddCityModal() { document.getElementById('addCityModal').style.display = 'none'; }

async function confirmAddCity() {
    const name = document.getElementById('newCityName').value.trim();
    const x = parseFloat(document.getElementById('newCityX').value);
    const y = parseFloat(document.getElementById('newCityY').value);
    if (!name) { toast('Введите название города'); return; }
    if (isNaN(x) || isNaN(y)) { toast('Координаты не определены'); return; }
    const result = await apiFetch('cities/', {
        method: 'POST',
        body: JSON.stringify({ name, x, y, region: selectedRegion.id }),
    });
    if (result) {
        toast('Город «' + name + '» создан', 'success');
        closeAddCityModal();
        exitModes();
        const cities = await apiFetch('cities/?region=' + selectedRegion.id);
        showCityDots(cities || []);
    }
}

// ==== Delete city ====
document.getElementById('btnDeleteCity').addEventListener('click', () => {
    if (!selectedRegion) { toast('Сначала выберите регион'); return; }
    addCityMode = false;
    document.getElementById('btnAddCity').classList.remove('active');
    document.getElementById('mapWrap').classList.remove('placing-city');
    deleteCityMode = !deleteCityMode;
    document.getElementById('btnDeleteCity').classList.toggle('active', deleteCityMode);
    document.getElementById('toolbarHint').textContent = deleteCityMode ? 'Кликните на город для удаления' : '';
});

async function tryDeleteCity(city) {
    const offices = await apiFetch('offices/?city=' + city.id);
    if (offices && offices.length > 0) {
        toast('Нельзя удалить «' + city.name + '» — есть офисы (' + offices.length + '). Сначала удалите их.', 'error');
        return;
    }
    if (!confirm('Удалить город «' + city.name + '»?')) return;
    const result = await apiFetch('cities/' + city.id + '/', { method: 'DELETE' });
    if (result) {
        toast('Город удалён', 'success');
        const cities = await apiFetch('cities/?region=' + selectedRegion.id);
        showCityDots(cities || []);
    }
}

// ==== City click → offices popup ====
async function onCityClick(city, dotEl) {
    selectedCity = city;
    updateBreadcrumb([selectedRegion.name, city.name]);
    const offices = await apiFetch('offices/?city=' + city.id) || [];
    showOfficePopup(city, offices, dotEl);
}

function showOfficePopup(city, offices, anchorEl) {
    const panel = document.getElementById('popupPanel');
    document.getElementById('popupTitle').textContent = 'Офисы — ' + city.name;
    const list = document.getElementById('popupList');
    list.innerHTML = '';
    offices.forEach(office => {
        const li = document.createElement('li');
        li.textContent = office.name + (office.address ? ' — ' + office.address : '');
        li.addEventListener('click', () => onOfficeClick(office, city));
        list.appendChild(li);
    });
    if (!offices.length) {
        const li = document.createElement('li');
        li.style.color = '#999'; li.style.cursor = 'default';
        li.textContent = 'Нет офисов';
        list.appendChild(li);
    }
    const extra = document.getElementById('popupExtra');
    extra.innerHTML = '';
    const addBtn = document.createElement('button');
    addBtn.className = 'popup-add-btn';
    addBtn.textContent = '+ Добавить офис';
    addBtn.addEventListener('click', () => openAddOfficeModal(city));
    extra.appendChild(addBtn);

    const wr = document.getElementById('mapWrap').getBoundingClientRect();
    const ar = anchorEl.getBoundingClientRect();
    panel.style.left = (ar.left - wr.left + 20) + 'px';
    panel.style.top = (ar.top - wr.top + 20) + 'px';
    panel.style.display = 'block';
}

// ==== Add office ====
let addOfficeForCity = null;
function openAddOfficeModal(city) {
    addOfficeForCity = city;
    document.getElementById('newOfficeName').value = '';
    document.getElementById('newOfficeAddr').value = '';
    document.getElementById('addOfficeModal').style.display = 'flex';
}
function closeAddOfficeModal() { document.getElementById('addOfficeModal').style.display = 'none'; }
async function confirmAddOffice() {
    if (!addOfficeForCity) return;
    const name = document.getElementById('newOfficeName').value.trim();
    const addr = document.getElementById('newOfficeAddr').value.trim();
    if (!name) { toast('Введите название офиса'); return; }
    const result = await apiFetch('offices/', {
        method: 'POST',
        body: JSON.stringify({ name, address: addr, city: addOfficeForCity.id }),
    });
    if (result) {
        toast('Офис «' + name + '» создан', 'success');
        closeAddOfficeModal();
        const offices = await apiFetch('offices/?city=' + addOfficeForCity.id) || [];
        // Найти точку города для позиционирования попапа
        const dots = document.querySelectorAll('#cityDots .city-dot');
        const dot = dots.length ? dots[0] : null;
        if (dot) showOfficePopup(addOfficeForCity, offices, dot);
    }
}

// ==== Office click → floors popup ====
let currentOffice = null;
let currentOfficeCity = null;

async function onOfficeClick(office, city) {
    currentOffice = office;
    currentOfficeCity = city;
    updateBreadcrumb([selectedRegion.name, city.name, office.name]);
    const floors = await apiFetch('floors/?office=' + office.id) || [];
    showFloorPopup(office, city, floors);
}

function showFloorPopup(office, city, floors) {
    document.getElementById('popupTitle').textContent = 'Этажи — ' + office.name;
    const list = document.getElementById('popupList');
    list.innerHTML = '';
    floors.forEach(floor => {
        const li = document.createElement('li');
        li.textContent = 'Этаж ' + floor.number;
        li.addEventListener('click', () => { window.location.href = '/floor/' + floor.id + '/'; });
        list.appendChild(li);
    });
    if (!floors.length) {
        const li = document.createElement('li');
        li.style.color = '#999'; li.style.cursor = 'default';
        li.textContent = 'Нет этажей';
        list.appendChild(li);
    }
    const extra = document.getElementById('popupExtra');
    extra.innerHTML = '';

    // Кнопка добавить этаж
    const addBtn = document.createElement('button');
    addBtn.className = 'popup-add-btn';
    addBtn.textContent = '+ Добавить этаж';
    addBtn.addEventListener('click', () => openAddFloorModal(office));
    extra.appendChild(addBtn);

    // Кнопка удалить офис
    const delBtn = document.createElement('button');
    delBtn.className = 'popup-del-btn';
    delBtn.textContent = '🗑 Удалить офис';
    delBtn.addEventListener('click', () => tryDeleteOffice(office, city));
    extra.appendChild(delBtn);
}

// ==== Add floor ====
let addFloorForOffice = null;
function openAddFloorModal(office) {
    addFloorForOffice = office;
    document.getElementById('newFloorNumber').value = '';
    document.getElementById('addFloorModal').style.display = 'flex';
}
function closeAddFloorModal() { document.getElementById('addFloorModal').style.display = 'none'; }
async function confirmAddFloor() {
    if (!addFloorForOffice) return;
    const num = parseInt(document.getElementById('newFloorNumber').value);
    if (isNaN(num)) { toast('Введите номер этажа'); return; }
    const result = await apiFetch('floors/', {
        method: 'POST',
        body: JSON.stringify({ number: num, office: addFloorForOffice.id }),
    });
    if (result) {
        toast('Этаж ' + num + ' создан', 'success');
        closeAddFloorModal();
        const floors = await apiFetch('floors/?office=' + addFloorForOffice.id) || [];
        showFloorPopup(addFloorForOffice, currentOfficeCity, floors);
    }
}

// ==== Delete office ====
async function tryDeleteOffice(office, city) {
    if (!confirm('Удалить офис «' + office.name + '» и все его этажи?')) return;
    const result = await apiFetch('offices/' + office.id + '/', { method: 'DELETE' });
    if (result) {
        toast('Офис удалён', 'success');
        const offices = await apiFetch('offices/?city=' + city.id) || [];
        const dots = document.querySelectorAll('#cityDots .city-dot');
        if (dots.length) showOfficePopup(city, offices, dots[0]);
    }
}

function closePopup() { document.getElementById('popupPanel').style.display = 'none'; }

function updateBreadcrumb(parts) {
    const bc = document.getElementById('breadcrumb');
    let html = '<a onclick="resetMap()">Россия</a>';
    parts.forEach(p => { html += ' <span class="sep">›</span> <span>' + p + '</span>'; });
    bc.innerHTML = html;
}

function resetMap() {
    selectedRegion = null; selectedCity = null;
    exitModes(); clearCityDots(); closePopup();
    document.querySelectorAll('#russia-map .region.active').forEach(p => p.classList.remove('active'));
    document.getElementById('breadcrumb').innerHTML = '<span>Россия</span>';
}

loadMap();
