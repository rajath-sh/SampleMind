"""
SampleMind Auth Module
======================
Strict isolation: imports only from app.common.
"""

from .router import router as auth_router

__all__ = ["auth_router"]
