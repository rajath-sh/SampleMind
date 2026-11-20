from typing import Callable, Sequence, Any
from sqlalchemy.orm import Session

try:
    from fastapi import Depends, status, HTTPException
    from fastapi.security import OAuth2PasswordBearer
    oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)
except ImportError:
    # Graceful fallback when running standalone scripts
    def Depends(dependency: Any = None):
        return dependency
    class status:
        HTTP_401_UNAUTHORIZED = 401
    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: Any = None, headers: Any = None):
            self.status_code = status_code
            self.detail = detail
            self.headers = headers
    oauth2_scheme = None

from .database import get_db
from .security import decode_access_token
from .models import AppUser
from .exceptions import UnauthorizedRoleException, InvalidCredentialsException


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> AppUser:
    """
    Validates JWT Bearer token and returns the authenticated AppUser record.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise InvalidCredentialsException()

    user_id = payload.get("user_id") or payload.get("sub")
    user = None
    try:
        user = db.query(AppUser).filter(AppUser.user_id == int(user_id), AppUser.is_active == True).first()
    except (ValueError, TypeError):
        user = db.query(AppUser).filter(AppUser.email == str(user_id), AppUser.is_active == True).first()

    if not user:
        raise InvalidCredentialsException()

    return user


def require_roles(allowed_roles: Sequence[str]) -> Callable[[AppUser], AppUser]:
    """
    Dependency factory that restricts route execution to designated roles.
    Example: Depends(require_roles(["ADMIN", "RESEARCHER"]))
    """
    def role_checker(current_user: AppUser = Depends(get_current_user)) -> AppUser:
        if current_user.role not in allowed_roles:
            raise UnauthorizedRoleException(list(allowed_roles))
        return current_user

    return role_checker
