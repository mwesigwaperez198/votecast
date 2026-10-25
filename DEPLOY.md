# VoteCast Deployment Guide

## For Render

### Backend (Web Service)
1. Create new Web Service from GitHub repo: `mwesigwaperez198/votecast.git`
2. Root Directory: `backend`
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Environment Variables:
   - `DATABASE_URL` - Create PostgreSQL database on Render, link it
   - `SECRET_KEY` - Generate a strong random key
   - `ADMIN_USERNAME` - Your admin username
   - `ADMIN_PASSWORD` - Your admin password
   - `CORS_ORIGINS` - `*` or your domain
   - `EVENT_NAME` - `DA_VELA Fashions`
   - `ENVIRONMENT` - `production`

### Frontend
The backend serves static files from /voter, /cms, /scoreboard. You can also deploy separately on Vercel/Netlify pointing to API.

### Routes
- `/` or `/voter` - Voter registration & voting
- `/cms` - Admin CMS
- `/scoreboard` or `/dashboard` - Live scoreboard
- `/api/health` - Health check

### First Time Setup
1. Go to `/cms`, login with admin credentials
2. Add contestants/models in Contestants tab
3. Generate QR code in QR tab
4. Start session from Voting Control

### Admin Voting
In CMS > Voting Control, each admin vote gives 3 points and has no limit.
