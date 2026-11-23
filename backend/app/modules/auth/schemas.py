"""
SampleMind Auth Module - Schemas & DTOs
======================================
Strict isolation: imports only from app.common.
"""

from __future__ import annotations
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field

from app.common import UserRole, TokenResponse, UserSummary


class LoginRequest(BaseModel):
    """Credentials payload for JWT generation."""
    username: str = Field(..., min_length=3, max_length=150, description="Email address or display name")
    password: str = Field(..., min_length=6, description="Plaintext account password")


class PublicSignupRequest(BaseModel):
    """Self-registration request from the front login page (strictly VIEWER role)."""
    display_name: str = Field(..., min_length=2, max_length=120, description="Full name or display title")
    email: str = Field(..., min_length=5, max_length=150, pattern=r"^[^@]+@[^@]+\.[^@]+$", description="Valid institutional email address")
    password: str = Field(..., min_length=6, description="Account password (minimum 6 characters)")


class UserCreateRequest(BaseModel):
    """Administrator request to provision a new user account."""
    display_name: str = Field(..., min_length=2, max_length=120, description="Full name or display title")
    email: str = Field(..., min_length=5, max_length=150, pattern=r"^[^@]+@[^@]+\.[^@]+$", description="Valid institutional email address")
    password: str = Field(..., min_length=6, description="Secure account password")
    role: UserRole = Field(default=UserRole.RESEARCHER, description="Assigned institutional RBAC role")


class UserStatusUpdateRequest(BaseModel):
    """Administrator update to account status or role."""
    is_active: Optional[bool] = Field(None, description="Active status flag")
    role: Optional[UserRole] = Field(None, description="Updated RBAC role")


class UserDetailResponse(BaseModel):
    """Detailed user dossier returned upon retrieval."""
    user_id: int
    display_name: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
