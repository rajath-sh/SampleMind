"""Administrator SQL terminal for the active local SQLite database."""
import base64
import sqlite3
import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.common import AppUser, SampleMindException, get_db, require_roles

router = APIRouter(prefix="/api/v1/sql-console", tags=["SQL Testing"])


class SQLInput(BaseModel):
    sql: str = Field(min_length=1, max_length=50000)


def split_statements(script: str) -> list[str]:
    statements = []
    buffer = ""
    for character in script:
        buffer += character
        if character == ";" and sqlite3.complete_statement(buffer):
            statements.append(buffer.strip())
            buffer = ""
    if buffer.strip():
        if not sqlite3.complete_statement(buffer + ";"):
            raise SampleMindException(400, "SQL contains an unfinished string or statement.", "INCOMPLETE_SQL")
        statements.append(buffer.strip())
    return statements


def json_value(value):
    if isinstance(value, bytes):
        return {"base64": base64.b64encode(value).decode("ascii")}
    return value


def execute_script(engine, script: str) -> dict:
    if engine.dialect.name != "sqlite":
        raise SampleMindException(400, "This console currently supports SQLite.", "CONSOLE_DIALECT")
    statements = split_statements(script)
    if not statements:
        raise SampleMindException(400, "Enter a SQL statement.", "EMPTY_SQL")
    if len(statements) > 100:
        raise SampleMindException(400, "Run at most 100 statements per submission.", "SQL_LIMIT")

    results = []
    started = time.monotonic()
    raw = engine.raw_connection()
    connection = raw.driver_connection
    previous_isolation = connection.isolation_level

    def authorize(action, argument, value, database, source):
        if action in (sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH, sqlite3.SQLITE_TRANSACTION):
            return sqlite3.SQLITE_DENY
        if action == sqlite3.SQLITE_FUNCTION and str(value).lower() == "load_extension":
            return sqlite3.SQLITE_DENY
        if action == sqlite3.SQLITE_PRAGMA and value is not None:
            inspection = {"table_info", "table_xinfo", "index_list", "index_info", "index_xinfo",
                          "foreign_key_list", "integrity_check", "quick_check"}
            if str(argument).lower() not in inspection:
                return sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_OK

    try:
        connection.isolation_level = None
        connection.execute("BEGIN IMMEDIATE")
        connection.set_authorizer(authorize)
        connection.set_progress_handler(lambda: int(time.monotonic() - started > 8), 10000)
        changed = connection.total_changes
        for index, statement in enumerate(statements, 1):
            # A submission is one atomic unit. Transaction boundaries cannot escape it.
            command = statement.lstrip().upper().rstrip(";").strip()
            if command in ("BEGIN", "BEGIN TRANSACTION", "BEGIN IMMEDIATE", "BEGIN EXCLUSIVE"):
                results.append({"statement": index, "message": "Transaction active", "columns": [], "rows": []})
                continue
            if command in ("COMMIT", "END", "END TRANSACTION", "COMMIT TRANSACTION"):
                if index != len(statements):
                    raise sqlite3.OperationalError("COMMIT must be the last statement in a submission.")
                results.append({"statement": index, "message": "Commit requested", "columns": [], "rows": []})
                continue
            if command in ("ROLLBACK", "ROLLBACK TRANSACTION"):
                if index != len(statements):
                    raise sqlite3.OperationalError("ROLLBACK must be the last statement in a submission.")
                connection.set_authorizer(None)
                connection.rollback()
                return {"results": results, "committed": False, "changes": 0, "message": "Transaction rolled back"}
            if not connection.in_transaction:
                raise sqlite3.OperationalError("Transaction ended before the submission completed.")
            cursor = connection.execute(statement)
            columns = [column[0] for column in cursor.description] if cursor.description else []
            rows = cursor.fetchmany(201) if columns else []
            results.append({
                "statement": index, "columns": columns,
                "rows": [[json_value(value) for value in row] for row in rows[:200]],
                "truncated": len(rows) > 200,
                "message": f"{min(len(rows), 200)} row(s)" if columns else f"{max(cursor.rowcount, 0)} affected row(s)",
            })
            cursor.close()
        changes = connection.total_changes - changed
        connection.set_authorizer(None)
        connection.commit()
        return {"results": results, "committed": True, "changes": changes, "message": "Transaction committed"}
    except sqlite3.Error as error:
        connection.set_authorizer(None)
        connection.rollback()
        raise SampleMindException(400, f"SQL failed. This submission was rolled back. {error}", "SQL_ERROR") from error
    finally:
        connection.set_authorizer(None)
        connection.set_progress_handler(None, 0)
        connection.rollback()
        connection.isolation_level = previous_isolation
        raw.close()


@router.post("")
def execute_sql(
    payload: SQLInput,
    user: AppUser = Depends(require_roles(("ADMIN",))),
    db: Session = Depends(get_db),
):
    return execute_script(db.get_bind(), payload.sql)


@router.get("/schema")
def inspect_schema(
    user: AppUser = Depends(require_roles(("ADMIN",))),
    db: Session = Depends(get_db),
):
    if db.get_bind().dialect.name != "sqlite":
        raise SampleMindException(400, "This console currently supports SQLite.", "CONSOLE_DIALECT")
    from sqlalchemy import text
    return [dict(row) for row in db.execute(text(
        "SELECT name, type, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
    )).mappings()]
