const API_BASE = window.location.origin;
let token = localStorage.getItem('votecast_admin_token');
let dashTimer = null;
let contestantsById = new Map();

const loginSection = document.getElementById('login-section');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const navItems = document.querySelectorAll('.nav-item');
const tabSections = document.querySelectorAll('.content > .tab');
const pageTitle = document.getElementById('page-title');

const titles = {
    dashboard: 'Overview',
    contestants: 'Models',
    voting: 'Session Control',
    display: 'Scoreboard Display',
    qr: 'QR Access',
    settings: 'Logs'
};

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function showLogin() {
    if (dashTimer) clearInterval(dashTimer);
    dashTimer = null;
    token = null;
    loginSection.style.display = 'flex';
    tabSections.forEach((s) => s.classList.remove('active'));
}

function showApp() {
    loginSection.style.display = 'none';
    tabSections.forEach((s) => s.classList.remove('active'));
    const dashboard = document.getElementById('tab-dashboard');
    if (dashboard) dashboard.classList.add('active');
    navItems.forEach((i) => i.classList.toggle('active', i.dataset.tab === 'dashboard'));
    if (pageTitle) pageTitle.textContent = titles.dashboard;
}

navItems.forEach((item) => {
    item.addEventListener('click', () => {
        navItems.forEach((i) => i.classList.remove('active'));
        item.classList.add('active');
        const tab = item.dataset.tab;
        tabSections.forEach((s) => s.classList.remove('active'));
        const target = document.getElementById(`tab-${tab}`);
        if (target) target.classList.add('active');
        if (pageTitle) pageTitle.textContent = titles[tab] || tab;
        if (tab === 'settings') loadLogs();
        if (tab === 'qr') loadQR();
        if (tab === 'voting') loadAdminVoteList();
        if (tab === 'contestants') loadContestants();
    });
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('votecast_admin_token');
    showLogin();
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    try {
        const res = await fetch(`${API_BASE}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) {
            alert(data.detail || 'Login failed');
            return;
        }
        token = data.access_token;
        localStorage.setItem('votecast_admin_token', token);
        showApp();
        loadDashboard();
        loadContestants();
        if (dashTimer) clearInterval(dashTimer);
        dashTimer = setInterval(loadDashboard, 3000);
    } catch (err) {
        alert('Connection error');
    }
});

function authHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

async function adminFetch(url, options = {}) {
    const res = await fetch(url, { ...options, headers: authHeaders() });
    if (res.status === 401) {
        localStorage.removeItem('votecast_admin_token');
        showLogin();
        throw new Error('Session expired');
    }
    return res;
}

async function loadDashboard() {
    if (!token) return;
    try {
        const res = await adminFetch(`${API_BASE}/api/admin/stats`);
        if (!res.ok) return;
        const data = await res.json();
        document.getElementById('stat-total').textContent = data.total_voters ?? 0;
        document.getElementById('stat-voted').textContent = data.voted_count ?? 0;
        document.getElementById('stat-votes').textContent = data.total_votes ?? 0;
        document.getElementById('stat-status').textContent = String(data.state?.status || 'idle').toUpperCase();

        const list = document.getElementById('standings-list');
        const sorted = [...(data.contestants || [])].sort((a, b) => b.points_total - a.points_total);
        if (!sorted.length) {
            list.innerHTML = '<div class="empty">Add models to see live standings</div>';
            return;
        }
        list.innerHTML = sorted.map((c, idx) => `
            <div class="standing-item">
                <div class="standing-rank ${idx === 0 ? 'top' : ''}">${idx + 1}</div>
                <div class="standing-info">
                    <div class="standing-name">${esc(c.name)}</div>
                    <div class="standing-stage">Audience: ${c.votes_count || 0} &middot; Admin: ${c.admin_votes_count || 0}</div>
                </div>
                <div style="text-align:right">
                    <div class="standing-points">${c.points_total || 0}</div>
                    <div class="standing-breakdown">pts</div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        /* handled by adminFetch */
    }
}

const modal = document.getElementById('contestant-modal');
const addBtn = document.getElementById('add-contestant-btn');
const modalClose = document.getElementById('modal-close');
const contestantForm = document.getElementById('contestant-form');
const deleteBtn = document.getElementById('delete-contestant-btn');
let currentContestantId = null;

function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function resetForm() {
    ['c-name', 'c-stage', 'c-category', 'c-bio', 'c-gallery'].forEach((id) => {
        document.getElementById(id).value = '';
    });
    document.getElementById('c-order').value = '0';
    const photo = document.getElementById('c-photo');
    if (photo) photo.value = '';
    const galleryFile = document.getElementById('c-gallery-file');
    if (galleryFile) galleryFile.value = '';
}

if (addBtn) addBtn.addEventListener('click', () => {
    document.getElementById('modal-title').textContent = 'Add Model';
    document.getElementById('contestant-id').value = '';
    currentContestantId = null;
    resetForm();
    if (deleteBtn) deleteBtn.style.display = 'none';
    modal.classList.add('active');
});

if (modalClose) modalClose.addEventListener('click', () => modal.classList.remove('active'));
const modalBackdrop = document.querySelector('.modal-backdrop');
if (modalBackdrop) modalBackdrop.addEventListener('click', () => modal.classList.remove('active'));

function parseGallery(text) {
    if (!text) return [];
    return text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
}

if (contestantForm) contestantForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('contestant-id').value || currentContestantId;
    const galleryImgs = parseGallery(document.getElementById('c-gallery').value);
    const submit = contestantForm.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
        const photoInput = document.getElementById('c-photo');
        if (photoInput && photoInput.files && photoInput.files[0]) {
            galleryImgs.unshift(await fileToDataURL(photoInput.files[0]));
        }
        const galleryFile = document.getElementById('c-gallery-file');
        if (galleryFile && galleryFile.files) {
            for (const file of galleryFile.files) {
                galleryImgs.push(await fileToDataURL(file));
            }
        }
        const payload = {
            name: document.getElementById('c-name').value.trim(),
            stage_name: document.getElementById('c-stage').value.trim(),
            category: document.getElementById('c-category').value.trim(),
            bio: document.getElementById('c-bio').value.trim(),
            photo_url: galleryImgs[0] || '',
            gallery_images: galleryImgs,
            order_index: parseInt(document.getElementById('c-order').value, 10) || 0
        };
        const url = id ? `${API_BASE}/api/admin/contestants/${id}` : `${API_BASE}/api/admin/contestants`;
        const res = await adminFetch(url, {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Could not save model');
        }
        modal.classList.remove('active');
        loadContestants();
        loadDashboard();
    } catch (err) {
        if (err.message !== 'Session expired') alert(err.message);
    } finally {
        if (submit) submit.disabled = false;
    }
});

if (deleteBtn) deleteBtn.addEventListener('click', async () => {
    const id = document.getElementById('contestant-id').value || currentContestantId;
    if (!id) return;
    if (!confirm('Remove this model? This cannot be undone.')) return;
    try {
        await adminFetch(`${API_BASE}/api/admin/contestants/${id}`, { method: 'DELETE' });
        modal.classList.remove('active');
        loadContestants();
        loadDashboard();
    } catch (err) {}
});

function openEdit(id) {
    const c = contestantsById.get(Number(id));
    if (!c) return;
    document.getElementById('modal-title').textContent = 'Edit Model';
    document.getElementById('contestant-id').value = c.id || '';
    currentContestantId = c.id || null;
    document.getElementById('c-name').value = c.name || '';
    document.getElementById('c-stage').value = c.stage_name || '';
    document.getElementById('c-category').value = c.category || '';
    document.getElementById('c-bio').value = c.bio || '';
    document.getElementById('c-order').value = c.order_index || 0;
    const gallery = (c.gallery || []).map((g) => (typeof g === 'string' ? g : g.image_url)).filter(Boolean);
    document.getElementById('c-gallery').value = gallery.join('\n');
    const photo = document.getElementById('c-photo');
    if (photo) photo.value = '';
    const galleryFile = document.getElementById('c-gallery-file');
    if (galleryFile) galleryFile.value = '';
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';
    modal.classList.add('active');
}

async function removeModel(id) {
    if (!id) return;
    if (!confirm('Remove this model? This cannot be undone.')) return;
    try {
        await adminFetch(`${API_BASE}/api/admin/contestants/${id}`, { method: 'DELETE' });
        loadContestants();
        loadDashboard();
    } catch (err) {}
}

async function loadContestants() {
    if (!token) return;
    try {
        const res = await adminFetch(`${API_BASE}/api/admin/contestants`);
        if (!res.ok) return;
        const contestants = await res.json();
        contestantsById = new Map(contestants.map((c) => [Number(c.id), c]));
        const wrap = document.getElementById('contestants-table');
        if (!contestants.length) {
            wrap.innerHTML = '<div class="empty">No models yet. Add the first profile.</div>';
            return;
        }
        wrap.innerHTML = `
            <table>
                <thead><tr><th>Name</th><th>Stage Name</th><th>Category</th><th>Points</th><th>Actions</th></tr></thead>
                <tbody>
                    ${contestants.map((c) => `
                        <tr>
                            <td>${esc(c.name)}</td>
                            <td>${esc(c.stage_name || '-')}</td>
                            <td>${esc(c.category || '-')}</td>
                            <td>${c.points_total || 0}</td>
                            <td>
                                <button class="btn btn-small" data-edit="${Number(c.id)}">Edit</button>
                                <button class="btn btn-small" data-remove="${Number(c.id)}" style="margin-left:6px">Remove</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        wrap.querySelectorAll('[data-edit]').forEach((btn) => {
            btn.addEventListener('click', () => openEdit(btn.dataset.edit));
        });
        wrap.querySelectorAll('[data-remove]').forEach((btn) => {
            btn.addEventListener('click', () => removeModel(btn.dataset.remove));
        });
    } catch (e) {}
}

document.getElementById('btn-start').addEventListener('click', () => controlEvent('start'));
document.getElementById('btn-begin-voting').addEventListener('click', () => controlEvent('begin_voting'));
document.getElementById('btn-runway-ended').addEventListener('click', () => controlEvent('runway_ended'));
document.getElementById('btn-declare-winner').addEventListener('click', () => {
    if (confirm('Declare winner based on highest points?')) controlEvent('declare_winner');
});
document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('Reset all votes? This cannot be undone.')) controlEvent('reset');
});

async function controlEvent(action) {
    try {
        await adminFetch(`${API_BASE}/api/admin/event/control`, {
            method: 'POST',
            body: JSON.stringify({ action })
        });
        loadDashboard();
        loadAdminVoteList();
    } catch (e) {}
}

async function loadAdminVoteList() {
    if (!token) return;
    try {
        const res = await adminFetch(`${API_BASE}/api/admin/stats`);
        if (!res.ok) return;
        const data = await res.json();
        const list = document.getElementById('admin-vote-list');
        if (!data.contestants || !data.contestants.length) {
            list.innerHTML = '<div class="empty">No models available</div>';
            return;
        }
        list.innerHTML = '';
        data.contestants.forEach((c) => {
            const item = document.createElement('div');
            item.className = 'admin-vote-item';
            item.innerHTML = `
                <div>
                    <div style="font-weight:500">${esc(c.name)}</div>
                    <div style="font-size:12px;color:var(--text-dim)">Admin votes: ${c.admin_votes_count || 0} &middot; Total: ${c.points_total || 0} pts</div>
                </div>
                <button class="btn-vote">+3 AUDIENCE VOTES</button>
            `;
            item.querySelector('.btn-vote').addEventListener('click', () => adminVote(c.id));
            list.appendChild(item);
        });
    } catch (e) {}
}

async function adminVote(id) {
    try {
        await adminFetch(`${API_BASE}/api/admin/vote`, {
            method: 'POST',
            body: JSON.stringify({ contestant_id: id })
        });
        loadAdminVoteList();
        loadDashboard();
    } catch (e) {}
}

async function loadLogs() {
    if (!token) return;
    try {
        const res = await adminFetch(`${API_BASE}/api/admin/logs?limit=50`);
        if (!res.ok) return;
        const logs = await res.json();
        const wrap = document.getElementById('logs-table');
        wrap.innerHTML = logs.length ? `
            <table>
                <thead><tr><th>Time</th><th>Type</th><th>Message</th></tr></thead>
                <tbody>
                    ${logs.map((l) => `
                        <tr>
                            <td>${esc((l.created_at || '').replace('T', ' ').substring(0, 19))}</td>
                            <td>${esc(l.log_type)}</td>
                            <td>${esc(l.message)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        ` : '<div class="empty">No activity yet</div>';

        const vres = await adminFetch(`${API_BASE}/api/admin/voters`);
        if (!vres.ok) return;
        const voters = await vres.json();
        const vwrap = document.getElementById('voters-table');
        vwrap.innerHTML = voters.length ? `
            <table>
                <thead><tr><th>Name</th><th>Email</th><th>Telephone</th><th>Voted</th><th>Registered</th></tr></thead>
                <tbody>
                    ${voters.map((v) => `
                        <tr>
                            <td>${esc(v.name)}</td>
                            <td>${esc(v.email)}</td>
                            <td>${esc(v.telephone)}</td>
                            <td>${v.has_voted ? 'Yes' : '-'}</td>
                            <td>${esc((v.registered_at || '').replace('T', ' ').substring(0, 16))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        ` : '<div class="empty">No voters registered yet</div>';
    } catch (e) {}
}

document.getElementById('refresh-logs').addEventListener('click', loadLogs);

let qrDataUrl = null;
let qrUrl = '';

function renderQR(url) {
    qrUrl = url;
    if (typeof qrcode !== 'function') {
        document.getElementById('qr-container').innerHTML = '<div class="empty">QR library unavailable</div>';
        return;
    }
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    qrDataUrl = qr.createDataURL(8, 8);
    document.getElementById('qr-container').innerHTML = `<img src="${qrDataUrl}" alt="Voter QR code">`;
    document.getElementById('qr-url').textContent = url;
}

async function loadQR() {
    try {
        const res = await fetch(`${API_BASE}/api/qr`, { cache: 'no-store' });
        const data = await res.json();
        renderQR(data.url || `${API_BASE}/voter`);
    } catch (e) {
        renderQR(`${API_BASE}/voter`);
    }
}

document.getElementById('refresh-qr').addEventListener('click', loadQR);

function downloadQR() {
    if (!qrDataUrl) {
        loadQR().then(() => {
            if (qrDataUrl) saveQR();
        });
        return;
    }
    saveQR();
}

function saveQR() {
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = 'DA-VELA_Voter_QR.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

document.getElementById('download-qr').addEventListener('click', downloadQR);

if (token) {
    showApp();
    loadDashboard();
    loadContestants();
    dashTimer = setInterval(loadDashboard, 3000);
} else {
    showLogin();
}


async function fileToDataURL2(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function loadScoreboardDisplay() {
    if (!token) return;
    try {
        const res = await adminFetch(`${API_BASE}/api/admin/scoreboard/display`);
        if (!res.ok) return;
        const data = await res.json();
        document.getElementById('display-mode').value = data.mode || 'leaderboard';
        document.getElementById('display-title').value = data.title || '';
        document.getElementById('display-body').value = data.body || '';
        document.getElementById('display-image-url').value = data.image_url || '';
        document.getElementById('display-countdown').checked = !!data.show_countdown;
        const prev = document.getElementById('display-preview');
        const pb = document.getElementById('display-preview-body');
        if (data.mode && data.mode !== 'leaderboard') {
            prev.style.display = 'block';
            pb.innerHTML = `<strong>${esc(data.mode).toUpperCase()}</strong><br>${esc(data.title)}<br>${esc((data.body||'').substring(0,120))}`;
        } else {
            prev.style.display = 'none';
        }
    } catch (e) {}
}

document.getElementById('display-refresh').addEventListener('click', loadScoreboardDisplay);

document.getElementById('display-leaderboard').addEventListener('click', async () => {
    try {
        await adminFetch(`${API_BASE}/api/admin/scoreboard/display`, {
            method: 'PUT',
            body: JSON.stringify({ mode: 'leaderboard', title: '', body: '', image_url: '', show_countdown: false })
        });
        document.getElementById('display-mode').value = 'leaderboard';
        document.getElementById('display-title').value = '';
        document.getElementById('display-body').value = '';
        document.getElementById('display-image-url').value = '';
        document.getElementById('display-countdown').checked = false;
        document.getElementById('display-preview').style.display = 'none';
        alert('Scoreboard reverted to live leaderboard');
    } catch (e) {}
});

document.getElementById('display-push').addEventListener('click', async () => {
    const btn = document.getElementById('display-push');
    btn.disabled = true;
    try {
        let image_url = document.getElementById('display-image-url').value.trim();
        const file = document.getElementById('display-image-file').files[0];
        if (file) {
            const dataUrl = await fileToDataURL2(file);
            const res = await adminFetch(`${API_BASE}/api/admin/contestants`, { method: 'GET' }).catch(()=>null);
            // reuse media upload by creating a quick contestant update is heavy; just use dataUrl via our store? easier: post to a temp path not needed
            // actually our _saveImage in worker can handle data URLs on contestant create/update; for display just send dataUrl and worker will convert
            image_url = dataUrl;
        }
        const payload = {
            mode: document.getElementById('display-mode').value,
            title: document.getElementById('display-title').value,
            body: document.getElementById('display-body').value,
            image_url,
            show_countdown: document.getElementById('display-countdown').checked
        };
        await adminFetch(`${API_BASE}/api/admin/scoreboard/display`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        await loadScoreboardDisplay();
        alert('Displayed on scoreboard!');
    } catch (e) {
        alert('Failed to push display');
    } finally {
        btn.disabled = false;
    }
});
