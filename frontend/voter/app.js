const API_BASE = window.location.origin;

let sessionToken = localStorage.getItem('votecast_token');
let voterInfo = JSON.parse(localStorage.getItem('votecast_voter') || 'null');

const registerSection = document.getElementById('register-section');
const voteSection = document.getElementById('vote-section');
const closedSection = document.getElementById('closed-section');
const registerForm = document.getElementById('register-form');
const contestantsGrid = document.getElementById('contestants-grid');
const voterInfoEl = document.getElementById('voter-info');
const votedMessage = document.getElementById('voted-message');
const closedMessage = document.getElementById('closed-message');

async function checkState() {
    try {
        const res = await fetch(`${API_BASE}/api/vote/state`);
        const state = await res.json();
        if (state.status !== 'voting') {
            registerSection.classList.remove('active');
            voteSection.classList.remove('active');
            closedSection.classList.add('active');
            if (state.status === 'starting') {
                closedMessage.textContent = 'Session starting soon...';
            } else if (state.status === 'idle') {
                closedMessage.textContent = 'Please wait for the session to begin';
            } else if (state.status === 'runway_ended') {
                closedMessage.textContent = 'Runway has ended. Thank you for voting!';
            } else {
                closedMessage.textContent = 'Voting is currently closed';
            }
            return false;
        }
        return true;
    } catch (e) {
        return false;
    }
}

function showVoteSection() {
    registerSection.classList.remove('active');
    closedSection.classList.remove('active');
    voteSection.classList.add('active');
    if (voterInfo) {
        voterInfoEl.textContent = `Welcome, ${voterInfo.name}`;
    }
    loadContestants();
}

function showRegisterSection() {
    voteSection.classList.remove('active');
    closedSection.classList.remove('active');
    registerSection.classList.add('active');
}

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const telephone = document.getElementById('reg-phone').value.trim();
    
    try {
        const res = await fetch(`${API_BASE}/api/vote/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name, email, telephone})
        });
        const data = await res.json();
        if (res.ok) {
            sessionToken = data.session_token;
            voterInfo = data.voter;
            localStorage.setItem('votecast_token', sessionToken);
            localStorage.setItem('votecast_voter', JSON.stringify(voterInfo));
            const canVote = await checkState();
            if (canVote) {
                showVoteSection();
            } else {
                closedSection.classList.add('active');
                registerSection.classList.remove('active');
            }
        } else {
            alert(data.detail || 'Registration failed');
        }
    } catch (err) {
        alert('Connection error');
    }
});

async function loadContestants() {
    try {
        const res = await fetch(`${API_BASE}/api/vote/contestants`);
        const contestants = await res.json();
        contestantsGrid.innerHTML = '';
        
        if (voterInfo && voterInfo.has_voted) {
            contestantsGrid.style.display = 'none';
            votedMessage.style.display = 'block';
            return;
        }
        
        contestants.forEach(c => {
            const card = document.createElement('div');
            card.className = 'contestant-card';
            card.innerHTML = `
                <img src="${c.photo_url || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop'}" alt="${c.name}" class="contestant-photo" onerror="this.src='https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop'">
                <div class="contestant-info">
                    <div class="contestant-name">${c.name}</div>
                    <div class="contestant-stage">${c.stage_name || c.category || ''}</div>
                </div>
                <button class="contestant-vote">Vote</button>
            `;
            card.addEventListener('click', () => castVote(c.id));
            contestantsGrid.appendChild(card);
        });
    } catch (e) {
        console.error(e);
    }
}

async function castVote(contestantId) {
    if (!sessionToken) {
        alert('Please register first');
        showRegisterSection();
        return;
    }
    
    if (!confirm('Confirm your vote?')) return;
    
    try {
        const res = await fetch(`${API_BASE}/api/vote/vote`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({contestant_id: contestantId, session_token: sessionToken})
        });
        const data = await res.json();
        if (res.ok) {
            voterInfo.has_voted = true;
            localStorage.setItem('votecast_voter', JSON.stringify(voterInfo));
            contestantsGrid.style.display = 'none';
            votedMessage.style.display = 'block';
        } else {
            alert(data.detail || 'Vote failed');
        }
    } catch (err) {
        alert('Connection error');
    }
}

async function init() {
    const canVote = await checkState();
    if (canVote) {
        if (sessionToken && voterInfo) {
            showVoteSection();
        } else {
            showRegisterSection();
        }
    }
}

init();
setInterval(checkState, 5000);
