let allDevices = [], deviceTypes = [], floors = [], offices = [];
let deviceStatuses = {}; // {deviceId: true/false/null}

// Lookup helpers
function getTypeName(id) { return deviceTypes.find(t => t.id === id)?.name || '—'; }
function getFloor(id) { return floors.find(f => f.id === id); }
function getOffice(floorId) {
    const floor = getFloor(floorId);
    if (!floor) return null;
    return offices.find(o => o.id === floor.office);
}
function getFloorLabel(id) {
    const f = getFloor(id);
    return f ? 'Этаж ' + f.number : '—';
}
function getOfficeLabel(floorId) {
    const o = getOffice(floorId);
    return o ? o.name : '—';
}
function getStatusHtml(deviceId) {
    const s = deviceStatuses[String(deviceId)];
    if (s === true) return '<span style="color:#4caf50;font-size:1.2em;" title="Доступен">●</span>';
    if (s === false) return '<span style="color:#e53935;font-size:1.2em;" title="Недоступен">●</span>';
    return '<span style="color:#bbb;font-size:1.2em;" title="Нет данных">●</span>';
}

async function loadAll() {
    [deviceTypes, floors, offices, allDevices] = await Promise.all([
        apiFetch('device-types/'),
        apiFetch('floors/'),
        apiFetch('offices/'),
        apiFetch('devices/'),
    ]);
    deviceTypes = deviceTypes || [];
    floors = floors || [];
    offices = offices || [];
    allDevices = allDevices || [];

    // Load statuses for all devices
    await loadAllStatuses();

    // Filter selects
    const selType = document.getElementById('filterType');
    deviceTypes.forEach(t => {
        const o = document.createElement('option');
        o.value = t.id; o.textContent = t.name;
        selType.appendChild(o);
    });

    const selOffice = document.getElementById('filterOffice');
    offices.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.id; opt.textContent = o.name;
        selOffice.appendChild(opt);
    });

    // Edit modal type select
    const eType = document.getElementById('eType');
    eType.innerHTML = '<option value="">— не выбран —</option>';
    deviceTypes.forEach(t => {
        const o = document.createElement('option');
        o.value = t.id; o.textContent = t.name;
        eType.appendChild(o);
    });

    renderDevices(allDevices);
}

async function loadAllStatuses() {
    // Load status per floor (batch)
    deviceStatuses = {};
    const floorIds = [...new Set(allDevices.map(d => d.floor).filter(Boolean))];
    for (const fid of floorIds) {
        const result = await apiFetch('monitoring/status/floor/' + fid + '/');
        if (result && result.devices) {
            Object.assign(deviceStatuses, result.devices);
        }
    }
}

function renderDevices(devs) {
    const body = document.getElementById('deviceBody');
    const noData = document.getElementById('noData');
    body.innerHTML = '';

    if (!devs.length) {
        noData.style.display = 'block';
        return;
    }
    noData.style.display = 'none';

    devs.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${esc(d.name)}</strong></td>
            <td>${esc(getTypeName(d.device_type))}</td>
            <td>${esc(d.model || '—')}</td>
            <td>${esc(d.ip_address || '—')}</td>
            <td>${esc(d.mac_address || '—')}</td>
            <td>${esc(getFloorLabel(d.floor))}</td>
            <td>${esc(getOfficeLabel(d.floor))}</td>
            <td>${esc(d.responsible_person || '—')}</td>
            <td>${esc(d.contact_info || '—')}</td>
            <td class="status-cell">${getStatusHtml(d.id)}</td>
            <td class="desc" title="${esc(d.description || '')}">${esc(d.description || '—')}</td>
            <td class="actions">
                <button onclick="openEdit(${d.id})">✏️</button>
            </td>
        `;
        body.appendChild(tr);
    });
}

// Filter
function applyFilters() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const typeId = document.getElementById('filterType').value;
    const officeId = document.getElementById('filterOffice').value;
    let filtered = allDevices;
    if (q) {
        filtered = filtered.filter(d =>
            (d.name || '').toLowerCase().includes(q) ||
            (d.ip_address || '').toLowerCase().includes(q) ||
            (d.mac_address || '').toLowerCase().includes(q) ||
            (d.responsible_person || '').toLowerCase().includes(q) ||
            (d.contact_info || '').toLowerCase().includes(q) ||
            (d.model || '').toLowerCase().includes(q)
        );
    }
    if (typeId) filtered = filtered.filter(d => d.device_type == typeId);
    if (officeId) {
        const officeFloorIds = floors.filter(f => f.office == officeId).map(f => f.id);
        filtered = filtered.filter(d => officeFloorIds.includes(d.floor));
    }
    renderDevices(filtered);
}

document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('filterType').addEventListener('change', applyFilters);
document.getElementById('filterOffice').addEventListener('change', applyFilters);

// Edit modal
function openEdit(id) {
    const d = allDevices.find(x => x.id === id);
    if (!d) return;
    document.getElementById('eId').value = d.id;
    document.getElementById('eName').value = d.name || '';
    document.getElementById('eModel').value = d.model || '';
    document.getElementById('eIP').value = d.ip_address || '';
    document.getElementById('eMAC').value = d.mac_address || '';
    document.getElementById('eDesc').value = d.description || '';
    document.getElementById('ePerson').value = d.responsible_person || '';
    document.getElementById('eContact').value = d.contact_info || '';
    document.getElementById('eType').value = d.device_type || '';
    document.getElementById('editTitle').textContent = 'Редактировать: ' + d.name;
    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }

async function saveEdit() {
    const id = document.getElementById('eId').value;
    const body = {
        name: document.getElementById('eName').value,
        model: document.getElementById('eModel').value,
        ip_address: document.getElementById('eIP').value || null,
        mac_address: document.getElementById('eMAC').value,
        description: document.getElementById('eDesc').value,
        responsible_person: document.getElementById('ePerson').value,
        contact_info: document.getElementById('eContact').value,
        device_type: document.getElementById('eType').value || null,
    };
    const result = await apiFetch('devices/' + id + '/', { method: 'PATCH', body: JSON.stringify(body) });
    if (result) {
        const idx = allDevices.findIndex(d => d.id == id);
        if (idx >= 0) allDevices[idx] = result;
        applyFilters();
        closeEditModal();
        toast('Обновлено', 'success');
    }
}

loadAll();
