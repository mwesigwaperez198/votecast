from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Admin(Base):
    __tablename__ = "admins"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password_hash = Column(String)
    role = Column(String, default="admin")  # admin, judge
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Contestant(Base):
    __tablename__ = "contestants"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    stage_name = Column(String)
    category = Column(String)
    bio = Column(Text)
    photo_url = Column(Text)
    gallery_images = Column(Text)  # JSON array of image URLs
    order_index = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    votes_count = Column(Integer, default=0)
    admin_votes_count = Column(Integer, default=0)
    points_total = Float(default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    gallery = relationship("ModelGallery", back_populates="contestant", cascade="all, delete-orphan")


class ModelGallery(Base):
    __tablename__ = "model_gallery"
    
    id = Column(Integer, primary_key=True, index=True)
    contestant_id = Column(Integer, ForeignKey("contestants.id"))
    image_url = Column(Text)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    contestant = relationship("Contestant", back_populates="gallery")

class Voter(Base):
    __tablename__ = "voters"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    email = Column(String, index=True)
    telephone = Column(String)
    session_token = Column(String, unique=True, index=True)
    ip_address = Column(String)
    has_voted = Column(Boolean, default=False)
    voted_at = Column(DateTime(timezone=True))
    registered_at = Column(DateTime(timezone=True), server_default=func.now())

class VoteLedger(Base):
    __tablename__ = "vote_ledger"
    
    id = Column(Integer, primary_key=True, index=True)
    voter_id = Column(Integer, ForeignKey("voters.id"))
    contestant_id = Column(Integer, ForeignKey("contestants.id"))
    voter_type = Column(String)  # audience, admin, judge
    points = Column(Integer)
    ip_address = Column(String)
    user_agent = Column(String)
    vote_hash = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class EventState(Base):
    __tablename__ = "event_state"
    
    id = Column(Integer, primary_key=True, index=True)
    status = Column(String, default="idle")
    countdown_active = Column(Boolean, default=False)
    countdown_value = Column(Integer, default=0)
    winner_declared = Column(Boolean, default=False)
    winner_id = Column(Integer, ForeignKey("contestants.id"), nullable=True)
    started_at = Column(DateTime(timezone=True))
    ended_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class LogEntry(Base):
    __tablename__ = "logs"
    
    id = Column(Integer, primary_key=True, index=True)
    log_type = Column(String)
    message = Column(Text)
    data = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class GalleryImage(Base):
    __tablename__ = "gallery_images"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    image_url = Column(Text)
    category = Column(String, default="gallery")
    order_index = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    uploaded_by = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())