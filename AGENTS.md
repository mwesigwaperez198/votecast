# AGENTS.md — VoteCast (DA-VELA HOUSE OF ART) | Novara Technologies Limited

## Developer Bio
- **Name:** Mwesigwa Perez
- **Role:** Lead Developer
- **Team:** Youth developers, Uganda
- **Organization:** Novara System Software LTD
- **Slogan:** "Shaping a new era of tech in Uganda"
- **Email:** mwesigwagershom7@gmail.com
- **Phone:** 0765866555
- **Website:** https://novara-tech-africa.kesug.com
- **GitHub Account:** mwesigwaperez198 (PAT auth)
- **Repo:** https://github.com/mwesigwaperez198/votecast.git

## Project Overview
**Web-App Live Audience Voting & Scoreboard** for DA-VELA HOUSE OF ART Fashion Models Event.
- Audience uses their own phones (app-less via QR) to vote
- Admin/CMS controls everything (contestants/profiles, start session countdown, end/runway ended, declare winner)
- Judges/admin in CMS can vote too (each vote = 3 points, unlimited)
- Live scoreboard shown on projector/secondary screens
- QR codes link to voter registration page (name/email/telephone)
- All activity logged in CMS under "Logs"

## Brand / Colors
- Deep Green: `#0b3d23` / `#0f7c3e`
- Bagandi Red: `#d62828` / `#e63946`
- Black: `#000000` / `#101010`

## Routes / Structure
- `/` or `/voter` - Voter registration + voting interface (what users see after scanning QR)
- `/cms` or `/admin` - CMS dashboard to control event
- `/dashboard` or `/scoreboard` - Live scoreboard for projector/screen
- QR code generated from CMS links to voter registration URL

## Core Features
### CMS (Admin Control)
- Contestant/Model profiles (photos, names, category, bio) - add/edit/delete
- Organizers, supporters management
- Session control: "Start Session" triggers countdown 10→0, then voting opens
- "Runway Ended" triggers countdown 10→0, then displays big screen winner image with vote count + analysis (% of total present voters/logs)
- Admin/Judge voting: can vote from CMS, each vote = 3 points, no limit on votes per admin
- QR code generation for voter access
- Logs: capture all voter registrations (email, name, telephone)
- Real-time monitoring

### Voter Flow
1. Scan QR → lands on voter site
2. Register with name, email, telephone (captured in CMS logs)
3. After registration, can vote for contestants
4. Votes go to backend and update live scoreboard

### Scoreboard
- Live leaderboard updating in real-time
- On "Runway Ended" + countdown 10→0 → show winner with big image, vote count, analysis (% of total present = unique registered voters from logs or active voters)

## Technical Stack
- **Backend:** FastAPI (Python), high concurrency, append-only vote ledger
- **Database:** SQLite in WAL mode for dev, PostgreSQL on Render for prod (we'll create URL)
- **Frontend:** Vanilla JS/HTML/CSS or Vite + vanilla - keep human-feeling UI, not AI-looking
- **Real-time:** WebSocket for live updates
- **Security:** IP restrictions optional, token/cookie session locking, anti-cheat, append-only schema

## Security / Integrity
- Append-only vote records (write-ahead style)
- Prevent duplicate abuse where possible
- Session locking
- Admin voting clearly tracked (different weight: 3 points)
- All registrations logged

## Deployment
- Connect to Render (we'll set env vars)
- Need to provide env vars for Render
- Use PostgreSQL URL from Render

## Rules
- Brand as NOVARA
- Code must look human-developed, not AI-generated
- Clean, performant for 1000+ concurrent users
- Follow same patterns as instructed
- Don't push AGENTS.md to git
- Use the provided PAT when pushing to votecast repo

## Development Workflow
Plan → Code → Debug → Produce (with best UI/UX)

