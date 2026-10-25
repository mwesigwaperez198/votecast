from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class ContestantBase(BaseModel):
    name: str
    stage_name: Optional[str] = None
    category: Optional[str] = None
    bio: Optional[str] = None
    photo_url: Optional[str] = None
    order_index: Optional[int] = 0

class ContestantCreate(ContestantBase):
    pass

class ContestantResponse(ContestantBase):
    id: int
    is_active: bool
    votes_count: int
    admin_votes_count: int
    points_total: float
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class VoterRegister(BaseModel):
    name: str
    email: str
    telephone: str

class VoterResponse(BaseModel):
    id: int
    name: str
    email: str
    session_token: str
    has_voted: bool
    
    class Config:
        from_attributes = True

class VoteRequest(BaseModel):
    contestant_id: int
    session_token: str

class AdminVoteRequest(BaseModel):
    contestant_id: int

class AdminLogin(BaseModel):
    username: str
    password: str

class EventControl(BaseModel):
    action: str

class WinnerDeclare(BaseModel):
    winner_id: int
