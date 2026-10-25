const API_BASE = window.location.origin;

const leaderboard = document.getElementById('leaderboard');
const sbStatus = document.getElementById('sb-status');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNumber = document.getElementById('countdown-number');
const countdownLabel = document.getElementById('countdown-label');
const winnerOverlay = document.getElementById('winner-overlay');
const winnerPhoto = document.getElementById('winner-photo');
const winnerName = document.getElementById('winner-name');
const winnerStage = document.getElementById('winner-stage');
const winnerPoints = document.getElementById('winner-points');
const winnerTotalVoters = document.getElementById('winner-total-voters');
const winnerPct = document.getElementById('winner-pct');

let lastStatus = '';
let countdownInterval = null;
let currentCountdown = 0;

async function fetchData() {
    try {
        const res = await fetch(`${API_BASE}/api/scoreboard`);
        const data = await res.json();
        
        // Status
        const status = data.state.status;
        if (status !== lastStatus) {
            lastStatus = status;
            if (status === 'voting') sbStatus.textContent = 'VOTING OPEN';
            else if (status === 'starting') sbStatus.textContent = 'STARTING';
            else if (status === 'runway_ended') sbStatus.textContent = 'RUNWAY ENDED';
            else if (status === 'ended') sbStatus.textContent = 'ENDED';
            else sbStatus.textContent = 'WAITING';
        }
        
        // Countdown
        if (data.state.countdown_active && data.state.countdown_value > 0) {
            if (!countdownOverlay.classList.contains('active') || currentCountdown !== data.state.countdown_value) {
                currentCountdown = data.state.countdown_value;
                countdownOverlay.classList.add('active');
                if (status === 'starting') {
                    countdownLabel.textContent = 'SESSION STARTING';
                } else if (status === 'runway_ended') {
                    countdownLabel.textContent = 'DECLARING WINNER';
                } else {
                    countdownLabel.textContent = 'GET READY';
                }
                countdownNumber.textContent = data.state.countdown_value;
            }
        } else {
            countdownOverlay.classList.remove('active');
        }
        
        // Winner
        if (data.state.winner_declared && data.winner) {
            if (!winnerOverlay.classList.contains('active')) {
                winnerOverlay.classList.add('active');
                winnerPhoto.src = data.winner.photo_url || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop';
                winnerName.textContent = data.winner.name;
                winnerStage.textContent = data.winner.stage_name || '';
                winnerPoints.textContent = data.winner.points_total;
                winnerTotalVoters.textContent = data.stats.total_voters;
                const pct = data.stats.total_voters > 0 ? Math.round((data.winner.points_total / (data.stats.total_voters * 3)) * 100) : 0;
                winnerPct.textContent = pct + '%';
            }
        } else {
            winnerOverlay.classList.remove('active');
        }
        
        // Leaderboard
        leaderboard.innerHTML = '';
        data.contestants.forEach((c, idx) => {
            const item = document.createElement('div');
            item.className = `lb-item ${idx === 0 && data.contestants.length > 0 ? 'first' : ''}`;
            item.innerHTML = `
                <div class="lb-rank">${idx + 1}</div>
                <img src="${c.photo_url || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop'}" alt="${c.name}" class="lb-photo" onerror="this.src='https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop'">
                <div class="lb-info">
                    <div class="lb-name">${c.name}</div>
                    <div class="lb-stage">${c.stage_name || c.category || ''} • Audience ${c.votes_count} • Admin ${c.admin_votes_count}</div>
                </div>
                <div class="lb-votes">
                    <div class="lb-votes-count">${c.percentage}% Analysis</div>
                </div>
                <div class="lb-points">${Math.round(c.points_total)}</div>
            `;
            leaderboard.appendChild(item);
        });
        
    } catch (e) {
        console.error(e);
    }
}

fetchData();
setInterval(fetchData, 2000);
