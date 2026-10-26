from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models import models
from app.schemas import schemas
from app.utils import helpers
from app.core import config
from datetime import datetime
import json

router = APIRouter()

@router.get("/gallery")
async def get_gallery(db: Session = Depends(get_db)):
    contestants = db.query(models.Contestant).filter(models.Contestant.is_active == True).order_by(models.Contestant.order_index).all()
    return {
        "gallery": [
            {
                "id": c.id,
                "name": c.name,
                "stage_name": c.stage_name,
                "category": c.category,
                "image_url": c.photo_url,
            }
            for c in contestants
        ]
    }

@router.post("/register")
async def register_voter(voter: schemas.VoterRegister, request: Request, db: Session = Depends(get_db)):
    existing = db.query(models.Voter).filter(models.Voter.email == voter.email).first()
    if existing:
        return {
            "message": "Already registered",
            "session_token": existing.session_token,
            "voter": {"id": existing.id, "name": existing.name, "email": existing.email, "has_voted": existing.has_voted}
        }
    
    token = helpers.generate_session_token()
    db_voter = models.Voter(
        name=voter.name,
        email=voter.email,
        telephone=voter.telephone,
        session_token=token,
        ip_address=request.client.host if request.client else None
    )
    db.add(db_voter)
    db.commit()
    db.refresh(db_voter)
    
    log_entry = models.LogEntry(
        log_type="registration",
        message=f"Voter registered: {voter.name} ({voter.email})",
        data=json.dumps({"name": voter.name, "email": voter.email, "telephone": voter.telephone, "ip": db_voter.ip_address})
    )
    db.add(log_entry)
    db.commit()
    
    return {
        "message": "Registration successful",
        "session_token": token,
        "voter": {"id": db_voter.id, "name": db_voter.name, "email": db_voter.email, "has_voted": False}
    }

@router.post("/vote")
async def cast_vote(vote_req: schemas.VoteRequest, request: Request, db: Session = Depends(get_db)):
    voter = db.query(models.Voter).filter(models.Voter.session_token == vote_req.session_token).first()
    if not voter:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    state = db.query(models.EventState).first()
    if not state or state.status != "voting":
        raise HTTPException(status_code=403, detail="Voting is not open")
    
    if voter.has_voted:
        raise HTTPException(status_code=400, detail="You have already voted")
    
    contestant = db.query(models.Contestant).filter(models.Contestant.id == vote_req.contestant_id).first()
    if not contestant or not contestant.is_active:
        raise HTTPException(status_code=404, detail="Contestant not found")
    
    vote_hash = helpers.generate_vote_hash(voter.id, contestant.id, "audience", datetime.utcnow().isoformat())
    ledger_entry = models.VoteLedger(
        voter_id=voter.id,
        contestant_id=contestant.id,
        voter_type="audience",
        points=config.settings.VOTE_POINTS_NORMAL,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        vote_hash=vote_hash
    )
    db.add(ledger_entry)
    
    contestant.votes_count += 1
    contestant.points_total += config.settings.VOTE_POINTS_NORMAL
    
    voter.has_voted = True
    voter.voted_at = datetime.utcnow()
    
    db.commit()
    
    log_entry = models.LogEntry(
        log_type="vote",
        message=f"Vote cast for {contestant.name}",
        data=json.dumps({"voter_id": voter.id, "contestant_id": contestant.id, "points": 1})
    )
    db.add(log_entry)
    db.commit()
    
    return {"message": "Vote cast successfully", "contestant": contestant.name}

@router.get("/contestants")
async def get_contestants(db: Session = Depends(get_db)):
    contestants = db.query(models.Contestant).filter(models.Contestant.is_active == True).order_by(models.Contestant.order_index).all()
    return contestants

@router.get("/state")
async def get_state(db: Session = Depends(get_db)):
    state = db.query(models.EventState).first()
    if not state:
        state = models.EventState(status="idle")
        db.add(state)
        db.commit()
        db.refresh(state)
    return {
        "status": state.status,
        "countdown_active": state.countdown_active,
        "countdown_value": state.countdown_value,
        "winner_declared": state.winner_declared,
        "winner_id": state.winner_id
    }
