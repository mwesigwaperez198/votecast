from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.core.database import engine, Base, SessionLocal
from app.core import config, security
from app.models import models
from app.api import vote, admin
import os
import json
from typing import List

app = FastAPI(title="VoteCast API", description="DA_VELA Fashions Live Voting System by Novara", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables
Base.metadata.create_all(bind=engine)

# Initialize default admin and event state
def init_db():
    db = SessionLocal()
    try:
        # Create default admin
        admin = db.query(models.Admin).filter(models.Admin.username == config.settings.ADMIN_USERNAME).first()
        if not admin:
            admin = models.Admin(
                username=config.settings.ADMIN_USERNAME,
                password_hash=security.get_password_hash(config.settings.ADMIN_PASSWORD),
                role="admin"
            )
            db.add(admin)
            db.commit()
        # Create event state
        state = db.query(models.EventState).first()
        if not state:
            state = models.EventState(status="idle")
            db.add(state)
            db.commit()
    finally:
        db.close()

init_db()

# WebSocket connections for live updates
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
    
    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass

manager = ConnectionManager()

app.include_router(vote.router, prefix="/api/vote", tags=["Vote"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "VoteCast", "event": config.settings.EVENT_NAME}

@app.get("/api/scoreboard")
async def scoreboard(db: SessionLocal = None):
    from app.core.database import get_db
    db = next(get_db())
    try:
        contestants = db.query(models.Contestant).filter(models.Contestant.is_active == True).order_by(models.Contestant.points_total.desc(), models.Contestant.order_index).all()
        state = db.query(models.EventState).first()
        winner = None
        if state and state.winner_id:
            winner = db.query(models.Contestant).filter(models.Contestant.id == state.winner_id).first()
        total_voters = db.query(models.Voter).count()
        voted_count = db.query(models.Voter).filter(models.Voter.has_voted == True).count()
        
        result = []
        for c in contestants:
            pct = 0
            if total_voters > 0:
                pct = round((c.points_total / (total_voters * 4)) * 100, 1)  # rough analysis
            result.append({
                "id": c.id,
                "name": c.name,
                "stage_name": c.stage_name,
                "category": c.category,
                "photo_url": c.photo_url,
                "votes_count": c.votes_count,
                "admin_votes_count": c.admin_votes_count,
                "points_total": c.points_total,
                "percentage": pct
            })
        
        return {
            "contestants": result,
            "state": {
                "status": state.status if state else "idle",
                "countdown_active": state.countdown_active if state else False,
                "countdown_value": state.countdown_value if state else 0,
                "winner_declared": state.winner_declared if state else False
            },
            "winner": {"id": winner.id, "name": winner.name, "stage_name": winner.stage_name, "photo_url": winner.photo_url, "points_total": winner.points_total} if winner else None,
            "stats": {"total_voters": total_voters, "voted_count": voted_count}
        }
    finally:
        db.close()

# Serve static files for frontends
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")
if os.path.exists(frontend_dir):
    # Mount voter as root for QR convenience
    voter_dir = os.path.join(frontend_dir, "voter")
    cms_dir = os.path.join(frontend_dir, "cms")
    scoreboard_dir = os.path.join(frontend_dir, "scoreboard")
    
    if os.path.exists(voter_dir):
        app.mount("/voter", StaticFiles(directory=voter_dir, html=True), name="voter")
    if os.path.exists(cms_dir):
        app.mount("/cms", StaticFiles(directory=cms_dir, html=True), name="cms")
    if os.path.exists(scoreboard_dir):
        app.mount("/scoreboard", StaticFiles(directory=scoreboard_dir, html=True), name="scoreboard")
    if os.path.exists(scoreboard_dir):
        app.mount("/dashboard", StaticFiles(directory=scoreboard_dir, html=True), name="dashboard")

@app.get("/")
async def root():
    return FileResponse(os.path.join(frontend_dir, "voter", "index.html")) if os.path.exists(os.path.join(frontend_dir, "voter", "index.html")) else {"message": "VoteCast API - DA_VELA Fashions"}

@app.get("/health")
async def health_simple():
    return {"status": "healthy"}
