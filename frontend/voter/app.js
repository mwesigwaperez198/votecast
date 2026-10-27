const API_BASE = window.location.origin;

const registerSection = document.getElementById('register-section');
const voteSection = document.getElementById('vote-section');
const closedSection = document.getElementById('closed-section');
const registerForm = document.getElementById('register-form');
const ballotGrid = document.getElementById('ballot-grid');
const gallery = document.getElementById('gallery');
const voterChip = document.getElementById('voter-chip');
const doneState = document.getElementById('done-state');
const closedText = document.getElementById('closed-text');
const countdownDisplay = document.getElementById('countdown-display');

let sessionToken = localStorage.getItem('votecast_token');
let voterInfo = JSON.parse(localStorage.getItem('votecast_voter') || 'null');
let countdownInterval = null;

async function fetchState() {
    try {
        const res = await fetch(`${API_BASE}/api/vote/state`, { cache: 'no-store' });
        return await res.json();
    } catch (e) {
        return { status: 'idle' };
    }
}

function show(view) {
    document.querySelectorAll('.view').forEach((el) => el.classList.remove('active'));
    view.classList.add('active');
}

function showWelcomeOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'welcome-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:radial-gradient(circle at top,#0f7c3e,#000);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;text-align:center';
    overlay.innerHTML = '<div style="max-width:920px;animation:fadeInUp 1.6s ease"><div style="letter-spacing:12px;text-transform:uppercase;opacity:0.9;margin-bottom:16px">DA-VELA-HOUSE OF ARTS PRESENTS</div><div style="font-family:Cormorant,serif;font-size:clamp(26px,7vw,66px);text-transform:uppercase;line-height:1.06">THE ONE BIG CULTURAL SHOW CASING THIS YEAR 2026</div><div style="margin-top:18px;letter-spacing:10px;text-transform:uppercase">BE READY TO ENTERTAIN NATURAL BEAUTY</div></div><style>@keyframes fadeInUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}</style>';
    document.body.appendChild(overlay);
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 4200);
}

async function loadGallery() {
    if (!gallery) return;
    try {
        const res = await fetch(`${API_BASE}/api/gallery`, { cache: 'no-store' });
        const data = await res.json();
        const items = data.gallery || [];

        if (!items.length) {
            gallery.innerHTML = '';
            return;
        }

        gallery.innerHTML = '<div style="grid-column:1/-1;text-align:center;opacity:0.8;margin:4px 0">See more</div>' + items.slice(0, 12).map((item) => `
            <article class="gallery-item">
                <img src="${item.image_url || 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=1200&auto=format&fit=crop'}" alt="${item.name || 'Gallery image'}" onerror="this.src='https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=1200&auto=format&fit=crop'">
                <div class="gallery-meta">
                    <strong>${item.name || 'DA_VELA Model'}</strong>
                    <span>${item.stage_name || item.category || 'Fashion Model'}</span>
                </div>
            </article>
        `).join('');
    } catch (e) {
        console.error('Gallery load failed', e);
    }
}

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const telephone = document.getElementById('reg-phone').value.trim();
    if (!name || !email || !telephone) return;

    const btn = registerForm.querySelector('.cta');
    btn.disabled = true;
    btn.innerHTML = '<span>Entering...</span>';

    try {
        const res = await fetch(`${API_BASE}/api/vote/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, telephone })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Registration failed');
        sessionToken = data.session_token;
        voterInfo = data.voter;
        localStorage.setItem('votecast_token', sessionToken);
        localStorage.setItem('votecast_voter', JSON.stringify(voterInfo));
        await route();
    } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.innerHTML = '<span>Enter Voting Room</span><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3.75 9H14.25M9.75 4.5L14.25 9L9.75 13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
});

async function loadBallot() {
    ballotGrid.innerHTML = '';
    doneState.style.display = 'none';
    try {
        const res = await fetch(`${API_BASE}/api/vote/contestants`, { cache: 'no-store' });
        const contestants = await res.json();
        if (voterInfo && voterInfo.has_voted) {
            doneState.style.display = 'flex';
            return;
        }
        contestants.forEach((c) => {
            const card = document.createElement('article');
            card.className = 'model-card';
            card.innerHTML = `
                <div class="model-media">
                    <img src="${c.photo_url || 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=1200&auto=format&fit=crop'}" alt="${c.name}" onerror="this.src='https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?q=80&w=1200&auto=format&fit=crop'">
                </div>
                <div class="model-body">
                    <div>
                        <div class="model-name">${c.name}</div>
                        <div class="model-sub">${c.stage_name || c.category || 'Fashion Model'}</div>
                    </div>
                    <div class="model-vote">Vote</div>
                </div>
            `;
            card.addEventListener('click', () => castVote(c.id));
            ballotGrid.appendChild(card);
        });
    } catch (e) {
        console.error(e);
    }
}

async function castVote(contestantId) {
    if (!sessionToken) {
        show(registerSection);
        return;
    }
    if (!confirm('Confirm your vote for this model?')) return;
    try {
        const res = await fetch(`${API_BASE}/api/vote/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contestant_id: contestantId, session_token: sessionToken })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Vote failed');
        voterInfo.has_voted = true;
        localStorage.setItem('votecast_voter', JSON.stringify(voterInfo));
        ballotGrid.innerHTML = '';
        doneState.style.display = 'flex';
    } catch (err) {
        alert(err.message);
    }
}

let welcomeShown = false;
async function route() {
    const state = await fetchState();
    if (state.status === 'voting') {
        if (countdownDisplay) {
            countdownDisplay.style.display = 'none';
        }
        if (sessionToken && voterInfo) {
            if (voterChip) voterChip.textContent = voterInfo.name.toUpperCase();
            show(voteSection);
            loadBallot();
            loadGallery();
        } else {
            show(registerSection);
        }
        return;
    }
    if (state.status === 'starting') {
        if (!document.querySelector('.welcome-overlay')) {
            try { showWelcomeOverlay(); } catch(e){}
        }
        welcomeShown = true;
        if (countdownDisplay) {
            countdownDisplay.textContent = `${state.countdown_value}`;
            countdownDisplay.style.display = 'block';
        }
        if (closedText) {
            if (state.countdown_value <= 1) closedText.textContent = 'HERE WE GO';
            else closedText.textContent = 'Session starting — please hold';
        }
        show(closedSection);
        return;
    }
    if (state.status === 'runway_ended') {
        if (countdownDisplay) {
            countdownDisplay.textContent = `Countdown: ${state.countdown_value}s`;
            countdownDisplay.style.display = 'block';
        }
        closedText.textContent = 'Runway has ended — thank you for your participation';
        show(closedSection);
        return;
    }
    if (countdownDisplay) {
        countdownDisplay.style.display = 'none';
    }
    welcomeShown = false;
    closedText.textContent = 'The runway session will begin shortly';
    show(closedSection);
}

route();
setInterval(route, 2000);