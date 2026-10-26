const API_BASE = window.location.origin;
const board = document.getElementById('board');
const sbState = document.getElementById('sb-state');
const cd = document.getElementById('cd');
const cdNum = document.getElementById('cd-num');
const cdLab = document.getElementById('cd-lab');
const win = document.getElementById('win');
const winPhoto = document.getElementById('win-photo');
const winName = document.getElementById('win-name');
const winStage = document.getElementById('win-stage');
const winPts = document.getElementById('win-pts');
const winVoters = document.getElementById('win-voters');
const winPct = document.getElementById('win-pct');

let last = '';

async function load() {
    try {
        const res = await fetch(`${API_BASE}/api/scoreboard`, { cache: 'no-store' });
        const data = await res.json();
        const st = data.state.status;
        if (st !== last) {
            last = st;
            if (st === 'voting') sbState.textContent = 'VOTING OPEN';
            else if (st === 'starting') sbState.textContent = 'STARTING';
            else if (st === 'runway_ended') sbState.textContent = 'RUNWAY ENDED';
            else if (st === 'ended') sbState.textContent = 'CONCLUDED';
            else sbState.textContent = 'AWAITING';
        }

        if (data.state.countdown_active && data.state.countdown_value > 0) {
            cd.classList.add('active');
            cdNum.textContent = data.state.countdown_value;
            cdLab.textContent = st === 'runway_ended' ? 'DECLARING WINNER' : 'SESSION STARTING';
        } else {
            cd.classList.remove('active');
        }

        if (data.state.winner_declared && data.winner) {
            win.classList.add('active');
            winPhoto.src = data.winner.photo_url || 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=800&auto=format&fit=crop';
            winName.textContent = data.winner.name;
            winStage.textContent = data.winner.stage_name || '';
            winPts.textContent = Math.round(data.winner.points_total);
            winVoters.textContent = data.stats.total_voters;
            const p = data.stats.total_voters > 0 ? Math.round((data.winner.points_total / (data.stats.total_voters * 3)) * 100) : 0;
            winPct.textContent = p + '%';
        } else {
            win.classList.remove('active');
        }

        board.innerHTML = '';
        data.contestants.forEach((c, idx) => {
            const row = document.createElement('article');
            row.className = `lb ${idx === 0 && data.contestants.length ? 'first' : ''}`;
            row.innerHTML = `
                <div class="lb-rank">${idx + 1}</div>
                <img class="lb-photo" src="${c.photo_url || 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=400&auto=format&fit=crop'}" onerror="this.src='https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=400&auto=format&fit=crop'">
                <div class="lb-info">
                    <div class="lb-name">${c.name}</div>
                    <div class="lb-meta">${c.stage_name || c.category || 'Fashion Model'} • Audience ${c.votes_count} • Judges ${c.admin_votes_count}</div>
                </div>
                <div class="lb-an">${c.percentage}% Analysis</div>
                <div class="lb-pts">${Math.round(c.points_total)}</div>
            `;
            board.appendChild(row);
        });
    } catch (e) {}
}

load();
setInterval(load, 2000);
