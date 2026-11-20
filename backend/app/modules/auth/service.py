"""
SampleMind Auth Module - Service Layer
======================================
Strict isolation: imports only from app.common.
Encapsulates user authentication, password verification, token generation,
and administrative user account management.
"""

from __future__ import annotations
from typing import Optional, List
from datetime import timedelta
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.common import (
    AppUser,
    AuditLog,
    verify_password,
    get_password_hash,
    create_access_token,
    settings,
    EntityNotFoundException,
    DuplicateEntityException,
    InvalidCredentialsException,
    ValidationException,
    TokenResponse,
    UserRole,
)
from .schemas import UserCreateRequest, UserStatusUpdateRequest


class AuthService:
    """Authentication and identity service."""

    @staticmethod
    def authenticate_user(db: Session, identifier: str, password: str) -> AppUser:
        """
        Validates username (email or display_name) and password against database records.
        Raises InvalidCredentialsException on failure or inactive account.
        """
        user = db.query(AppUser).filter(
            or_(AppUser.email == identifier, AppUser.display_name == identifier)
        ).first()

        if not user:
            raise InvalidCredentialsException("Invalid credentials.")
        
        if not verify_password(password, user.password_hash):
            raise InvalidCredentialsException("Invalid credentials.")
        
        if not user.is_active:
            raise InvalidCredentialsException("This user account has been deactivated.")
        
        return user

    @staticmethod
    def create_user_token(user: AppUser) -> TokenResponse:
        """
        Generates signed JWT access token for an authenticated user.
        """
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        role_str = user.role.value if hasattr(user.role, "value") else str(user.role)
        token_payload = {
            "sub": str(user.user_id),
            "user_id": user.user_id,
            "email": user.email,
            "display_name": user.display_name,
            "role": role_str,
        }
        access_token = create_access_token(
            data=token_payload,
            expires_delta=expires_delta
        )
        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
            user_id=user.user_id,
            email=user.email,
            display_name=user.display_name,
            role=role_str,
        )

    @staticmethod
    def register_user(db: Session, req: UserCreateRequest, actor_id: Optional[int] = None) -> AppUser:
        """
        Provisions a new researcher or admin account.
        Validates uniqueness of email.
        """
        existing_email = db.query(AppUser).filter(AppUser.email == req.email).first()
        if existing_email:
            raise DuplicateEntityException(f"Email address '{req.email}' is already registered.")

        role_str = req.role.value if hasattr(req.role, "value") else str(req.role)
        hashed_pw = get_password_hash(req.password)
        new_user = AppUser(
            display_name=req.display_name,
            email=req.email,
            password_hash=hashed_pw,
            role=role_str,
            is_active=True,
        )
        db.add(new_user)
        db.flush()

        # Audit log entry
        audit = AuditLog(
            actor_user_id=actor_id or new_user.user_id,
            action="USER_REGISTERED",
            entity_type="AppUser",
            entity_id=new_user.user_id,
            details={
                "display_name": new_user.display_name,
                "email": new_user.email,
                "role": role_str,
            }
        )
        db.add(audit)
        db.commit()

        return new_user

    @staticmethod
    def get_user_by_id(db: Session, user_id: int) -> AppUser:
        """Retrieves a user by primary key or raises EntityNotFoundException."""
        user = db.query(AppUser).filter(AppUser.user_id == user_id).first()
        if not user:
            raise EntityNotFoundException(f"User with ID {user_id} not found.")
        return user

    @staticmethod
    def list_users(
        db: Session,
        role: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> List[AppUser]:
        """Queries users with optional role and active-status filters."""
        query = db.query(AppUser)
        if role:
            query = query.filter(AppUser.role == role)
        if is_active is not None:
            query = query.filter(AppUser.is_active == is_active)
        return query.order_by(AppUser.user_id.asc()).all()

    @staticmethod
    def update_user_status(
        db: Session,
        user_id: int,
        req: UserStatusUpdateRequest,
        actor_id: Optional[int] = None
    ) -> AppUser:
        """Updates user active status or RBAC role."""
        if actor_id == user_id and (req.is_active is False or req.role not in (None, UserRole.ADMIN)):
            raise ValidationException("Use another administrator to change your own access.", "SELF_ACCESS_CHANGE")
        user = AuthService.get_user_by_id(db, user_id)
        old_state = {
            "is_active": user.is_active,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        }

        if req.is_active is not None:
            user.is_active = req.is_active
        if req.role is not None:
            role_str = req.role.value if hasattr(req.role, "value") else str(req.role)
            user.role = role_str

        # Audit log entry
        audit = AuditLog(
            actor_user_id=actor_id or user.user_id,
            action="USER_STATUS_UPDATED",
            entity_type="AppUser",
            entity_id=user.user_id,
            details={
                "old_state": old_state,
                "new_state": {
                    "is_active": user.is_active,
                    "role": user.role.value if hasattr(user.role, "value") else str(user.role),
                }
            }
        )
        db.add(audit)
        db.commit()

        return user
