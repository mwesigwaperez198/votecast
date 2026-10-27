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

        if (data.state.countdown_active && data.state.countdown_value >= 0) {
            cd.classList.add('active');
            cdNum.textContent = data.state.countdown_value;
            cdLab.textContent = st === 'runway_ended' ? 'DECLARING WINNER' : 'SESSION STARTING';
        } else {
            cd.classList.remove('active');
        }

        if (data.state.winner_declared && data.winner) {
            win.classList.add('active');
            const wgal = data.winner.gallery && data.winner.gallery.length ? data.winner.gallery : (data.winner.photo_url ? [data.winner.photo_url] : []);
            winPhoto.src = wgal[0] || 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=800&auto=format&fit=crop';
            winPhoto.dataset.gallery = JSON.stringify(wgal).replace(/'/g, "&apos;");
            winPhoto.onclick = function(){ showModelGallery(this); };
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
            const gallery = c.gallery && c.gallery.length ? c.gallery : (c.photo_url ? [c.photo_url] : []);
            const firstImg = gallery[0] || 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=400&auto=format&fit=crop';
            row.innerHTML = `
                <div class="lb-rank">${idx + 1}</div>
                <img class="lb-photo" src="${firstImg}" data-gallery='${JSON.stringify(gallery).replace(/'/g, "&apos;")}' onclick="showModelGallery(this)" onerror="this.src='https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=400&auto=format&fit=crop'">
                <div class="lb-info">
                    <div class="lb-name">${c.name}</div>
                    <div class="lb-meta">${c.stage_name || c.category || 'Fashion Model'} • Audience ${Math.round(c.points_total)}</div>
                </div>
                <div class="lb-an">${c.percentage}% Analysis</div>
                <div class="lb-pts">${Math.round(c.points_total)}</div>
            `;
            board.appendChild(row);
        });
    } catch (e) {}
}

window.showModelGallery = function(imgEl) {
    try {
        const gallery = JSON.parse(imgEl.dataset.gallery || '[]');
        if (!gallery.length) return;
        let html = '<div id="mg-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px"><div style="max-width:900px;width:100%;text-align:center"><button onclick="document.getElementById(\'mg-modal\').remove()" style="margin-bottom:12px;background:none;border:1px solid rgba(255,255,255,0.4);color:#fff;padding:8px 14px;border-radius:999px;cursor:pointer">Close</button><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">';
        gallery.forEach(g => {
            html += `<img src="${g}" style="max-width:280px;max-height:70vh;border-radius:12px;object-fit:cover" onerror="this.style.display='none'">`;
        });
        html += '</div></div></div>';
        document.body.insertAdjacentHTML('beforeend', html);
    } catch(e) {}
};

load();
setInterval(load, 1500);
