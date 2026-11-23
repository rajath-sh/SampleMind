"""Relational SQL terminal with Role-Based Access Control and MySQL 8.0 compliance (VTU / RVCE DBMS Lab)."""
import base64
import re
import sqlite3
import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.common import AppUser, SampleMindException, get_db, get_current_user

router = APIRouter(prefix="/api/v1/sql-console", tags=["SQL Testing"])

# Role permissions and simple numeric passkeys requested by user
ROLE_PERMISSIONS = {
    "1": {
        "role": "ADMIN",
        "name": "Administrator (DBA)",
        "allowed": ["*"],
        "denied": [],
        "description": "Full DBA control: DDL (CREATE, ALTER, DROP, TRUNCATE), DML (SELECT, INSERT, UPDATE, DELETE), DCL, TCL.",
    },
    "2": {
        "role": "RESEARCHER",
        "name": "Researcher / Data Scientist",
        "allowed": ["SELECT", "WITH", "EXPLAIN", "DESCRIBE", "DESC", "SHOW"],
        "denied": ["DROP", "ALTER", "TRUNCATE", "DELETE", "INSERT", "UPDATE", "GRANT", "REVOKE", "CREATE"],
        "description": "Analytical queries: SELECT, Complex Multi-table JOINs, CTEs, Aggregates, Group By, Subqueries.",
    },
    "3": {
        "role": "TECHNICIAN",
        "name": "Lab Technician / Operator",
        "allowed": ["SELECT", "INSERT", "UPDATE", "START", "BEGIN", "COMMIT", "ROLLBACK", "DESCRIBE", "DESC", "SHOW"],
        "denied": ["DROP", "ALTER", "TRUNCATE", "DELETE", "GRANT", "REVOKE", "CREATE"],
        "description": "Operational records: SELECT, INSERT, UPDATE, Transactions. Dropping tables or schema modification prohibited.",
    },
    "4": {
        "role": "GUEST",
        "name": "Guest Auditor / Student",
        "allowed": ["SELECT", "DESCRIBE", "DESC", "SHOW"],
        "denied": ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE", "GRANT", "REVOKE"],
        "description": "Read-only inspection: SELECT queries only. Data mutations and schema changes prohibited.",
    },
}


class SQLInput(BaseModel):
    sql: str = Field(min_length=1, max_length=50000)
    passkey: str | None = Field(default="1", max_length=50)


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


def execute_script(engine, script: str, passkey: str = "1") -> dict:
    # Resolve role authorization based on entered passkey
    passkey_clean = (passkey or "1").strip()
    role_info = ROLE_PERMISSIONS.get(passkey_clean)
    if not role_info:
        # Fallback to Admin if key 1 or default, else restrict to Guest
        role_info = ROLE_PERMISSIONS.get("1") if passkey_clean == "1" else ROLE_PERMISSIONS.get("4")

    statements = split_statements(script)
    if not statements:
        raise SampleMindException(400, "Enter a valid SQL statement.", "EMPTY_SQL")
    if len(statements) > 100:
        raise SampleMindException(400, "Run at most 100 statements per submission.", "SQL_LIMIT")

    # Validate each statement against Role Permissions
    for statement in statements:
        trimmed = statement.strip()
        first_token = trimmed.split()[0].upper() if trimmed else ""
        # Check explicit denied list
        if any(first_token == denied_cmd for denied_cmd in role_info["denied"]):
            raise SampleMindException(
                403,
                f"Access Denied: Role '{role_info['name']}' (Passkey: {passkey_clean}) is not authorized to execute '{first_token}' statements. "
                f"Full DBA authorization (Passkey: 1) is required for {first_token}.",
                "PERMISSION_DENIED"
            )
        # Check whitelist if not wildcard
        if "*" not in role_info["allowed"] and first_token not in role_info["allowed"]:
            raise SampleMindException(
                403,
                f"Access Denied: Statement '{first_token}' is not permitted for role '{role_info['name']}' (Passkey: {passkey_clean}). "
                f"Permitted operations: {', '.join(role_info['allowed'])}.",
                "PERMISSION_DENIED"
            )

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
            cmd_upper = statement.lstrip().upper().rstrip(";").strip()

            # 1. Transaction handling
            if cmd_upper in ("BEGIN", "BEGIN TRANSACTION", "BEGIN IMMEDIATE", "BEGIN EXCLUSIVE", "START TRANSACTION"):
                results.append({"statement": index, "message": "Transaction active (START TRANSACTION)", "columns": [], "rows": []})
                continue
            if cmd_upper in ("COMMIT", "END", "END TRANSACTION", "COMMIT TRANSACTION"):
                if index != len(statements):
                    raise sqlite3.OperationalError("COMMIT must be the last statement in a submission.")
                results.append({"statement": index, "message": "Commit requested", "columns": [], "rows": []})
                continue
            if cmd_upper in ("ROLLBACK", "ROLLBACK TRANSACTION"):
                if index != len(statements):
                    raise sqlite3.OperationalError("ROLLBACK must be the last statement in a submission.")
                connection.set_authorizer(None)
                connection.rollback()
                return {"results": results, "committed": False, "changes": 0, "message": "Transaction rolled back"}

            if not connection.in_transaction:
                raise sqlite3.OperationalError("Transaction ended before the submission completed.")

            # 2. MySQL compatibility translations (RVCE / VTU DBMS Lab compliance)
            # SHOW TABLES / SHOW FULL TABLES
            if cmd_upper in ("SHOW TABLES", "SHOW FULL TABLES"):
                cursor = connection.execute(
                    "SELECT name AS Tables_in_samplemind FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
                )
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                results.append({
                    "statement": index,
                    "columns": columns,
                    "rows": [[row[0]] for row in rows],
                    "truncated": False,
                    "message": f"{len(rows)} table(s) in database",
                })
                cursor.close()
                continue

            # SHOW DATABASES
            if cmd_upper == "SHOW DATABASES":
                results.append({
                    "statement": index,
                    "columns": ["Database"],
                    "rows": [["samplemind_lims"]],
                    "truncated": False,
                    "message": "1 row in set (MySQL 8.0)",
                })
                continue

            # DESCRIBE <table> / DESC <table> / SHOW COLUMNS FROM <table>
            desc_match = re.match(r"^(?:DESCRIBE|DESC|SHOW\s+COLUMNS\s+FROM)\s+[`\"']?([a-zA-Z0-9_]+)[`\"']?$", cmd_upper)
            if desc_match:
                table_target = desc_match.group(1)
                cursor = connection.execute(f"PRAGMA table_info({table_target})")
                pragma_rows = cursor.fetchall()
                cursor.close()

                if not pragma_rows:
                    raise sqlite3.OperationalError(f"Table 'samplemind.{table_target}' doesn't exist.")

                columns = ["Field", "Type", "Null", "Key", "Default", "Extra"]
                mysql_rows = []
                for pr in pragma_rows:
                    field_name = pr[1]
                    field_type = pr[2] or "VARCHAR(255)"
                    is_null = "NO" if pr[3] else "YES"
                    is_key = "PRI" if pr[5] else ""
                    default_val = pr[4]
                    extra = "auto_increment" if pr[5] and "INT" in field_type.upper() else ""
                    mysql_rows.append([field_name, field_type, is_null, is_key, default_val, extra])

                results.append({
                    "statement": index,
                    "columns": columns,
                    "rows": mysql_rows,
                    "truncated": False,
                    "message": f"{len(mysql_rows)} column(s) described",
                })
                continue

            # Standard statement execution
            cursor = connection.execute(statement)
            columns = [column[0] for column in cursor.description] if cursor.description else []
            rows = cursor.fetchmany(201) if columns else []
            results.append({
                "statement": index,
                "columns": columns,
                "rows": [[json_value(value) for value in row] for row in rows[:200]],
                "truncated": len(rows) > 200,
                "message": f"{min(len(rows), 200)} row(s) in set" if columns else f"{max(cursor.rowcount, 0)} row(s) affected",
            })
            cursor.close()

        changes = connection.total_changes - changed
        connection.set_authorizer(None)
        connection.commit()
        return {
            "results": results,
            "committed": True,
            "changes": changes,
            "message": f"Query OK, transaction committed ({role_info['name']})",
            "role": role_info["role"],
            "role_name": role_info["name"],
        }
    except sqlite3.Error as error:
        connection.set_authorizer(None)
        connection.rollback()
        # Clean any engine-internal mentions from error string
        clean_error = str(error).replace("sqlite3.", "").replace("sqlite", "mysql")
        raise SampleMindException(400, f"MySQL Execution Error: {clean_error}. Submission rolled back.", "SQL_ERROR") from error
    finally:
        connection.set_authorizer(None)
        connection.set_progress_handler(None, 0)
        connection.rollback()
        connection.isolation_level = previous_isolation
        raw.close()


@router.post("")
def execute_sql(
    payload: SQLInput,
    user: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return execute_script(db.get_bind(), payload.sql, payload.passkey)


@router.get("/schema")
def inspect_schema(
    user: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from sqlalchemy import text
    return [dict(row) for row in db.execute(text(
        "SELECT name, type, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
    )).mappings()]


@router.get("/roles")
def get_sql_roles(
    user: AppUser = Depends(get_current_user),
):
    """Returns the available RBAC roles, passkeys, and permitted command matrix."""
    return {
        "roles": [
            {
                "passkey": key,
                "role": info["role"],
                "name": info["name"],
                "description": info["description"],
                "allowed": info["allowed"],
                "denied": info["denied"],
            }
            for key, info in ROLE_PERMISSIONS.items()
        ]
    }
