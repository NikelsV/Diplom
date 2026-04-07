/**
 * Общие утилиты для всех страниц WebMap.
 * Подключается первым перед page-specific JS.
 */

const API = '/api/';

function toast(msg, type='') {
    const c = document.getElementById('toasts');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

function csrfToken() {
    return document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('csrftoken='))?.split('=')[1] || '';
}

let _lastErrorTime = 0;
async function apiFetch(url, options={}) {
    const defaults = { headers: {'Content-Type':'application/json', 'X-CSRFToken': csrfToken()} };
    try {
        const r = await fetch(API + url, {...defaults, ...options});
        if (options.method === 'DELETE') {
            if (!r.ok) throw new Error(await r.text());
            return true;
        }
        if (!r.ok) throw new Error(r.statusText);
        const ct = r.headers.get('content-type');
        if (ct && ct.includes('application/json')) return await r.json();
        return null;
    } catch(e) {
        // Throttle error toasts — max 1 per 3 seconds
        const now = Date.now();
        if (now - _lastErrorTime > 3000) {
            toast('Ошибка: ' + e.message, 'error');
            _lastErrorTime = now;
        }
        return null;
    }
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}
