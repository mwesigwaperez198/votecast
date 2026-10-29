const API_BASE = window.location.origin;
const PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b3d23"/><stop offset="1" stop-color="#050805"/></linearGradient></defs>' +
    '<rect width="600" height="800" fill="url(#g)"/>' +
    '<text x="300" y="410" font-family="Georgia,serif" font-size="84" fill="#b9a06c" text-anchor="middle" letter-spacing="14">DV</text>' +
    '</svg>'
);

const board = document.getElementById('board');
const boardWrap = document.getElementById('board-wrap');
const boardMeta = document.getElementById('board-meta');
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
const overlay = document.getElementById('overlay');
const overlayBackdrop = document.getElementById('overlay-backdrop');
const overlayImage = document.getElementById('overlay-image');
const overlayKicker = document.getElementById('overlay-kicker');
const overlayTitle = document.getElementById('overlay-title');
const overlayBody = document.getElementById('overlay-body');

const DEFAULT_MESSAGE = cdMessage ? cdMessage.innerHTML : '';
let lastBoardSig = '';
let lastWinSig = '';
let lastStatus = '';
let lastDisplaySig = '';

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

function setCountdown(active, value, status, force) {
    if (!cd) return;
    if (!active) {
        cd.classList.remove('active');
        return;
    }
    cd.classList.add('active');
    cdNum.textContent = String(value || 0);
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

function renderBoard(contestants, stats) {
    const sig = JSON.stringify(contestants.map((c) => [c.id, c.points_total, c.votes_count, c.percentage, c.photo_url]));
    if (sig === lastBoardSig) return;
    lastBoardSig = sig;

    board.innerHTML = '';
    if (boardMeta) {
        const totalVotes = stats && stats.total_votes !== undefined ? stats.total_votes : (contestants.reduce((n,c)=>n + (c.votes_count||0),0));
        boardMeta.textContent = `${contestants.length} MODEL${contestants.length === 1 ? '' : 'S'} \u00B7 ${totalVotes} VOTES`;
    }
    if (!contestants.length) {
        board.innerHTML = '<div class="empty">Models will appear here once added from the Control Room</div>';
        return;
    }

    const max = Math.max(...contestants.map((c) => c.points_total), 1);
    const leader = contestants[0];

    contestants.forEach((c, idx) => {
        const row = document.createElement('article');
        row.className = 'row' + (idx === 0 ? ' crown' : '');
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
                <div class="pill"></div>
            </div>
        `;
        row.querySelector('.rank').textContent = String(idx + 1).padStart(2, '0');
        const img = row.querySelector('img');
        img.src = imageOrPlaceholder(c.photo_url);
        img.alt = c.name || 'Model';
        attachFallback(img);
        row.querySelector('.name').textContent = c.name || 'Model';
        row.querySelector('.stage').textContent = c.stage_name || c.category || 'Fashion Model';
        row.querySelector('.bar span').style.width = Math.max(6, (c.points_total / max) * 100) + '%';
        row.querySelector('.pts').textContent = `${c.points_total || 0} pts`;
        row.querySelector('.sub').textContent = `AUDIENCE ${c.votes_count || 0} \u00B7 ADMIN ${c.admin_votes_count || 0}`;
        row.querySelector('.pill').textContent = `${c.percentage || 0}%`;
        board.appendChild(row);
    });

    if (leader && leader.points_total > 0 && board.firstElementChild) {
        board.firstElementChild.classList.add('crown');
    }
}

function renderWinner(winner, stats) {
    if (!winner) {
        win.classList.remove('active');
        lastWinSig = '';
        if (boardWrap) boardWrap.style.display = '';
        return;
    }
    if (boardWrap) boardWrap.style.display = 'none';
    const sig = [winner.id, winner.points_total, winner.votes_count, winner.percentage].join('|');
    if (sig === lastWinSig) {
        win.classList.add('active');
        return;
    }
    lastWinSig = sig;
    winPhoto.src = imageOrPlaceholder(winner.photo_url);
    winPhoto.alt = winner.name || 'Winner';
    winName.textContent = winner.name || 'WINNER';
    winStage.textContent = winner.stage_name || 'DA-VELA HOUSE OF ART';
    winPts.textContent = String(winner.points_total || 0);
    winVoters.textContent = String(winner.votes_count || 0);
    winPct.textContent = `${winner.percentage || 0}%`;
    win.classList.add('active');
}

async function renderDisplay() {
    try {
        const res = await fetch(`${API_BASE}/api/scoreboard/display`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const sig = [data.mode, data.title, data.body, data.image_url, data.show_countdown].join('||');
        if (sig === lastDisplaySig) return;
        lastDisplaySig = sig;

        if (!data.mode || data.mode === 'leaderboard') {
            overlay.classList.remove('active');
            if (overlayImage) overlayImage.style.display = 'none';
            return;
        }

        overlayKicker.textContent = data.title || 'DA-VELA HOUSE OF ART';
        overlayTitle.textContent = data.title || (data.mode === 'welcome' ? 'WELCOME' : 'NOTICE');
        overlayBody.textContent = data.body || '';

        if (overlayBackdrop) overlayBackdrop.style.opacity = data.image_url ? '0.6' : '1';

        if (data.image_url) {
            overlayImage.src = data.image_url;
            overlayImage.style.display = 'block';
        } else {
            overlayImage.style.display = 'none';
        }

        overlay.classList.add('active');
        if (boardWrap) boardWrap.style.display = 'none';
        win.classList.remove('active');
        setCountdown(false);

        if (data.mode === 'welcome' && data.show_countdown) {
            // keep overlay visible; countdown will be handled by state
        }
    } catch (e) {}
}

async function poll() {
    try {
        const [scoreRes, dispRes] = await Promise.all([
            fetch(`${API_BASE}/api/scoreboard`, { cache: 'no-store' }),
            fetch(`${API_BASE}/api/scoreboard/display`, { cache: 'no-store' })
        ]);
        if (!scoreRes.ok) throw new Error('scoreboard');
        const data = await scoreRes.json();
        const display = dispRes.ok ? await dispRes.json() : { mode: 'leaderboard' };

        const state = data.state || {};
        const status = state.status || 'idle';
        const countdown = state.countdown_active && state.countdown_value > 0;

        stateBadge.textContent = status === 'voting' ? 'VOTING LIVE'
            : status === 'starting' ? 'STARTING'
            : status === 'runway_ended' ? 'DECLARING'
            : status === 'ended' ? 'CLOSED'
            : 'AWAITING';

        const customActive = display && display.mode && display.mode !== 'leaderboard';
        if (customActive) {
            await renderDisplay();
            setCountdown(display.show_countdown && countdown, state.countdown_value, status, true);
            return;
        }

        overlay.classList.remove('active');
        if (overlayImage) overlayImage.style.display = 'none';
        lastDisplaySig = '';

        if (state.winner_declared && data.winner) {
            setCountdown(false);
            win.classList.remove('active');
            renderWinner(data.winner, data.stats || {});
            if (boardWrap) boardWrap.style.display = 'none';
        } else {
            win.classList.remove('active');
            if (boardWrap) boardWrap.style.display = '';
            renderWinner(null, {});
            setCountdown(countdown, state.countdown_value, status, false);
            renderBoard(data.contestants || [], data.stats || {});
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
