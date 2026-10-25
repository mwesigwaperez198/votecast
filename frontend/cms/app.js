const API_BASE = window.location.origin;
let token = localStorage.getItem('votecast_admin_token');

const loginSection = document.getElementById('login-section');
const mainContent = document.querySelector('.main');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const navItems = document.querySelectorAll('.nav-item');
const tabSections = document.querySelectorAll('.tab-section');
const pageTitle = document.getElementById('page-title');

const titles = {
    dashboard: 'Dashboard',
    contestants: 'Contestants',
    voting: 'Voting Control',
    logs: 'Logs & Registrations',
    qr: 'QR Generator',
    settings: 'Settings'
};

navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const tab = item.dataset.tab;
        tabSections.forEach(s => s.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
        pageTitle.textContent = titles[tab];
        if (tab === 'logs') loadLogs();
        if (tab === 'qr') loadQR();
        if (tab === 'voting') loadAdminVoteList();
    });
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('votecast_admin_token');
    location.reload();
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    try {
        const res = await fetch(`${API_BASE}/api/admin/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password})
        });
        const data = await res.json();
        if (res.ok) {
            token = data.access_token;
            localStorage.setItem('votecast_admin_token', token);
            loginSection.style.display = 'none';
            loadDashboard();
            setInterval(loadDashboard, 3000);
        } else {
            alert(data.detail || 'Login failed');
        }
    } catch (err) {
        alert('Connection error');
    }
});

function authHeaders() {
    return {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`};
}

async function loadDashboard() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/stats`, {headers: authHeaders()});
        if (res.status === 401) { localStorage.removeItem('votecast_admin_token'); location.reload(); return; }
        const data = await res.json();
        document.getElementById('stat-total').textContent = data.total_voters;
        document.getElementById('stat-voted').textContent = data.voted_count;
        document.getElementById('stat-votes').textContent = data.total_votes;
        document.getElementById('stat-status').textContent = (data.state.status || 'IDLE').toUpperCase();
        
        const list = document.getElementById('standings-list');
        list.innerHTML = '';
        const sorted = [...data.contestants].sort((a,b) => b.points_total - a.points_total);
        sorted.forEach((c, idx) => {
            const item = document.createElement('div');
            item.className = 'standing-item';
            item.innerHTML = `
                <div class="standing-rank ${idx === 0 ? 'top' : ''}">${idx + 1}</div>
                <div class="standing-info">
                    <div class="standing-name">${c.name}</div>
                    <div class="standing-stage">Audience: ${c.votes_count} | Admin: ${c.admin_votes_count}</div>
                </div>
                <div style="text-align:right">
                    <div class="standing-points">${c.points_total}</div>
                    <div class="standing-breakdown">pts</div>
                </div>
            `;
            list.appendChild(item);
        });
    } catch (e) {}
}

// Contestants
const modal = document.getElementById('contestant-modal');
const addBtn = document.getElementById('add-contestant-btn');
const modalClose = document.getElementById('modal-close');
const contestantForm = document.getElementById('contestant-form');

addBtn.addEventListener('click', () => {
    document.getElementById('modal-title').textContent = 'Add Contestant';
    document.getElementById('contestant-id').value = '';
    document.getElementById('c-name').value = '';
    document.getElementById('c-stage').value = '';
    document.getElementById('c-category').value = '';
    document.getElementById('c-bio').value = '';
    document.getElementById('c-photo').value = '';
    document.getElementById('c-order').value = '0';
    modal.classList.add('active');
});

modalClose.addEventListener('click', () => modal.classList.remove('active'));
document.querySelector('.modal-backdrop').addEventListener('click', () => modal.classList.remove('active'));

contestantForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('contestant-id').value;
    const data = {
        name: document.getElementById('c-name').value,
        stage_name: document.getElementById('c-stage').value,
        category: document.getElementById('c-category').value,
        bio: document.getElementById('c-bio').value,
        photo_url: document.getElementById('c-photo').value,
        order_index: parseInt(document.getElementById('c-order').value) || 0
    };
    try {
        if (id) {
            await fetch(`${API_BASE}/api/admin/contestants/${id}`, {method: 'PUT', headers: authHeaders(), body: JSON.stringify(data)});
        } else {
            await fetch(`${API_BASE}/api/admin/contestants`, {method: 'POST', headers: authHeaders(), body: JSON.stringify(data)});
        }
        modal.classList.remove('active');
        loadContestants();
        loadDashboard();
    } catch (err) {}
});

async function loadContestants() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/contestants`, {headers: authHeaders()});
        const contestants = await res.json();
        const wrap = document.getElementById('contestants-table');
        let html = '<table><thead><tr><th>Name</th><th>Stage Name</th><th>Category</th><th>Points</th><th>Actions</th></tr></thead><tbody>';
        contestants.forEach(c => {
            html += `<tr><td>${c.name}</td><td>${c.stage_name || '-'}</td><td>${c.category || '-'}</td><td>${c.points_total}</td><td><button class="btn btn-small" onclick="editContestant(${JSON.stringify(c).replace(/"/g, '&quot;')})">Edit</button></td></tr>`;
        });
        html += '</tbody></table>';
        wrap.innerHTML = html;
    } catch (e) {}
}

window.editContestant = (c) => {
    document.getElementById('modal-title').textContent = 'Edit Contestant';
    document.getElementById('contestant-id').value = c.id;
    document.getElementById('c-name').value = c.name || '';
    document.getElementById('c-stage').value = c.stage_name || '';
    document.getElementById('c-category').value = c.category || '';
    document.getElementById('c-bio').value = c.bio || '';
    document.getElementById('c-photo').value = c.photo_url || '';
    document.getElementById('c-order').value = c.order_index || 0;
    modal.classList.add('active');
};

// Voting Control
document.getElementById('btn-start').addEventListener('click', () => controlEvent('start'));
document.getElementById('btn-begin-voting').addEventListener('click', () => controlEvent('begin_voting'));
document.getElementById('btn-runway-ended').addEventListener('click', () => controlEvent('runway_ended'));
document.getElementById('btn-declare-winner').addEventListener('click', () => { if(confirm('Declare winner based on highest points?')) controlEvent('declare_winner'); });
document.getElementById('btn-reset').addEventListener('click', () => { if(confirm('Reset all votes? This cannot be undone.')) controlEvent('reset'); });

async function controlEvent(action) {
    try {
        await fetch(`${API_BASE}/api/admin/event/control`, {method: 'POST', headers: authHeaders(), body: JSON.stringify({action})});
        loadDashboard();
    } catch (e) {}
}

async function loadAdminVoteList() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/stats`, {headers: authHeaders()});
        const data = await res.json();
        const list = document.getElementById('admin-vote-list');
        list.innerHTML = '';
        data.contestants.forEach(c => {
            const item = document.createElement('div');
            item.className = 'admin-vote-item';
            item.innerHTML = `<div><div style="font-weight:500">${c.name}</div><div style="font-size:12px;color:var(--text-dim)">Admin votes: ${c.admin_votes_count} | Total: ${c.points_total} pts</div></div><button class="btn-vote" onclick="adminVote(${c.id})">+3 POINTS</button>`;
            list.appendChild(item);
        });
    } catch (e) {}
}

window.adminVote = async (id) => {
    try {
        await fetch(`${API_BASE}/api/admin/vote`, {method: 'POST', headers: authHeaders(), body: JSON.stringify({contestant_id: id})});
        loadAdminVoteList();
        loadDashboard();
    } catch (e) {}
};

// Logs
async function loadLogs() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/logs?limit=50`, {headers: authHeaders()});
        const logs = await res.json();
        const wrap = document.getElementById('logs-table');
        let html = '<table><thead><tr><th>Time</th><th>Type</th><th>Message</th></tr></thead><tbody>';
        logs.forEach(l => {
            html += `<tr><td>${l.created_at ? l.created_at.replace('T',' ').substring(0,19) : '-'}</td><td>${l.log_type}</td><td>${l.message}</td></tr>`;
        });
        html += '</tbody></table>';
        wrap.innerHTML = html;
        
        const vres = await fetch(`${API_BASE}/api/admin/voters`, {headers: authHeaders()});
        const voters = await vres.json();
        const vwrap = document.getElementById('voters-table');
        let vhtml = '<table><thead><tr><th>Name</th><th>Email</th><th>Telephone</th><th>Voted</th><th>Registered</th></tr></thead><tbody>';
        voters.forEach(v => {
            vhtml += `<tr><td>${v.name}</td><td>${v.email}</td><td>${v.telephone}</td><td>${v.has_voted ? '✓' : '-'}</td><td>${v.registered_at ? v.registered_at.replace('T',' ').substring(0,16) : '-'}</td></tr>`;
        });
        vhtml += '</tbody></table>';
        vwrap.innerHTML = vhtml;
    } catch (e) {}
}

document.getElementById('refresh-logs').addEventListener('click', loadLogs);

// QR
async function loadQR() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/qr`);
        const data = await res.json();
        document.getElementById('qr-container').innerHTML = `<img src="${data.qr_code}" alt="QR Code">`;
        document.getElementById('qr-url').textContent = data.url;
    } catch (e) {}
}
document.getElementById('refresh-qr').addEventListener('click', loadQR);

// Init
if (token) {
    loginSection.style.display = 'none';
    loadDashboard();
    loadContestants();
    setInterval(loadDashboard, 3000);
} else {
    loginSection.style.display = 'flex';
}
