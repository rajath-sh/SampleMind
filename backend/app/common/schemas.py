"""
SampleMind Common Layer - Shared Pydantic Schemas & DTOs
========================================================
This file defines standard request/response envelopes, pagination models,
and core authorization DTOs shared across all isolated domain modules.
All feature modules import standard response envelopes from here.
"""

from __future__ import annotations
from typing import Generic, TypeVar, Optional, List, Any
from datetime import datetime
from pydantic import BaseModel, Field

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    """Standard success envelope for all API endpoints."""
    success: bool = Field(default=True, description="Indicates if operation succeeded")
    message: str = Field(default="Operation completed successfully", description="Descriptive status message")
    data: Optional[T] = Field(default=None, description="Response payload")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="UTC timestamp of response")


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard paginated response wrapper for collection queries."""
    items: List[T] = Field(default_factory=list, description="Page of items")
    total: int = Field(..., ge=0, description="Total matching records across all pages")
    page: int = Field(default=1, ge=1, description="Current page number (1-indexed)")
    page_size: int = Field(default=20, ge=1, le=10000, description="Number of items per page")
    total_pages: int = Field(..., ge=0, description="Total number of pages available")


class ErrorDetail(BaseModel):
    """Detailed error payload for failed requests."""
    code: str = Field(..., description="Standardized error code (e.g., NOT_FOUND, DUPLICATE_ENTRY)")
    message: str = Field(..., description="Human-readable error explanation")
    details: Optional[Any] = Field(default=None, description="Detailed field-level context or stack metadata")


class TokenResponse(BaseModel):
    """OAuth2 / JWT access token response."""
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    user_id: int
    email: str
    display_name: str
    role: str

    @property
    def username(self) -> str:
        return self.email


class TokenData(BaseModel):
    """Payload decoded from verified JWT access token."""
    user_id: Optional[int] = None
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: Optional[str] = None


class UserSummary(BaseModel):
    """Lightweight user identity model."""
    user_id: int
    display_name: str
    email: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True
