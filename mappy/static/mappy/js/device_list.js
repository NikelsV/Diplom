let allDevices = [], deviceTypes = [], floors = [], offices = [];

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
            <td class="desc" title="${esc(d.description || '')}">${esc(d.description || '—')}</td>
            <td class="actions">
                <button onclick="openEdit(${d.id})">✏️</button>
                <button class="del" onclick="deleteDevice(${d.id},'${esc(d.name).replace(/'/g,"\\'")}')">🗑</button>
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
        // device.floor → floor.office === officeId
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

async function deleteDevice(id, name) {
    if (!confirm('Удалить «' + name + '»? Связи будут удалены.')) return;
    await apiFetch('devices/' + id + '/', { method: 'DELETE' });
    allDevices = allDevices.filter(d => d.id !== id);
    applyFilters();
    toast('Удалено', 'success');
}

loadAll();
