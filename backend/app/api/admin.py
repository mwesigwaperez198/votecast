from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.models import models
from app.schemas import schemas
from app.core import security, config
from app.utils import helpers
from datetime import datetime
import json

router = APIRouter()

def verify_admin(request: Request, db: Session = Depends(get_db)):
    token = request.headers.get("Authorization")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if token.startswith("Bearer "):
        token = token.split(" ")[1]
    payload = security.decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden: admin access required")
    return payload

@router.post("/login")
async def admin_login(login_data: schemas.AdminLogin, db: Session = Depends(get_db)):
    admin = db.query(models.Admin).filter(models.Admin.username == login_data.username).first()
    if not admin or not security.verify_password(login_data.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = security.create_access_token(data={"sub": admin.username, "role": admin.role})
    return {"access_token": token, "token_type": "bearer", "role": admin.role}

@router.post("/contestants")
async def create_contestant(contestant: schemas.ContestantCreate, request: Request, db: Session = Depends(get_db), admin=Depends(verify_admin)):
    data = contestant.dict()
    gallery_imgs = data.pop('gallery_images', []) or []
    db_contestant = models.Contestant(**data)
    db.add(db_contestant)
    db.commit()
    db.refresh(db_contestant)
    
    for idx, img_url in enumerate(gallery_imgs):
        if img_url and str(img_url).strip():
            g = models.ModelGallery(contestant_id=db_contestant.id, image_url=str(img_url).strip(), order_index=idx)
            db.add(g)
    db.commit()
    
    log_entry = models.LogEntry(
        log_type="admin_action",
        message=f"Contestant added: {contestant.name}",
        data=json.dumps({"action": "create_contestant", "name": contestant.name})
    )
    db.add(log_entry)
    db.commit()
    return db_contestant


@router.get("/contestants")
async def list_contestants(db: Session = Depends(get_db), admin=Depends(verify_admin)):
    contestants = db.query(models.Contestant).order_by(models.Contestant.order_index).all()
    result = []
    for c in contestants:
        gallery = [{"id": g.id, "image_url": g.image_url, "order_index": g.order_index} for g in c.gallery]
        result.append({
            "id": c.id,
            "name": c.name,
            "stage_name": c.stage_name,
            "category": c.category,
            "bio": c.bio,
            "photo_url": c.photo_url,
            "gallery_images": json.loads(c.gallery_images) if c.gallery_images else [g["image_url"] for g in gallery],
            "gallery": gallery,
            "order_index": c.order_index,
            "is_active": c.is_active,
            "votes_count": c.votes_count,
            "admin_votes_count": c.admin_votes_count,
            "points_total": c.points_total,
            "created_at": c.created_at.isoformat() if c.created_at else None
        })
    return result


@router.put("/contestants/{contestant_id}")
async def update_contestant(contestant_id: int, contestant: schemas.ContestantCreate, request: Request, db: Session = Depends(get_db), admin=Depends(verify_admin)):
    db_contestant = db.query(models.Contestant).filter(models.Contestant.id == contestant_id).first()
    if not db_contestant:
        raise HTTPException(status_code=404, detail="Contestant not found")
    data = contestant.dict()
    gallery_imgs = data.pop('gallery_images', None)
    for key, value in data.items():
        setattr(db_contestant, key, value)
    if gallery_imgs is not None:
        db.query(models.ModelGallery).filter(models.ModelGallery.contestant_id == contestant_id).delete()
        for idx, img_url in enumerate(gallery_imgs):
            if img_url and str(img_url).strip():
                g = models.ModelGallery(contestant_id=db_contestant.id, image_url=str(img_url).strip(), order_index=idx)
                db.add(g)
        db_contestant.gallery_images = json.dumps([str(x).strip() for x in gallery_imgs if x and str(x).strip()])
    db.commit()
    db.refresh(db_contestant)
    return db_contestant


@router.delete("/contestants/{contestant_id}")
async def delete_contestant(contestant_id: int, request: Request, db: Session = Depends(get_db), admin=Depends(verify_admin)):
    db_contestant = db.query(models.Contestant).filter(models.Contestant.id == contestant_id).first()
    if not db_contestant:
        raise HTTPException(status_code=404, detail="Contestant not found")
    db.delete(db_contestant)
    db.commit()
    return {"message": "Deleted"}

@router.post("/vote")
async def admin_cast_vote(vote_req: schemas.AdminVoteRequest, request: Request, db: Session = Depends(get_db), admin=Depends(verify_admin)):
    contestant = db.query(models.Contestant).filter(models.Contestant.id == vote_req.contestant_id).first()
    if not contestant or not contestant.is_active:
        raise HTTPException(status_code=404, detail="Contestant not found")
    
    pts = config.settings.VOTE_POINTS_ADMIN
    for _ in range(pts):
        vote_hash = helpers.generate_vote_hash(0, contestant.id, "admin", f"{datetime.utcnow().isoformat()}-{_}")
        ledger_entry = models.VoteLedger(
            voter_id=None,
            contestant_id=contestant.id,
            voter_type="admin",
            points=1,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            vote_hash=vote_hash
        )
        db.add(ledger_entry)
    
    contestant.admin_votes_count += 1  # count as 1 admin action = represents 3 people
    contestant.points_total += pts
    
    db.commit()
    
    log_entry = models.LogEntry(
        log_type="vote",
        message=f"Admin vote cast ({pts} pts) for {contestant.name}",
        data=json.dumps({"contestant_id": contestant.id, "points": pts, "voter_type": "admin", "vote_count": contestant.admin_votes_count})
    )
    db.add(log_entry)
    db.commit()
    
    return {"message": f"Admin vote cast (+{pts} pts)", "contestant": contestant.name, "points": pts, "votes": contestant.admin_votes_count}

@router.post("/event/control")
async def control_event(control: schemas.EventControl, request: Request, db: Session = Depends(get_db), admin=Depends(verify_admin)):
    state = db.query(models.EventState).first()
    if not state:
        state = models.EventState()
        db.add(state)
    
    action = control.action
    
    if action == "start":
        state.status = "starting"
        state.countdown_active = True
        state.countdown_value = 10
        state.started_at = datetime.utcnow()
        log_entry = models.LogEntry(log_type="admin_action", message="Session started - countdown initiated", data=json.dumps({"action": "start"}))
        db.add(log_entry)
    elif action == "begin_voting":
        state.status = "voting"
        state.countdown_active = False
        state.countdown_value = 0
    elif action == "end":
        state.status = "ended"
        state.countdown_active = False
        state.ended_at = datetime.utcnow()
    elif action == "runway_ended":
        state.status = "runway_ended"
        state.countdown_active = True
        state.countdown_value = 10
        log_entry = models.LogEntry(log_type="admin_action", message="Runway ended - winner countdown initiated", data=json.dumps({"action": "runway_ended"}))
        db.add(log_entry)
    elif action == "declare_winner":
        winner = db.query(models.Contestant).filter(models.Contestant.is_active == True).order_by(models.Contestant.points_total.desc()).first()
        if winner:
            state.winner_id = winner.id
            state.winner_declared = True
            log_entry = models.LogEntry(log_type="admin_action", message=f"Winner declared: {winner.name}", data=json.dumps({"action": "declare_winner", "winner_id": winner.id, "winner_name": winner.name}))
            db.add(log_entry)
    elif action == "reset":
        state.status = "idle"
        state.countdown_active = False
        state.countdown_value = 0
        state.winner_declared = False
        state.winner_id = None
        db.query(models.Contestant).update({models.Contestant.votes_count: 0, models.Contestant.admin_votes_count: 0, models.Contestant.points_total: 0})
        db.query(models.Voter).update({models.Voter.has_voted: False, models.Voter.voted_at: None})
        db.query(models.VoteLedger).delete()
    
    db.commit()
    db.refresh(state)
    return {"message": f"Action {action} executed", "status": state.status}

@router.get("/stats")
async def get_stats(db: Session = Depends(get_db), admin=Depends(verify_admin)):
    total_voters = db.query(func.count(models.Voter.id)).scalar()
    voted_count = db.query(func.count(models.Voter.id)).filter(models.Voter.has_voted == True).scalar()
    total_votes = db.query(func.count(models.VoteLedger.id)).scalar()
    contestants = db.query(models.Contestant).filter(models.Contestant.is_active == True).all()
    state = db.query(models.EventState).first()
    
    return {
        "total_voters": total_voters,
        "voted_count": voted_count,
        "total_votes": total_votes,
        "audience_count": total_voters,
        "contestants": [{"id": c.id, "name": c.name, "votes_count": c.votes_count, "admin_votes_count": c.admin_votes_count, "points_total": c.points_total, "photo_url": c.photo_url, "stage_name": c.stage_name} for c in contestants],
        "state": {"status": state.status if state else "idle", "winner_declared": state.winner_declared if state else False, "winner_id": state.winner_id if state else None, "countdown_active": state.countdown_active if state else False, "countdown_value": state.countdown_value if state else 0}
    }

@router.get("/logs")
async def get_logs(limit: int = 100, db: Session = Depends(get_db), admin=Depends(verify_admin)):
    logs = db.query(models.LogEntry).order_by(models.LogEntry.created_at.desc()).limit(limit).all()
    result = []
    for log in logs:
        result.append({
            "id": log.id,
            "log_type": log.log_type,
            "message": log.message,
            "data": log.data,
            "created_at": log.created_at.isoformat() if log.created_at else None
        })
    return result

@router.get("/voters")
async def get_voters(db: Session = Depends(get_db), admin=Depends(verify_admin)):
    voters = db.query(models.Voter).order_by(models.Voter.registered_at.desc()).all()
    result = []
    for v in voters:
        result.append({
            "id": v.id,
            "name": v.name,
            "email": v.email,
            "telephone": v.telephone,
            "has_voted": v.has_voted,
            "registered_at": v.registered_at.isoformat() if v.registered_at else None,
            "ip_address": v.ip_address
        })
    return result

@router.get("/qr")
async def generate_qr(request: Request):
    import qrcode
    import io
    import base64
    base_url = str(request.base_url).rstrip('/')
    voter_url = f"{base_url}/voter"
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(voter_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0f7c3e", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    img_str = base64.b64encode(buf.getvalue()).decode()
    return {"qr_code": f"data:image/png;base64,{img_str}", "url": voter_url}

@router.post("/countdown/decrement")
async def decrement_countdown(request: Request, db: Session = Depends(get_db), admin=Depends(verify_admin)):
    """Decrement the countdown value. When it reaches 0, auto-transition to voting."""
    state = db.query(models.EventState).first()
    if not state:
        return {"status": "no_state", "message": "No event state found"}
    
    if state.countdown_active and state.countdown_value > 0:
        state.countdown_value -= 1
        db.commit()
        db.refresh(state)
    
    # If countdown reaches 0 and active, auto-transition
    if state.countdown_active and state.countdown_value == 0:
        if state.status == "starting":
            state.status = "voting"
            state.countdown_active = False
            state.countdown_value = 0
            db.commit()
        elif state.status == "runway_ended":
            state.status = "ended"
            state.countdown_active = False
            state.countdown_value = 0
            state.ended_at = datetime.utcnow()
            db.commit()
    
    return {
        "status": state.status,
        "countdown_active": state.countdown_active,
        "countdown_value": state.countdown_value,
        "message": f"Countdown at {state.countdown_value}s"
    }