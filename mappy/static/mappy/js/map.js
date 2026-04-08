/**
 * map.js — Карта России
 * Клик по региону → переход на /region/ID/
 */

let allRegionsFromDB = null;

async function getRegionsFromDB() {
    if (allRegionsFromDB) return allRegionsFromDB;
    allRegionsFromDB = await apiFetch('regions/') || [];
    return allRegionsFromDB;
}

async function loadMap() {
    const resp = await fetch(document.getElementById('mapWrap').dataset.svgUrl);
    const svgText = await resp.text();
    const wrap = document.getElementById('mapWrap');
    const saved = Array.from(wrap.children);
    wrap.innerHTML = svgText;
    saved.forEach(child => wrap.appendChild(child));
    initMapInteraction();
    initZoomPan();
    await getRegionsFromDB();
}

function getSvg() { return document.getElementById('russia-map'); }

function initMapInteraction() {
    document.querySelectorAll('#russia-map .region').forEach(pathEl => {
        pathEl.addEventListener('click', (e) => { e.stopPropagation(); onRegionClick(pathEl); });
        pathEl.addEventListener('mouseenter', () => onRegionHover(pathEl));
        pathEl.addEventListener('mouseleave', () => onRegionLeave());
    });
}

function onRegionHover(pathEl) {
    const groupId = pathEl.getAttribute('data-group');
    const regionId = groupId || pathEl.getAttribute('data-fill');
    const infoBox = document.getElementById('regionInfo');
    infoBox.querySelector('.info-id').textContent = 'id: ' + pathEl.getAttribute('data-fill');
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
    if (!region) { toast('Регион не в БД', 'error'); return; }
    window.location.href = '/region/' + region.id + '/';
}

// ==== Zoom & Pan ====
let scale = 1, panX = 0, panY = 0, isPanning = false, panStartX = 0, panStartY = 0;

function initZoomPan() {
    const wrap = document.getElementById('mapWrap');
    wrap.addEventListener('contextmenu', e => e.preventDefault());
    wrap.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = wrap.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top, old = scale;
        scale = Math.min(8, Math.max(0.5, scale * (e.deltaY > 0 ? 0.9 : 1.1)));
        panX = mx - (mx - panX) * (scale / old); panY = my - (my - panY) * (scale / old);
        applyTransform();
    }, { passive: false });
    wrap.addEventListener('mousedown', (e) => {
        if (e.target.closest('.zoom-controls')) return;
        if (e.button === 2 || e.button === 1) {
            e.preventDefault(); isPanning = true;
            panStartX = e.clientX - panX; panStartY = e.clientY - panY;
            wrap.classList.add('grabbing');
        }
    });
    window.addEventListener('mousemove', (e) => { if (!isPanning) return; panX = e.clientX - panStartX; panY = e.clientY - panStartY; applyTransform(); });
    window.addEventListener('mouseup', () => { isPanning = false; document.getElementById('mapWrap').classList.remove('grabbing'); });
}

function applyTransform() {
    const svgEl = getSvg();
    if (svgEl) svgEl.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
}
function zoomIn() { const wr=document.getElementById('mapWrap').getBoundingClientRect(),cx=wr.width/2,cy=wr.height/2,old=scale; scale=Math.min(8,scale*1.3); panX=cx-(cx-panX)*(scale/old); panY=cy-(cy-panY)*(scale/old); applyTransform(); }
function zoomOut() { const wr=document.getElementById('mapWrap').getBoundingClientRect(),cx=wr.width/2,cy=wr.height/2,old=scale; scale=Math.max(0.5,scale/1.3); panX=cx-(cx-panX)*(scale/old); panY=cy-(cy-panY)*(scale/old); applyTransform(); }
function zoomReset() { scale=1; panX=0; panY=0; applyTransform(); }

loadMap();
