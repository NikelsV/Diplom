const FLOOR_ID = parseInt(document.getElementById('floorWrap').dataset.floorId);
const ICON_SIZE = 48;
const WAYPOINT_RADIUS = 6;

let stage, layer, connectionsLayer, bgLayer;
let devices = [], connections = [], deviceTypes = [], builtinIcons = [];
let selectedDevice = null, connectionMode = false, connectionStart = null;
let iconImages = {};
let imgW = 0, imgH = 0;
// Padding = half of image size on each side → total canvas = 2x image each dimension = 4 images
let padX = 0, padY = 0;

// ==== Floor zoom/pan ====
let fScale = 1, fPanX = 0, fPanY = 0, fIsPanning = false, fPanStartX = 0, fPanStartY = 0;

function initFloorZoomPan() {
    const wrap = document.getElementById('floorWrap');
    wrap.addEventListener('contextmenu', e => e.preventDefault());

    wrap.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = wrap.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top, old = fScale;
        fScale = Math.min(5, Math.max(getMinScale(), fScale * (e.deltaY > 0 ? 0.9 : 1.1)));
        fPanX = mx - (mx - fPanX) * (fScale / old);
        fPanY = my - (my - fPanY) * (fScale / old);
        applyFloorTransform();
    }, { passive: false });

    wrap.addEventListener('mousedown', (e) => {
        if (e.target.closest('.floor-zoom-controls')) return;
        if (e.button === 2 || e.button === 1) {
            e.preventDefault();
            fIsPanning = true;
            fPanStartX = e.clientX - fPanX;
            fPanStartY = e.clientY - fPanY;
            wrap.classList.add('grabbing');
        }
    });
    window.addEventListener('mousemove', (e) => {
        if (!fIsPanning) return;
        fPanX = e.clientX - fPanStartX;
        fPanY = e.clientY - fPanStartY;
        applyFloorTransform();
    });
    window.addEventListener('mouseup', () => { fIsPanning = false; document.getElementById('floorWrap').classList.remove('grabbing'); });
}

function applyFloorTransform() {
    clampPan();
    document.getElementById('floorInner').style.transform = `translate(${fPanX}px,${fPanY}px) scale(${fScale})`;
}

// Restrict pan so canvas area always fills viewport (can't scroll into void)
function clampPan() {
    const wrap = document.getElementById('floorWrap');
    const ww = wrap.clientWidth, wh = wrap.clientHeight;
    const sw = stage.width() * fScale, sh = stage.height() * fScale;

    // If canvas smaller than viewport — center it
    if (sw <= ww) { fPanX = (ww - sw) / 2; }
    else { fPanX = Math.min(0, Math.max(ww - sw, fPanX)); }

    if (sh <= wh) { fPanY = (wh - sh) / 2; }
    else { fPanY = Math.min(0, Math.max(wh - sh, fPanY)); }
}

// Min scale: canvas must fill viewport
function getMinScale() {
    const wrap = document.getElementById('floorWrap');
    if (!wrap || !stage) return 0.1;
    const sw = stage.width(), sh = stage.height();
    if (sw === 0 || sh === 0) return 0.1;
    return Math.min(wrap.clientWidth / sw, wrap.clientHeight / sh);
}

// Fit image to viewport
function floorZoomReset() {
    const wrap = document.getElementById('floorWrap');
    const ww = wrap.clientWidth, wh = wrap.clientHeight;
    if (imgW > 0 && imgH > 0) {
        // Scale so full image fits in viewport
        fScale = Math.min(ww / imgW, wh / imgH) * 0.95;
        // Center image in viewport
        fPanX = (ww - imgW * fScale) / 2 - padX * fScale;
        fPanY = (wh - imgH * fScale) / 2 - padY * fScale;
    } else {
        fScale = 1; fPanX = 0; fPanY = 0;
    }
    applyFloorTransform();
}

function floorZoomIn() {
    const wr = document.getElementById('floorWrap').getBoundingClientRect();
    const cx = wr.width/2, cy = wr.height/2, old = fScale;
    fScale = Math.min(5, fScale * 1.3);
    fPanX = cx - (cx - fPanX) * (fScale / old); fPanY = cy - (cy - fPanY) * (fScale / old);
    applyFloorTransform();
}
function floorZoomOut() {
    const wr = document.getElementById('floorWrap').getBoundingClientRect();
    const cx = wr.width/2, cy = wr.height/2, old = fScale;
    fScale = Math.max(getMinScale(), fScale / 1.3);
    fPanX = cx - (cx - fPanX) * (fScale / old); fPanY = cy - (cy - fPanY) * (fScale / old);
    applyFloorTransform();
}

function initSidebar() {
    // Toggle
    document.getElementById('floorSidebarToggle').addEventListener('click', () => {
        document.getElementById('floorSidebar').classList.toggle('collapsed');
    });
    // Tabs
    document.querySelectorAll('.fs-tab').forEach(t => {
        t.addEventListener('click', () => switchTab(t.dataset.tab));
    });
    // Search
    document.getElementById('sidebarSearch').addEventListener('input', renderSidebarDeviceList);
}

let allFloorDevices = []; // ALL devices on this floor, including hidden

async function loadAllFloorDevices() {
    allFloorDevices = await apiFetch('devices/?floor=' + FLOOR_ID) || [];
    renderSidebarDeviceList();
}

function renderSidebarDeviceList() {
    const container = document.getElementById('sidebarDeviceList');
    const q = document.getElementById('sidebarSearch').value.toLowerCase();
    container.innerHTML = '';

    let filtered = allFloorDevices;
    if (q) {
        filtered = filtered.filter(d =>
            (d.name || '').toLowerCase().includes(q) ||
            (d.ip_address || '').toLowerCase().includes(q)
        );
    }

    if (!filtered.length) {
        container.innerHTML = '<div style="color:#999;font-size:.85rem;padding:8px;">Нет устройств</div>';
        return;
    }

    filtered.forEach(d => {
        const onMap = d.visible_on_map !== false;
        const item = document.createElement('div');
        item.className = 'sidebar-dev-item' + (onMap ? '' : ' hidden-from-map');
        item.dataset.deviceId = d.id;

        // Status dot
        const canvasEntry = devices.find(e => e.id === d.id);
        let statusClass = '';
        // Will be updated by updateSidebarStatuses()

        item.innerHTML = `
            <div class="sidebar-dev-status" data-sid="${d.id}"></div>
            <div class="sidebar-dev-info">
                <div class="sidebar-dev-name">${esc(d.name)}</div>
                <div class="sidebar-dev-ip">${esc(d.ip_address || '—')}</div>
            </div>
            <span class="sidebar-dev-map-badge ${onMap ? 'on-map' : 'off-map'}">${onMap ? 'на карте' : 'скрыт'}</span>
            ${!onMap ? '<button class="sidebar-restore-btn" data-restore-id="' + d.id + '">↩ На карту</button>' : ''}
        `;

        // Click → select device (open properties)
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('sidebar-restore-btn')) return;
            const entry = devices.find(x => x.id === d.id);
            if (entry) {
                selectDevice(entry);
            } else {
                // Device hidden from map — show properties for hidden device
                selectHiddenDevice(d);
            }
        });

        // Restore button
        const restoreBtn = item.querySelector('.sidebar-restore-btn');
        if (restoreBtn) {
            restoreBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await restoreDeviceToMap(d.id);
            });
        }

        container.appendChild(item);
    });

    updateSidebarStatuses();
}

function selectHiddenDevice(d) {
    deselectDevice();
    // Create a virtual entry for properties panel (no konvaGroup)
    selectedDevice = { id: d.id, data: d, konvaGroup: null, label: null, statusDot: null };
    document.getElementById('fDeviceType').value = d.device_type || '';
    document.getElementById('fName').value = d.name || '';
    document.getElementById('fModel').value = d.model || '';
    document.getElementById('fIP').value = d.ip_address || '';
    document.getElementById('fMAC').value = d.mac_address || '';
    document.getElementById('fDesc').value = d.description || '';
    document.getElementById('fPerson').value = d.responsible_person || '';
    document.getElementById('fContact').value = d.contact_info || '';
    document.getElementById('fIconScale').value = d.icon_scale || 1.0;
    document.getElementById('fIconScaleVal').textContent = d.icon_scale || 1.0;
    document.getElementById('propsPlaceholder').style.display = 'none';
    document.getElementById('propsContent').style.display = 'block';
    document.getElementById('propsTitle').textContent = (d.name || 'Устройство') + ' (скрыт)';
    switchTab('props');
    document.getElementById('floorSidebar').classList.remove('collapsed');
    loadMonitorConfigs(selectedDevice);
    highlightSidebarItem(d.id);
}

async function restoreDeviceToMap(deviceId) {
    const result = await apiFetch('devices/' + deviceId + '/', {
        method: 'PATCH', body: JSON.stringify({ visible_on_map: true, x: 100, y: 100 })
    });
    if (result) {
        toast('Устройство возвращено на карту', 'success');
        // Update local data
        const idx = allFloorDevices.findIndex(d => d.id === deviceId);
        if (idx >= 0) allFloorDevices[idx] = result;
        // Add to canvas
        const entry = await addDeviceToCanvas(result);
        layer.draw();
        renderSidebarDeviceList();
    }
}

function highlightSidebarItem(deviceId) {
    document.querySelectorAll('.sidebar-dev-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.deviceId == deviceId);
    });
}

function updateSidebarStatuses() {
    // Update status dots in sidebar from loaded device statuses
    document.querySelectorAll('.sidebar-dev-status').forEach(dot => {
        const id = dot.dataset.sid;
        const entry = devices.find(e => e.id == id);
        if (entry && entry.statusDot) {
            const fill = entry.statusDot.fill();
            if (fill === '#4caf50') dot.classList.add('ok');
            else if (fill === '#e53935') dot.classList.add('fail');
        }
    });
}

// ==== Helpers ====
function loadIcon(url) { return new Promise(resolve=>{ if(iconImages[url]){resolve(iconImages[url]);return;} const img=new Image();img.crossOrigin='anonymous'; img.onload=()=>{iconImages[url]=img;resolve(img);}; img.onerror=()=>resolve(null); img.src=url; }); }
function getDeviceIconUrl(d) { const dt=deviceTypes.find(t=>t.id===d.device_type); if(dt){if(dt.icon)return dt.icon;if(dt.builtin_icon){const bi=builtinIcons.find(i=>i.filename===dt.builtin_icon);if(bi)return bi.url;}} return null; }

// ==== Init Konva ====
function initStage() {
    stage = new Konva.Stage({ container: 'konvaContainer', width: 2000, height: 1500, draggable: false });
    bgLayer = new Konva.Layer({ listening: false }); // bg layer doesn't need events
    connectionsLayer = new Konva.Layer();
    layer = new Konva.Layer();
    stage.add(bgLayer); stage.add(connectionsLayer); stage.add(layer);
    stage.on('click tap', (e) => { if (e.target === stage || e.target.getLayer() === bgLayer) deselectDevice(); });
}

function resizeStageToImage() {
    // Canvas = 2x image each dimension (image centered)
    padX = Math.round(imgW / 2);
    padY = Math.round(imgH / 2);
    const sw = imgW + padX * 2;
    const sh = imgH + padY * 2;
    stage.width(sw); stage.height(sh);
}

// ==== Load floor ====
async function loadFloorData() {
    const floor = await apiFetch('floors/' + FLOOR_ID + '/');
    if (!floor) return;
    document.getElementById('floorTitle').textContent = 'Этаж ' + floor.number;
    if (floor.office) {
        const office = await apiFetch('offices/' + floor.office + '/');
        if (office) document.getElementById('breadcrumb').innerHTML = `<a href="/">Россия</a> <span class="sep">›</span> <span>${office.name}</span> <span class="sep">›</span> <span>Этаж ${floor.number}</span>`;
    }
    if (floor.map_image) {
        const bgImg = new Image();
        bgImg.onload = () => {
            imgW = bgImg.naturalWidth; imgH = bgImg.naturalHeight;
            resizeStageToImage();
            bgLayer.destroyChildren();
            bgLayer.add(new Konva.Image({ image: bgImg, x: padX, y: padY, width: imgW, height: imgH }));
            bgLayer.draw();
            floorZoomReset();
        };
        bgImg.src = floor.map_image;
    }
}

// ==== Devices ====
async function loadDevices() {
    const data = await apiFetch('devices/?floor=' + FLOOR_ID);
    if (!data) return;
    for (const d of data) {
        if (d.visible_on_map === false) continue; // скрытые не показываем
        await addDeviceToCanvas(d);
    }
    layer.draw();
}

// Build a map: deviceId → list of connection entries for fast lookup during drag
let deviceConnectionMap = {};
function rebuildDeviceConnectionMap() {
    deviceConnectionMap = {};
    connections.forEach(c => {
        if (!deviceConnectionMap[c.data.device_a]) deviceConnectionMap[c.data.device_a] = [];
        if (!deviceConnectionMap[c.data.device_b]) deviceConnectionMap[c.data.device_b] = [];
        deviceConnectionMap[c.data.device_a].push(c);
        deviceConnectionMap[c.data.device_b].push(c);
    });
}

async function addDeviceToCanvas(dd) {
    const gx = (dd.x || 100) + padX;
    const gy = (dd.y || 100) + padY;
    const sc = dd.icon_scale || 1.0;
    const size = ICON_SIZE * sc;
    const group = new Konva.Group({
        x: gx, y: gy, draggable: true,
        dragBoundFunc: function(pos) {
            const margin = size / 2;
            return {
                x: Math.max(margin, Math.min(stage.width() - margin, pos.x)),
                y: Math.max(margin, Math.min(stage.height() - margin, pos.y)),
            };
        }
    });

    const iconUrl = getDeviceIconUrl(dd);
    let iconNode;
    if (iconUrl) { const img = await loadIcon(iconUrl); if (img) iconNode = new Konva.Image({ image: img, width: size, height: size, offsetX: size/2, offsetY: size/2 }); }
    if (!iconNode) iconNode = new Konva.Rect({ width: size, height: size, offsetX: size/2, offsetY: size/2, fill: '#7986cb', cornerRadius: 8 });
    group.add(iconNode);

    const label = new Konva.Text({ text: dd.name || 'Устройство', fontSize: 11, fill: '#333', align: 'center', y: size/2+4 });
    label.offsetX(label.width()/2);
    group.add(label);

    const statusDot = new Konva.Circle({ x: size/2-4, y: -size/2+4, radius: 5, fill: '#bbb', stroke: '#fff', strokeWidth: 1.5 });
    group.add(statusDot);

    layer.add(group);
    const entry = { id: dd.id, konvaGroup: group, data: dd, label, statusDot };
    devices.push(entry);

    group.on('click tap', (e) => { e.cancelBubble = true; if (connectionMode) onConnectionClick(entry); else selectDevice(entry); });

    // Drag: only update THIS device's connections, use requestAnimationFrame
    let dragRafId = null;
    group.on('dragmove', () => {
        if (dragRafId) return; // skip if frame already scheduled
        dragRafId = requestAnimationFrame(() => {
            const conns = deviceConnectionMap[dd.id];
            if (conns) conns.forEach(c => updateSingleConnectionLine(c));
            connectionsLayer.batchDraw();
            dragRafId = null;
        });
    });
    group.on('dragend', () => {
        const pos = group.position();
        const sx = pos.x - padX, sy = pos.y - padY;
        apiFetch('devices/' + dd.id + '/move/', { method: 'PATCH', body: JSON.stringify({x: sx, y: sy}) });
        dd.x = sx; dd.y = sy;
        const conns = deviceConnectionMap[dd.id];
        if (conns) conns.forEach(c => updateSingleConnectionLine(c));
        connectionsLayer.batchDraw();
    });
    return entry;
}

// ==== Select/Deselect ====
function selectDevice(entry) {
    deselectDevice();
    selectedDevice = entry;
    if (entry.konvaGroup) {
        entry.konvaGroup.children[0].stroke('#3f51b5'); entry.konvaGroup.children[0].strokeWidth(3); layer.draw();
    }
    const d = entry.data;
    document.getElementById('fDeviceType').value = d.device_type || '';
    document.getElementById('fName').value = d.name || '';
    document.getElementById('fModel').value = d.model || '';
    document.getElementById('fIP').value = d.ip_address || '';
    document.getElementById('fMAC').value = d.mac_address || '';
    document.getElementById('fDesc').value = d.description || '';
    document.getElementById('fPerson').value = d.responsible_person || '';
    document.getElementById('fContact').value = d.contact_info || '';
    const scaleSlider = document.getElementById('fIconScale');
    scaleSlider.value = d.icon_scale || 1.0;
    document.getElementById('fIconScaleVal').textContent = scaleSlider.value;
    document.getElementById('propsPlaceholder').style.display = 'none';
    document.getElementById('propsContent').style.display = 'block';
    document.getElementById('propsTitle').textContent = d.name || 'Устройство';
    switchTab('props');
    // Open sidebar if collapsed
    document.getElementById('floorSidebar').classList.remove('collapsed');
    loadMonitorConfigs(entry);
    highlightSidebarItem(entry.id);
}
function deselectDevice() {
    if (selectedDevice && selectedDevice.konvaGroup) {
        try { if (selectedDevice.konvaGroup.getStage()) { selectedDevice.konvaGroup.children[0].stroke(''); selectedDevice.konvaGroup.children[0].strokeWidth(0); layer.draw(); } } catch(e){}
    }
    selectedDevice = null;
    highlightSidebarItem(null);
}

// ==== Sidebar tabs ====
function switchTab(tabId) {
    document.querySelectorAll('.fs-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.fs-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabId === 'props' ? 'tabContentProps' : 'tabContentDevList').classList.add('active');
}

// ==== Auto-save ====
let saveTimeout = null;
function setupAutoSave() {
    ['fName','fModel','fIP','fMAC','fDesc','fPerson','fContact','fDeviceType','fIconScale'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => { if(saveTimeout)clearTimeout(saveTimeout); saveTimeout=setTimeout(saveDeviceFields,800); });
    });
    // Live update scale label
    document.getElementById('fIconScale').addEventListener('input', () => {
        document.getElementById('fIconScaleVal').textContent = document.getElementById('fIconScale').value;
    });
}
async function saveDeviceFields() {
    if (!selectedDevice) return;
    const body = { name:document.getElementById('fName').value, model:document.getElementById('fModel').value, ip_address:document.getElementById('fIP').value||null, mac_address:document.getElementById('fMAC').value, description:document.getElementById('fDesc').value, responsible_person:document.getElementById('fPerson').value, contact_info:document.getElementById('fContact').value, device_type:document.getElementById('fDeviceType').value||null, icon_scale:parseFloat(document.getElementById('fIconScale').value)||1.0 };
    const r = await apiFetch('devices/'+selectedDevice.data.id+'/', { method:'PATCH', body:JSON.stringify(body) });
    if (r) { Object.assign(selectedDevice.data,r); selectedDevice.label.text(r.name||'Устройство'); selectedDevice.label.offsetX(selectedDevice.label.width()/2); layer.draw(); toast('Сохранено','success'); }
}

// ==== Connections ====
async function loadConnections() {
    const data = await apiFetch('connections/?floor=' + FLOOR_ID);
    if (!data) return;
    for (const c of data) addConnectionToCanvas(c);
    connectionsLayer.draw();
    rebuildDeviceConnectionMap();
}
function addConnectionToCanvas(cd) {
    const devA = devices.find(d=>d.id===cd.device_a), devB = devices.find(d=>d.id===cd.device_b);
    if (!devA||!devB) return;
    const isArrow = cd.line_type==='arrow';
    const pts = buildConnectionPoints(devA,devB,cd.waypoints||[]);
    const lineNode = new Konva.Arrow({ points:pts, stroke:'#546e7a', strokeWidth:2, fill:isArrow?'#546e7a':'transparent', pointerLength:isArrow?10:0, pointerWidth:isArrow?8:0, lineCap:'round', lineJoin:'round', hitStrokeWidth:20 });
    connectionsLayer.add(lineNode);
    const entry = { id:cd.id, konvaLine:lineNode, data:cd, waypointCircles:[] };
    connections.push(entry);
    setupLineDblClick(entry);
    addWaypointHandles(entry, cd.waypoints||[]);
}
function buildConnectionPoints(a,b,wps) { let pts=[a.konvaGroup.x(),a.konvaGroup.y()]; for(const wp of wps)pts.push(wp.x,wp.y); pts.push(b.konvaGroup.x(),b.konvaGroup.y()); return pts; }

let wpSaveTimers = {};
function saveWaypointsDebounced(ce) { if(wpSaveTimers[ce.id])clearTimeout(wpSaveTimers[ce.id]); wpSaveTimers[ce.id]=setTimeout(()=>{apiFetch('connections/'+ce.id+'/waypoints/',{method:'PATCH',body:JSON.stringify({waypoints:ce.data.waypoints||[]})});delete wpSaveTimers[ce.id];},600); }
function setupLineDblClick(ce) { ce.konvaLine.on('dblclick dbltap',(e)=>{e.cancelBubble=true;const pos=stage.getPointerPosition();if(!pos)return;if(!ce.data.waypoints)ce.data.waypoints=[];ce.data.waypoints.push({x:pos.x,y:pos.y});updateSingleConnectionLine(ce);rebuildWaypointHandles(ce);saveWaypointsDebounced(ce);}); }
function rebuildWaypointHandles(ce) { ce.waypointCircles.forEach(c=>c.destroy()); ce.waypointCircles=[]; addWaypointHandles(ce,ce.data.waypoints); connectionsLayer.batchDraw(); }
function addWaypointHandles(ce,wps) {
    wps.forEach((wp,i)=>{
        const circle=new Konva.Circle({x:wp.x,y:wp.y,radius:WAYPOINT_RADIUS,fill:'#ff9800',stroke:'#fff',strokeWidth:2,draggable:true});
        circle.on('dragmove',()=>{ce.data.waypoints[i]={x:circle.x(),y:circle.y()};updateSingleConnectionLine(ce);connectionsLayer.batchDraw();});
        circle.on('dragend',()=>saveWaypointsDebounced(ce));
        circle.on('dblclick dbltap',(e)=>{e.cancelBubble=true;ce.data.waypoints.splice(i,1);updateSingleConnectionLine(ce);rebuildWaypointHandles(ce);saveWaypointsDebounced(ce);});
        connectionsLayer.add(circle);ce.waypointCircles.push(circle);
    });
}
function updateSingleConnectionLine(ce) { const a=devices.find(d=>d.id===ce.data.device_a),b=devices.find(d=>d.id===ce.data.device_b); if(!a||!b)return; ce.konvaLine.points(buildConnectionPoints(a,b,ce.data.waypoints||[])); }
function updateConnectionLines() { connections.forEach(c=>updateSingleConnectionLine(c)); connectionsLayer.batchDraw(); }

// ==== Connection mode ====
function toggleConnectionMode() { connectionMode=!connectionMode;connectionStart=null;document.getElementById('btnAddConnection').classList.toggle('active',connectionMode);document.getElementById('modeLabel').textContent=connectionMode?'Кликните на 1-е, затем на 2-е':''; }
async function onConnectionClick(entry) {
    if(!connectionStart){connectionStart=entry;entry.konvaGroup.children[0].stroke('#ff9800');entry.konvaGroup.children[0].strokeWidth(3);layer.draw();document.getElementById('modeLabel').textContent='Выбрано: '+entry.data.name+'. Кликните на 2-е.';}
    else{
        if(connectionStart.id===entry.id){toast('Нельзя связать с собой');return;}
        const r=await apiFetch('connections/',{method:'POST',body:JSON.stringify({device_a:connectionStart.id,device_b:entry.id,line_type:'line'})});
        if(r){addConnectionToCanvas(r);rebuildDeviceConnectionMap();connectionsLayer.draw();toast('Связь создана','success');}
        connectionStart.konvaGroup.children[0].stroke('');connectionStart.konvaGroup.children[0].strokeWidth(0);layer.draw();connectionStart=null;
        document.getElementById('modeLabel').textContent='Кликните на 1-е, затем на 2-е';
    }
}

// ==== Add/Delete device ====
function openAddDeviceModal(){document.getElementById('addDeviceModal').style.display='flex';document.getElementById('newDeviceName').value='';}
function closeAddDeviceModal(){document.getElementById('addDeviceModal').style.display='none';}
async function confirmAddDevice(){
    const typeId=document.getElementById('newDeviceType').value,name=document.getElementById('newDeviceName').value||'Новое устройство';
    const r=await apiFetch('devices/',{method:'POST',body:JSON.stringify({floor:FLOOR_ID,device_type:typeId||null,name,x:imgW/2||500,y:imgH/2||500})});
    if(r){await addDeviceToCanvas(r);layer.draw();allFloorDevices.push(r);renderSidebarDeviceList();toast('Устройство добавлено','success');}
    closeAddDeviceModal();
}
async function deleteSelected(){
    if(!selectedDevice){toast('Выберите устройство');return;}
    if(!selectedDevice.konvaGroup){toast('Устройство не на карте');return;}
    if(!confirm('Убрать «'+selectedDevice.data.name+'» с карты?'))return;
    const id=selectedDevice.id,group=selectedDevice.konvaGroup;
    selectedDevice=null;switchTab('devlist');
    await apiFetch('devices/'+id+'/',{method:'PATCH',body:JSON.stringify({visible_on_map:false})});
    connections=connections.filter(c=>{if(c.data.device_a===id||c.data.device_b===id){c.konvaLine.destroy();c.waypointCircles.forEach(w=>w.destroy());return false;}return true;});
    rebuildDeviceConnectionMap();
    group.destroy();devices=devices.filter(d=>d.id!==id);
    layer.draw();connectionsLayer.draw();toast('Устройство скрыто с карты','success');
    // Update sidebar
    const idx = allFloorDevices.findIndex(d => d.id === id);
    if (idx >= 0) allFloorDevices[idx].visible_on_map = false;
    renderSidebarDeviceList();
}

// ==== Upload map ====
function setupMapUpload(){
    document.getElementById('mapUpload').addEventListener('change',async(e)=>{
        const file=e.target.files[0];if(!file)return;
        const fd=new FormData();fd.append('map_image',file);
        try{
            const r=await fetch(API+'floors/'+FLOOR_ID+'/upload-map/',{method:'POST',headers:{'X-CSRFToken':csrfToken()},body:fd});
            if(!r.ok)throw new Error(r.statusText);
            const data=await r.json();
            const bgImg=new Image();
            bgImg.onload=()=>{
                imgW=bgImg.naturalWidth;imgH=bgImg.naturalHeight;
                resizeStageToImage();
                bgLayer.destroyChildren();
                bgLayer.add(new Konva.Image({image:bgImg,x:padX,y:padY,width:imgW,height:imgH}));
                bgLayer.draw();
                floorZoomReset();
            };
            bgImg.src=data.map_image;
            toast('Карта загружена','success');
        }catch(err){toast('Ошибка: '+err.message,'error');}
    });
}

// ==== Load device types ====
async function loadDeviceTypes(){
    deviceTypes=await apiFetch('device-types/')||[];builtinIcons=await apiFetch('builtin-icons/')||[];
    [document.getElementById('fDeviceType'),document.getElementById('newDeviceType')].forEach(sel=>{
        sel.innerHTML='<option value="">— не выбран —</option>';
        deviceTypes.forEach(dt=>{const o=document.createElement('option');o.value=dt.id;o.textContent=dt.name;sel.appendChild(o);});
    });
}

// ==== Toolbar ====
document.getElementById('btnAddDevice').addEventListener('click',openAddDeviceModal);
document.getElementById('btnAddConnection').addEventListener('click',toggleConnectionMode);
document.getElementById('btnDelete').addEventListener('click',deleteSelected);
document.getElementById('btnPollFloor').addEventListener('click', pollFloor);

// ==== Monitoring ====
let availableProtocols = [];

async function loadAvailableProtocols() {
    availableProtocols = await apiFetch('monitoring/available-protocols/') || [];
    // Populate protocol selectors
    const selects = [document.getElementById('pollProtocolSelect'), document.getElementById('devicePollProtocol')];
    selects.forEach(sel => {
        availableProtocols.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.poller_id;
            opt.textContent = p.display_name;
            sel.appendChild(opt);
        });
    });
}

async function loadMonitorConfigs(entry) {
    const container = document.getElementById('monitorConfigs');
    container.innerHTML = '<div style="color:#999;font-size:.8rem;">Загрузка...</div>';

    const configs = await apiFetch('monitoring/monitor-configs/?device=' + entry.id) || [];

    container.innerHTML = '';
    availableProtocols.forEach(proto => {
        // Config now has protocol as FK id; match by poller_id
        const existing = configs.find(c => c.poller_id === proto.poller_id);
        const enabled = existing ? existing.enabled : false;
        // Use effective_params from serializer (merged defaults+global+device)
        const params = existing ? existing.effective_params : proto.default_params;
        const configId = existing ? existing.id : null;

        const div = document.createElement('div');
        div.className = 'monitor-protocol';

        let paramsHtml = '';
        (proto.param_schema || []).forEach(ps => {
            const val = params[ps.key] !== undefined ? params[ps.key] : ps.default;
            paramsHtml += `<div class="monitor-param">
                <label>${esc(ps.label)}</label>
                <input type="${ps.type === 'number' ? 'number' : 'text'}" data-param-key="${ps.key}" value="${esc(String(val))}">
            </div>`;
        });

        div.innerHTML = `
            <div class="monitor-protocol-header">
                <input type="checkbox" data-proto-id="${proto.id}" data-poller-id="${proto.poller_id}" data-config-id="${configId || ''}" ${enabled ? 'checked' : ''}>
                <label>${esc(proto.display_name)}</label>
            </div>
            ${paramsHtml}
        `;

        const checkbox = div.querySelector('input[type="checkbox"]');
        const paramInputs = div.querySelectorAll('.monitor-param input');

        const saveConfig = async () => {
            const isEnabled = checkbox.checked;
            const newParams = {};
            paramInputs.forEach(inp => {
                const key = inp.dataset.paramKey;
                newParams[key] = inp.type === 'number' ? parseFloat(inp.value) : inp.value;
            });

            const cid = checkbox.dataset.configId;
            if (cid) {
                await apiFetch('monitoring/monitor-configs/' + cid + '/', {
                    method: 'PATCH',
                    body: JSON.stringify({ enabled: isEnabled, params: newParams })
                });
            } else {
                // protocol field is now FK id (proto.id), not poller_id string
                const result = await apiFetch('monitoring/monitor-configs/', {
                    method: 'POST',
                    body: JSON.stringify({
                        device: entry.id, protocol: proto.id,
                        enabled: isEnabled, params: newParams
                    })
                });
                if (result) checkbox.dataset.configId = result.id;
            }
        };

        checkbox.addEventListener('change', saveConfig);
        paramInputs.forEach(inp => {
            let t = null;
            inp.addEventListener('input', () => { if (t) clearTimeout(t); t = setTimeout(saveConfig, 800); });
        });

        container.appendChild(div);
    });
}

async function pollSelectedDevice() {
    if (!selectedDevice) { toast('Выберите устройство'); return; }
    if (!selectedDevice.data.ip_address) { toast('У устройства нет IP-адреса', 'error'); return; }
    const btn = document.getElementById('btnPollDevice');
    const protocol = document.getElementById('devicePollProtocol').value;
    const suffix = protocol ? '?protocol=' + protocol : '';
    btn.disabled = true; btn.textContent = '📡 Опрос...';
    const result = await apiFetch('monitoring/poll/device/' + selectedDevice.id + '/' + suffix, { method: 'POST' });
    btn.disabled = false; btn.textContent = '📡 Опросить устройство';
    if (result && result.results) {
        const protos = Object.keys(result.results);
        const allOk = protos.length > 0 && protos.every(p => result.results[p].success);
        const anyFail = protos.some(p => !result.results[p].success);
        if (protos.length === 0) toast('Мониторинг не настроен');
        else if (allOk) toast('Устройство доступно', 'success');
        else toast('Устройство недоступно', 'error');
        updateDeviceStatusDot(selectedDevice, protos.length === 0 ? null : allOk ? true : false);
    }
    await loadDeviceStatuses();
}

async function pollFloor() {
    const btn = document.getElementById('btnPollFloor');
    const protocol = document.getElementById('pollProtocolSelect').value;
    const suffix = protocol ? '?protocol=' + protocol : '';
    btn.disabled = true; btn.textContent = '📡 Опрос запущен...';
    await apiFetch('monitoring/poll/floor/' + FLOOR_ID + '/' + suffix, { method: 'POST' });
    toast('Опрос этажа запущен. Результаты обновятся через несколько секунд.');
    // Poll runs in background thread — wait and refresh statuses
    const refreshStatuses = async (attempts) => {
        for (let i = 0; i < attempts; i++) {
            await new Promise(r => setTimeout(r, 3000));
            await loadDeviceStatuses();
        }
        btn.disabled = false; btn.textContent = '📡 Опросить этаж';
    };
    refreshStatuses(5); // refresh every 3s for 15s total
}

function updateDeviceStatusDot(entry, status) {
    if (!entry.statusDot) return;
    if (status === true) entry.statusDot.fill('#4caf50');
    else if (status === false) entry.statusDot.fill('#e53935');
    else entry.statusDot.fill('#bbb');
    layer.batchDraw();
}

async function loadDeviceStatuses() {
    const result = await apiFetch('monitoring/status/floor/' + FLOOR_ID + '/');
    if (!result || !result.devices) return;
    for (const entry of devices) {
        const status = result.devices[String(entry.id)];
        updateDeviceStatusDot(entry, status === undefined ? null : status);
    }
}

// ==== Init ====
(async function init(){
    initStage();
    initFloorZoomPan();
    await loadDeviceTypes();
    await loadAvailableProtocols();
    await loadFloorData();
    await loadDevices();
    await loadConnections();
    await loadDeviceStatuses();
    setupAutoSave();
    setupMapUpload();
    initSidebar();
    await loadAllFloorDevices();
    renderSidebarDeviceList();
})();
