import sqlite3
from typing import Generator
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from .config import settings

# Engine configuration
connect_args = {}
if settings.USE_SQLITE or settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=settings.DEBUG and not settings.USE_SQLITE,
    pool_pre_ping=True
)


# SQLite PRAGMA hook: Ensure SQLite strictly enforces Foreign Keys like PostgreSQL
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


# Database Session Factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative Base for ORM Models
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency yielding an isolated database session per request.
    Services commit their own writes. Exceptions roll back the session.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def acquire_write_lock(db: Session, model, primary_key: int):
    """Read a stock row only after acquiring the engine's write lock."""
    if db.get_bind().dialect.name == "sqlite":
        # SQLite's legacy driver mode does not start a database transaction for SELECT.
        connection = db.connection()
        if not connection.connection.driver_connection.in_transaction:
            connection.exec_driver_sql("BEGIN IMMEDIATE")
        return db.get(model, primary_key, populate_existing=True)
    return db.get(model, primary_key, with_for_update=True, populate_existing=True)


def lock_lineage_writes(db: Session) -> None:
    if db.get_bind().dialect.name == "sqlite":
        connection = db.connection()
        if not connection.connection.driver_connection.in_transaction:
            connection.exec_driver_sql("BEGIN IMMEDIATE")
    else:
        db.execute(text("SELECT pg_advisory_xact_lock(482713)"))
