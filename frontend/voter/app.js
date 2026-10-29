const API_BASE = window.location.origin;
const PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b3d23"/><stop offset="1" stop-color="#050805"/></linearGradient></defs>' +
    '<rect width="600" height="800" fill="url(#g)"/>' +
    '<text x="300" y="410" font-family="Georgia,serif" font-size="84" fill="#b9a06c" text-anchor="middle" letter-spacing="14">DV</text>' +
    '</svg>'
);

const registerSection = document.getElementById('register-section');
const voteSection = document.getElementById('vote-section');
const closedSection = document.getElementById('closed-section');
const registerForm = document.getElementById('register-form');
const ballotGrid = document.getElementById('ballot-grid');
const gallery = document.getElementById('gallery');
const voterChip = document.getElementById('voter-chip');
const doneState = document.getElementById('done-state');
const closedTitle = document.getElementById('closed-title');
const closedText = document.getElementById('closed-text');
const countdownDisplay = document.getElementById('countdown-display');
const profileModal = document.getElementById('profile-modal');
const profileMedia = document.getElementById('profile-media');
const profileKicker = document.getElementById('profile-kicker');
const profileName = document.getElementById('profile-name');
const profileBio = document.getElementById('profile-bio');
const profileGallery = document.getElementById('profile-gallery');
const profileVote = document.getElementById('profile-vote');

let sessionToken = localStorage.getItem('votecast_token');
let voterInfo = JSON.parse(localStorage.getItem('votecast_voter') || 'null');
let contestantsCache = [];
let selectedContestant = null;
let lastStatus = null;
let votingLoaded = false;
let galleryLoaded = false;

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

async function fetchState() {
    try {
        const res = await fetch(`${API_BASE}/api/vote/state`, { cache: 'no-store' });
        if (!res.ok) throw new Error('state');
        return await res.json();
    } catch (e) {
        return { status: 'idle', countdown_active: false, countdown_value: 0 };
    }
}

function show(view) {
    document.querySelectorAll('.view').forEach((el) => el.classList.remove('active'));
    view.classList.add('active');
}

function setCountdown(value, label) {
    if (!countdownDisplay) return;
    if (value === null || value === undefined) {
        countdownDisplay.style.display = 'none';
        countdownDisplay.textContent = '';
        return;
    }
    countdownDisplay.style.display = 'block';
    countdownDisplay.textContent = String(value);
    countdownDisplay.dataset.label = label || '';
}

let galleryShuffleTimer = null;

function shuffleGallery() {
    if (!gallery) return;
    const items = Array.from(gallery.querySelectorAll('.gallery-item'));
    if (items.length <= 1) return;
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        gallery.appendChild(items[j]);
    }
}

function startGalleryShuffle() {
    if (galleryShuffleTimer) clearInterval(galleryShuffleTimer);
    galleryShuffleTimer = setInterval(shuffleGallery, 6500);
}

async function loadGallery(force) {
    if (!gallery) return;
    if (galleryLoaded && !force) return;
    galleryLoaded = true;
    try {
        const res = await fetch(`${API_BASE}/api/gallery`, { cache: 'no-store' });
        const data = await res.json();
        const items = data.gallery || [];
        if (!items.length) {
            gallery.innerHTML = '';
            return;
        }
        gallery.innerHTML = '';
        items.slice(0, 60).forEach((item) => {
            const card = document.createElement('article');
            card.className = 'gallery-item';
            card.innerHTML = `
                <img loading="lazy" decoding="async" alt="">
                <div class="gallery-meta"><strong></strong><span>See more</span></div>
            `;
            const img = card.querySelector('img');
            img.src = imageOrPlaceholder(item.image_url);
            img.alt = item.name || 'Gallery image';
            attachFallback(img);
            card.querySelector('strong').textContent = item.name || 'DA-VELA Model';
            card.addEventListener('click', () => {
                const model = contestantsCache.find((c) => c.id === item.contestant_id);
                openProfile(model || item);
            });
            gallery.appendChild(card);
        });
        shuffleGallery();
    } catch (e) {
        galleryLoaded = false;
    }
}

function openProfile(model) {
    if (!model) return;
    selectedContestant = model;
    const galleryItems = model.gallery && model.gallery.length
        ? model.gallery
        : (model.photo_url ? [model.photo_url] : []);
    const hero = galleryItems[0] || model.image_url || '';

    profileMedia.innerHTML = '<img loading="eager" decoding="async" alt="">';
    const heroImg = profileMedia.querySelector('img');
    heroImg.src = imageOrPlaceholder(hero);
    heroImg.alt = model.name || 'Model';
    attachFallback(heroImg);

    profileKicker.textContent = model.category || 'Fashion Model';
    profileName.textContent = model.name || 'DA-VELA Model';
    profileBio.textContent = model.bio || (model.stage_name ? `Stage name: ${model.stage_name}` : 'Step into the runway story.');

    profileGallery.innerHTML = '';
    galleryItems.slice(0, 8).forEach((src) => {
        const thumb = document.createElement('img');
        thumb.loading = 'lazy';
        thumb.decoding = 'async';
        thumb.src = imageOrPlaceholder(src);
        thumb.alt = model.name || 'Gallery';
        attachFallback(thumb);
        thumb.addEventListener('click', () => {
            heroImg.src = imageOrPlaceholder(src);
        });
        profileGallery.appendChild(thumb);
    });

    const canVote = !(voterInfo && voterInfo.has_voted);
    profileVote.style.display = canVote ? 'flex' : 'none';
    profileVote.dataset.contestantId = model.id || '';
    profileModal.classList.add('active');
    profileModal.setAttribute('aria-hidden', 'false');
}

function closeProfile() {
    profileModal.classList.remove('active');
    profileModal.setAttribute('aria-hidden', 'true');
}

document.querySelectorAll('[data-close-profile]').forEach((el) => {
    el.addEventListener('click', closeProfile);
});

profileVote.addEventListener('click', async () => {
    const id = Number(profileVote.dataset.contestantId);
    if (!id) return;
    closeProfile();
    await castVote(id);
});

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
        btn.innerHTML = '<span>Enter Voting Room</span>';
    }
});

async function loadBallot(force) {
    if (votingLoaded && !force) return;
    votingLoaded = true;
    try {
        const res = await fetch(`${API_BASE}/api/vote/contestants`, { cache: 'no-store' });
        contestantsCache = await res.json();
        if (voterInfo && voterInfo.has_voted) {
            ballotGrid.innerHTML = '';
            doneState.style.display = 'flex';
            return;
        }
        doneState.style.display = 'none';
        ballotGrid.innerHTML = '';
        contestantsCache.forEach((c) => {
            const card = document.createElement('article');
            card.className = 'model-card';
            card.innerHTML = `
                <div class="model-media"><img loading="lazy" decoding="async" alt=""></div>
                <div class="model-body">
                    <div>
                        <div class="model-name"></div>
                        <div class="model-sub"></div>
                    </div>
                    <div class="model-vote">Vote</div>
                </div>
            `;
            const img = card.querySelector('img');
            img.src = imageOrPlaceholder(c.photo_url);
            img.alt = c.name || 'Model';
            attachFallback(img);
            card.querySelector('.model-name').textContent = c.name || 'Model';
            card.querySelector('.model-sub').textContent = c.stage_name || c.category || 'Fashion Model';
            card.addEventListener('click', () => openProfile(c));
            ballotGrid.appendChild(card);
        });
    } catch (e) {
        votingLoaded = false;
    }
}

async function castVote(contestantId) {
    if (!sessionToken) {
        show(registerSection);
        return;
    }
    if (voterInfo && voterInfo.has_voted) {
        ballotGrid.innerHTML = '';
        doneState.style.display = 'flex';
        galleryLoaded = false;
        await loadGallery(true);
        shuffleGallery();
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
        voterInfo = { ...(voterInfo || {}), has_voted: true };
        localStorage.setItem('votecast_voter', JSON.stringify(voterInfo));
        ballotGrid.innerHTML = '';
        doneState.style.display = 'flex';
        votingLoaded = false;
        galleryLoaded = false;
        await loadGallery(true);
        shuffleGallery();
        startGalleryShuffle();
    } catch (err) {
        alert(err.message);
    }
}

async function syncVoter() {
    if (!sessionToken) return false;
    try {
        const res = await fetch(`${API_BASE}/api/vote/me?token=${encodeURIComponent(sessionToken)}`, { cache: 'no-store' });
        if (!res.ok) {
            sessionToken = null;
            voterInfo = null;
            localStorage.removeItem('votecast_token');
            localStorage.removeItem('votecast_voter');
            return false;
        }
        const me = await res.json();
        voterInfo = { ...(voterInfo || {}), ...me };
        localStorage.setItem('votecast_voter', JSON.stringify(voterInfo));
        return true;
    } catch (e) {
        return true;
    }
}

async function route() {
    const state = await fetchState();
    const status = state.status || 'idle';

    if (status === 'voting') {
        setCountdown(null);
        if (lastStatus !== 'voting') {
            votingLoaded = false;
            galleryLoaded = false;
        }
        if (sessionToken && voterInfo) {
            if (lastStatus !== 'voting') await syncVoter();
            if (!sessionToken || !voterInfo) {
                show(registerSection);
                lastStatus = status;
                return;
            }
            if (voterInfo.has_voted) {
                ballotGrid.innerHTML = '';
                doneState.style.display = 'flex';
                if (voterChip) voterChip.textContent = String(voterInfo.name || '').toUpperCase();
                show(voteSection);
                await loadGallery(true);
                shuffleGallery();
                startGalleryShuffle();
                lastStatus = status;
                return;
            }
            if (voterChip) voterChip.textContent = String(voterInfo.name || '').toUpperCase();
            show(voteSection);
            await loadBallot();
            await loadGallery();
            startGalleryShuffle();
        } else {
            show(registerSection);
        }
        lastStatus = status;
        return;
    }

    if (status === 'starting') {
        closedTitle.textContent = state.countdown_value <= 1 ? 'HERE WE GO' : 'SESSION STARTING';
        closedText.textContent = 'The runway is about to begin — please hold';
        setCountdown(state.countdown_value, 'GET READY');
        show(closedSection);
        lastStatus = status;
        return;
    }

    if (status === 'runway_ended') {
        closedTitle.textContent = 'RUNWAY ENDED';
        closedText.textContent = 'The winner is being declared — hold tight';
        setCountdown(state.countdown_value, 'DECLARING WINNER');
        show(closedSection);
        lastStatus = status;
        return;
    }

    if (status === 'ended') {
        closedTitle.textContent = 'THANK YOU';
        closedText.textContent = 'The runway show has ended. Thank you for being part of DA-VELA HOUSE OF ART';
        setCountdown(null);
        show(closedSection);
        lastStatus = status;
        return;
    }

    closedTitle.textContent = 'VOTING CLOSED';
    closedText.textContent = 'The runway session will begin shortly';
    setCountdown(null);
    show(closedSection);
    lastStatus = status;
}

route();
setInterval(route, 2000);
