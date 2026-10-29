import os
from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "VoteCast"
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    DATABASE_URL: str = "sqlite:///./votecast.db"
    CORS_ORIGINS: str = "*"
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin123"
    EVENT_NAME: str = "DA-VELA HOUSE OF ART"
    VOTE_POINTS_NORMAL: int = 1
    VOTE_POINTS_ADMIN: int = 3
    
    class Config:
        env_file = ".env"

    @property
    def cors_origins_list(self) -> List[str]:
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

settings = Settings()
