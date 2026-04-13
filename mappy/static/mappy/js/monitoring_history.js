let allHistory = [];
let protocols = [];

function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

function fmtDuration(start, end) {
    if (!start) return '—';
    const s = new Date(start);
    const e = end ? new Date(end) : new Date();
    const diff = Math.floor((e - s) / 1000);
    if (diff < 60) return diff + ' сек';
    if (diff < 3600) return Math.floor(diff / 60) + ' мин ' + (diff % 60) + ' сек';
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return h + ' ч ' + m + ' мин';
}

async function loadAll() {
    protocols = await apiFetch('monitoring/available-protocols/') || [];
    const selProto = document.getElementById('filterProtocol');
    protocols.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.display_name;
        selProto.appendChild(opt);
    });

    await loadHistory();
}

async function loadHistory() {
    const proto = document.getElementById('filterProtocol').value;
    const status = document.getElementById('filterStatus').value;
    const sort = document.getElementById('filterSort').value;

    let url = 'monitoring/history/?sort=' + sort;
    if (proto) url += '&protocol=' + proto;
    if (status !== '') url += '&status=' + status;

    allHistory = await apiFetch(url) || [];
    renderTable(allHistory);
}

function renderTable(data) {
    const body = document.getElementById('monBody');
    const noData = document.getElementById('noData');
    const q = document.getElementById('searchInput').value.toLowerCase();

    let filtered = data;
    if (q) {
        filtered = filtered.filter(h =>
            (h.device_name || '').toLowerCase().includes(q) ||
            (h.device_ip || '').toLowerCase().includes(q)
        );
    }

    body.innerHTML = '';
    if (!filtered.length) {
        noData.style.display = 'block';
        return;
    }
    noData.style.display = 'none';

    filtered.forEach(h => {
        const tr = document.createElement('tr');
        const statusClass = h.status ? 'status-ok' : 'status-fail';
        const statusText = h.status ? '✓ Доступен' : '✗ Недоступен';
        const detailsStr = h.details ? JSON.stringify(h.details) : '';

        tr.innerHTML = `
            <td class="${statusClass}">${statusText}</td>
            <td>${esc(h.device_name)}</td>
            <td>${esc(h.device_ip || '—')}</td>
            <td>${esc(h.protocol_name)}</td>
            <td>${fmtDate(h.started_at)}</td>
            <td>${h.ended_at ? fmtDate(h.ended_at) : '<em>текущий</em>'}</td>
            <td>${fmtDuration(h.started_at, h.ended_at)}</td>
            <td class="details" title="${esc(detailsStr)}">${esc(detailsStr || '—')}</td>
        `;
        body.appendChild(tr);
    });
}

document.getElementById('searchInput').addEventListener('input', () => renderTable(allHistory));
document.getElementById('filterProtocol').addEventListener('change', loadHistory);
document.getElementById('filterStatus').addEventListener('change', loadHistory);
document.getElementById('filterSort').addEventListener('change', loadHistory);

loadAll();
