const API_BASE = window.location.origin;
const PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b3d23"/><stop offset="1" stop-color="#050805"/></linearGradient></defs>' +
    '<rect width="600" height="800" fill="url(#g)"/>' +
    '<text x="300" y="410" font-family="Georgia,serif" font-size="84" fill="#b9a06c" text-anchor="middle" letter-spacing="14">DV</text>' +
    '</svg>'
);

const board = document.getElementById('board');
const cd = document.getElementById('cd');
const cdNum = document.getElementById('cd-num');
const cdLab = document.getElementById('cd-lab');
const cdMessage = document.getElementById('cd-message');
const win = document.getElementById('win');
const winPhoto = document.getElementById('win-photo');
const winName = document.getElementById('win-name');
const winStage = document.getElementById('win-stage');
const winPts = document.getElementById('win-pts');
const winVoters = document.getElementById('win-voters');
const winPct = document.getElementById('win-pct');
const stateBadge = document.getElementById('sb-state');

const DEFAULT_MESSAGE = cdMessage ? cdMessage.innerHTML : '';
let lastBoardSig = '';
let lastWinSig = '';
let lastStatus = '';

function imageOrPlaceholder(url) {
    return url && String(url).trim() ? url : PLACEHOLDER;
}

function attachFallback(img) {
    img.addEventListener('error', () => {
        if (img.dataset.fallback === '1') return;
        img.dataset.fallback = '1';
        img.src = PLACEHOLDER;
    });
}

function setCountdown(active, value, status) {
    if (!cd) return;
    if (!active) {
        cd.classList.remove('active');
        return;
    }
    cd.classList.add('active');
    cdNum.textContent = String(value);
    const declaring = status === 'runway_ended';
    cdLab.textContent = declaring ? 'DECLARING WINNER' : 'GET READY';
    if (declaring) {
        cdMessage.innerHTML = '<span class="cd-kicker">DA-VELA HOUSE OF ART</span>' +
            '<span class="cd-headline">THE WINNER IS ABOUT TO BE DECLARED</span>' +
            '<span class="cd-tagline">STAY WITH US</span>';
    } else if (cdMessage.innerHTML !== DEFAULT_MESSAGE) {
        cdMessage.innerHTML = DEFAULT_MESSAGE;
    }
}

function renderBoard(contestants) {
    const sig = JSON.stringify(contestants.map((c) => [c.id, c.points_total, c.votes_count, c.percentage, c.photo_url]));
    if (sig === lastBoardSig) return;
    lastBoardSig = sig;

    board.innerHTML = '';
    if (!contestants.length) {
        board.innerHTML = '<div class="empty">The runway lineup will appear here</div>';
        return;
    }

    const max = Math.max(...contestants.map((c) => c.points_total), 1);
    const leader = contestants[0];

    contestants.forEach((c, idx) => {
        const row = document.createElement('article');
        row.className = 'row' + (idx === 0 ? ' lead' : '');
        row.innerHTML = `
            <div class="rank"></div>
            <div class="ph"><img loading="lazy" decoding="async" alt=""></div>
            <div class="info">
                <div class="name"></div>
                <div class="stage"></div>
                <div class="bar"><span></span></div>
            </div>
            <div class="metrics">
                <div class="pts"></div>
                <div class="sub"></div>
            </div>
        `;
        row.querySelector('.rank').textContent = String(idx + 1).padStart(2, '0');
        const img = row.querySelector('img');
        img.src = imageOrPlaceholder(c.photo_url);
        img.alt = c.name || 'Model';
        attachFallback(img);
        row.querySelector('.name').textContent = c.name || 'Model';
        row.querySelector('.stage').textContent = c.stage_name || c.category || 'Fashion Model';
        row.querySelector('.bar span').style.width = Math.max(4, (c.points_total / max) * 100) + '%';
        row.querySelector('.pts').textContent = `${c.points_total} pts`;
        row.querySelector('.sub').textContent = `${c.percentage}% · ${c.votes_count} audience votes`;
        board.appendChild(row);
    });

    if (leader && leader.points_total > 0) {
        board.firstElementChild.classList.add('crown');
    }
}

function renderWinner(winner, stats) {
    if (!winner) {
        win.classList.remove('active');
        lastWinSig = '';
        return;
    }
    const sig = [winner.id, winner.points_total, winner.votes_count, winner.percentage, stats.total_voters].join('|');
    if (sig === lastWinSig) {
        win.classList.add('active');
        return;
    }
    lastWinSig = sig;
    winPhoto.src = imageOrPlaceholder(winner.photo_url);
    winPhoto.alt = winner.name || 'Winner';
    winName.textContent = winner.name || 'Winner';
    winStage.textContent = winner.stage_name || 'DA-VELA HOUSE OF ART';
    winPts.textContent = String(winner.points_total || 0);
    winVoters.textContent = String(winner.votes_count || 0);
    winPct.textContent = `${winner.percentage || 0}%`;
    win.classList.add('active');
}

async function poll() {
    try {
        const res = await fetch(`${API_BASE}/api/scoreboard`, { cache: 'no-store' });
        if (!res.ok) throw new Error('scoreboard');
        const data = await res.json();
        const state = data.state || {};
        const status = state.status || 'idle';
        const countdown = state.countdown_active && state.countdown_value > 0;

        stateBadge.textContent = status === 'voting' ? 'VOTING LIVE'
            : status === 'starting' ? 'STARTING'
            : status === 'runway_ended' ? 'DECLARING'
            : status === 'ended' ? 'CLOSED'
            : 'AWAITING';

        if (state.winner_declared && data.winner) {
            setCountdown(false);
            win.classList.remove('active');
            renderWinner(data.winner, data.stats || {});
            board.style.display = 'none';
        } else {
            win.classList.remove('active');
            board.style.display = '';
            renderWinner(null, {});
            setCountdown(countdown, state.countdown_value, status);
            renderBoard(data.contestants || []);
        }

        lastStatus = status;
    } catch (e) {
        if (lastStatus !== 'offline') {
            stateBadge.textContent = 'RECONNECTING';
        }
        lastStatus = 'offline';
    }
}

poll();
setInterval(poll, 1000);
