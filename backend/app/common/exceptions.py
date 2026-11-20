from __future__ import annotations
from typing import Any, Optional

try:
    from fastapi import HTTPException, status
except ImportError:
    # Standard library fallback if FastAPI is not yet installed in current Python environment
    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: Any = None, headers: Optional[dict] = None):
            self.status_code = status_code
            self.detail = detail
            self.headers = headers
            super().__init__(detail)

    class status:
        HTTP_400_BAD_REQUEST = 400
        HTTP_401_UNAUTHORIZED = 401
        HTTP_403_FORBIDDEN = 403
        HTTP_404_NOT_FOUND = 404
        HTTP_409_CONFLICT = 409
        HTTP_422_UNPROCESSABLE_ENTITY = 422
        HTTP_500_INTERNAL_SERVER_ERROR = 500


class SampleMindException(HTTPException):
    """Base exception for all domain and HTTP errors in SampleMind."""
    def __init__(
        self,
        status_code: int,
        detail: str,
        code: str = "ERROR",
        extra: Optional[dict[str, Any]] = None
    ):
        super().__init__(
            status_code=status_code,
            detail={"code": code, "message": detail, "extra": extra or {}}
        )


class EntityNotFoundException(SampleMindException):
    def __init__(self, entity_name: str, entity_id: Any = None):
        if entity_id is None:
            detail = entity_name
        else:
            detail = f"{entity_name} with identifier '{entity_id}' was not found."
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail,
            code="NOT_FOUND"
        )


class DuplicateEntityException(SampleMindException):
    def __init__(self, entity_name: str, field_name: Optional[str] = None, value: Any = None):
        if field_name is None:
            detail = entity_name
        else:
            detail = f"{entity_name} with {field_name}='{value}' already exists."
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
            code="DUPLICATE_ENTITY"
        )


class LineageCycleException(SampleMindException):
    def __init__(self, parent_id: Any, child_id: Any):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Lineage DAG Cycle: Sample {parent_id} is already a descendant of {child_id}. Operation rejected.",
            code="LINEAGE_CYCLE_VIOLATION"
        )


class InsufficientQuantityException(SampleMindException):
    def __init__(self, available: float, requested: float, unit: str):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Insufficient sample stock: available {available} {unit}, requested {requested} {unit}.",
            code="INSUFFICIENT_QUANTITY"
        )


class UnauthorizedRoleException(SampleMindException):
    def __init__(self, required_roles: list[str]):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Requires one of following roles: {', '.join(required_roles)}.",
            code="FORBIDDEN_ROLE"
        )


class InvalidCredentialsException(SampleMindException):
    def __init__(self, detail: str = "Incorrect username or password."):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            code="INVALID_CREDENTIALS"
        )


class ValidationException(SampleMindException):
    def __init__(self, detail: str, code: str = "VALIDATION_ERROR", extra: Optional[dict[str, Any]] = None):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
            code=code,
            extra=extra
        )

