"""
SampleMind Auth Module - API Router
===================================
Strict isolation: imports only from app.common and local auth schemas/service.
Exposes endpoints for user login, token refresh, profile inspection,
and administrative user account provisioning.
"""

from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.common import (
    get_db,
    get_current_user,
    require_roles,
    UserRole,
    APIResponse,
    TokenResponse,
    UserSummary,
    AppUser,
    DuplicateEntityException,
)
from .schemas import (
    LoginRequest,
    PublicSignupRequest,
    UserCreateRequest,
    UserStatusUpdateRequest,
    UserDetailResponse,
)
from .service import AuthService

router = APIRouter(
    prefix="/api/v1/auth",
    tags=["Authentication & Users"]
)


@router.post(
    "/login",
    response_model=APIResponse[TokenResponse],
    summary="Authenticate user and issue JWT token",
    status_code=status.HTTP_200_OK,
)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Authenticates account credentials (email or display name) and issues
    a signed JWT access bearer token with user identity and role claims.
    """
    user = AuthService.authenticate_user(
        db=db,
        identifier=payload.username,
        password=payload.password
    )
    token = AuthService.create_user_token(user)
    return APIResponse(
        message=f"Welcome back, {user.display_name}!",
        data=token
    )


@router.post(
    "/signup",
    response_model=APIResponse[TokenResponse],
    summary="Self-register a new user account (Strictly VIEWER role)",
    status_code=status.HTTP_201_CREATED,
)
def signup(
    payload: PublicSignupRequest,
    db: Session = Depends(get_db)
):
    """
    Public self-registration for new users.
    Assigns the lowest permission tier (VIEWER).
    Role elevation to Researcher, Technician, or Admin requires Administrator action.
    """
    existing = db.query(AppUser).filter(
        (AppUser.email == payload.email) | (AppUser.display_name == payload.display_name)
    ).first()
    if existing:
        if existing.email == payload.email:
            raise DuplicateEntityException(f"Email address '{payload.email}' is already registered.")
        else:
            raise DuplicateEntityException(f"Display name '{payload.display_name}' is already taken.")

    req = UserCreateRequest(
        display_name=payload.display_name.strip(),
        email=payload.email.strip().lower(),
        password=payload.password,
        role=UserRole.VIEWER,
    )
    new_user = AuthService.register_user(db=db, req=req, actor_id=None)
    token = AuthService.create_user_token(new_user)
    return APIResponse(
        message=f"Account created successfully for '{new_user.display_name}'. Assigned role: VIEWER.",
        data=token
    )


@router.get(
    "/me",
    response_model=APIResponse[UserSummary],
    summary="Retrieve current authenticated user profile",
)
def get_current_user_profile(
    current_user: AppUser = Depends(get_current_user)
):
    """
    Returns identity and role permissions for the currently authenticated bearer token.
    """
    user_summary = UserSummary(
        user_id=current_user.user_id,
        display_name=current_user.display_name,
        email=current_user.email,
        role=current_user.role,
        is_active=current_user.is_active,
    )
    return APIResponse(
        message="User profile retrieved successfully.",
        data=user_summary
    )


@router.post(
    "/register",
    response_model=APIResponse[UserSummary],
    summary="Provision a new user account (Admin only)",
    status_code=status.HTTP_201_CREATED,
)
def register_user(
    req: UserCreateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN"]))
):
    """
    Creates a new researcher, technician, or reviewer account.
    Restricted to system administrators.
    """
    new_user = AuthService.register_user(
        db=db,
        req=req,
        actor_id=current_user.user_id
    )
    user_summary = UserSummary(
        user_id=new_user.user_id,
        display_name=new_user.display_name,
        email=new_user.email,
        role=new_user.role,
        is_active=new_user.is_active,
    )
    return APIResponse(
        message=f"User account for '{new_user.display_name}' created successfully.",
        data=user_summary
    )


@router.get(
    "/users",
    response_model=APIResponse[List[UserSummary]],
    summary="List all researchers and staff (Admin / Lab Manager)",
)
def list_users(
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"]))
):
    """
    Returns a directory of lab personnel with optional role and status filters.
    """
    users = AuthService.list_users(db=db, role=role, is_active=is_active)
    summaries = [
        UserSummary(
            user_id=u.user_id,
            display_name=u.display_name,
            email=u.email,
            role=u.role,
            is_active=u.is_active,
        )
        for u in users
    ]
    return APIResponse(
        message=f"Retrieved {len(summaries)} user accounts.",
        data=summaries
    )


@router.put(
    "/users/{user_id}/status",
    response_model=APIResponse[UserSummary],
    summary="Modify user active status or role (Admin only)",
)
def update_user_status(
    user_id: int,
    req: UserStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN"]))
):
    """
    Activates, deactivates, or alters the role classification of an account.
    """
    updated_user = AuthService.update_user_status(
        db=db,
        user_id=user_id,
        req=req,
        actor_id=current_user.user_id
    )
    user_summary = UserSummary(
        user_id=updated_user.user_id,
        display_name=updated_user.display_name,
        email=updated_user.email,
        role=updated_user.role,
        is_active=updated_user.is_active,
    )
    return APIResponse(
        message=f"User '{updated_user.display_name}' status updated successfully.",
        data=user_summary
    )
