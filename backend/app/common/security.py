import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, Any, Union
from .config import settings

# Graceful import of passlib and jose with standard library fallback
try:
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    HAS_PASSLIB = True
except ImportError:
    pwd_context = None
    HAS_PASSLIB = False

try:
    from jose import jwt, JWTError
    HAS_JOSE = True
except ImportError:
    jwt = None
    JWTError = Exception
    HAS_JOSE = False


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a stored hash."""
    if HAS_PASSLIB and pwd_context:
        try:
            return pwd_context.verify(plain_password, hashed_password)
        except Exception:
            pass
    
    # Standard library fallback (SHA256 with salt)
    if ":" in hashed_password:
        salt, h = hashed_password.split(":", 1)
        expected = hashlib.sha256((salt + plain_password).encode()).hexdigest()
        return hmac.compare_digest(h, expected)
    
    return False


def get_password_hash(password: str) -> str:
    """Generates a salted password hash."""
    if HAS_PASSLIB and pwd_context:
        return pwd_context.hash(password)
    
    # Standard library fallback
    salt = hashlib.sha256(str(time.time()).encode()).hexdigest()[:16]
    h = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{h}"


def create_access_token(
    subject: Optional[Union[str, Any]] = None,
    role: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
    data: Optional[dict] = None,
) -> str:
    """Creates a signed JWT token with user claims and expiration."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {}
    if data:
        to_encode.update(data)
    if subject is not None:
        to_encode["sub"] = str(subject)
    if role is not None:
        to_encode["role"] = str(role)

    to_encode["exp"] = int(expire.timestamp())
    to_encode["iss"] = settings.APP_NAME

    if HAS_JOSE and jwt:
        return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    # Standard library fallback JWT (HMAC-SHA256)
    header = {"alg": "HS256", "typ": "JWT"}
    b64_header = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    b64_payload = base64.urlsafe_b64encode(json.dumps(to_encode).encode()).decode().rstrip("=")
    sig = hmac.new(settings.JWT_SECRET_KEY.encode(), f"{b64_header}.{b64_payload}".encode(), hashlib.sha256).digest()
    b64_sig = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return f"{b64_header}.{b64_payload}.{b64_sig}"


def decode_access_token(token: str) -> Optional[dict]:
    """Decodes and validates a signed JWT token."""
    if HAS_JOSE and jwt:
        try:
            return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        except JWTError:
            return None

    # Standard library fallback
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        b64_header, b64_payload, b64_sig = parts
        sig = hmac.new(settings.JWT_SECRET_KEY.encode(), f"{b64_header}.{b64_payload}".encode(), hashlib.sha256).digest()
        expected_sig = base64.urlsafe_b64encode(sig).decode().rstrip("=")
        if not hmac.compare_digest(b64_sig, expected_sig):
            return None

        # Pad base64 string
        pad = len(b64_payload) % 4
        if pad:
            b64_payload += "=" * (4 - pad)
        payload = json.loads(base64.urlsafe_b64decode(b64_payload).decode())

        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None
