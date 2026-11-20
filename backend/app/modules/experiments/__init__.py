"""
Experiments, Equipment & Results Management Module
Imports only from `app.common`.
"""

from .router import experiments_router, results_router

__all__ = ["experiments_router", "results_router"]
