"""
SampleMind Storage & Equipment Module
=====================================
Strict isolation: imports only from app.common.
"""

from .router import storage_router, equipment_router

__all__ = ["storage_router", "equipment_router"]
