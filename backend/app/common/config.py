import os
from secrets import token_urlsafe
from pathlib import Path

# Root project directory
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

# Load .env file if it exists (standalone without external dependencies)
env_file_path = BASE_DIR / ".env"
if env_file_path.exists():
    try:
        with open(env_file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    if key not in os.environ:
                        os.environ[key] = val
    except Exception:
        pass

# Universal BaseSettings fallback
try:
    from pydantic_settings import BaseSettings
except Exception:
    try:
        from pydantic import BaseSettings
    except Exception:
        BaseSettings = object


class Settings(BaseSettings if BaseSettings is not object else object):
    """
    Application Settings
    Supports instant switching between SQLite and PostgreSQL via the `USE_SQLITE` flag.
    Works standalone in standard Python and with Pydantic v1/v2.
    """
    APP_NAME: str = os.getenv("APP_NAME", "SampleMind")
    APP_ENV: str = os.getenv("APP_ENV", "development")
    DEBUG: bool = os.getenv("DEBUG", "False").lower() in ("true", "1", "yes")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # =========================================================================
    # SINGLE SWITCH TO FLIP BETWEEN SQLITE AND POSTGRESQL:
    # Set USE_SQLITE=True for instant, zero-setup local SQLite file database.
    # Set USE_SQLITE=False to automatically switch to production PostgreSQL.
    # =========================================================================
    USE_SQLITE: bool = os.getenv("USE_SQLITE", "True").lower() in ("true", "1", "yes")

    # Database URLs
    SQLITE_URL: str = os.getenv("SQLITE_URL", f"sqlite:///{BASE_DIR / 'samplemind.db'}")
    POSTGRES_URL: str = os.getenv("POSTGRES_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/samplemind_db")

    # Security & JWT Token
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", token_urlsafe(48))
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

    # CORS Allowed Origins
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173")

    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

    DOCUMENT_DB_PATH: str = os.getenv("DOCUMENT_DB_PATH", ".runtime/evidence.json")

    # Machine Learning Subsystem
    MODEL_PATH: str = os.getenv("MODEL_PATH", str(BASE_DIR / "ml" / "artifacts" / "rf_sample_risk_model.joblib"))
    MODEL_VERSION: str = os.getenv("MODEL_VERSION", "rf-sample-risk-v1.1.0")
    FEATURE_SCHEMA_VERSION: str = os.getenv("FEATURE_SCHEMA_VERSION", "v1.1")
    SEED: int = int(os.getenv("SEED", "42"))

    @property
    def DATABASE_URL(self) -> str:
        """Dynamically computes the active database URL based on the USE_SQLITE flag."""
        if self.USE_SQLITE:
            if self.SQLITE_URL.startswith("sqlite:///"):
                rel_path = self.SQLITE_URL[len("sqlite:///"):]
                if not os.path.isabs(rel_path):
                    return f"sqlite:///{BASE_DIR / rel_path}"
            return self.SQLITE_URL
        return self.POSTGRES_URL

    @property
    def cors_origins_list(self) -> list:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    class Config:
        env_file = str(BASE_DIR / ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"


# Singleton configuration instance
settings = Settings()
