"""
Comprehensive Rigorous Test Suite for Module 1: Auth & RBAC
============================================================
Tests all positive and negative flows, edge cases, permission checks,
token validation, and database state transitions with exact output assertions.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.common.security import decode_access_token

client = TestClient(app)


def test_01_admin_login_success():
    """Verify authenticating with valid seeded admin credentials returns 200 with full claims."""
    res = client.post("/api/v1/auth/login", json={
        "username": "rajath.vs@rvce.edu.in",
        "password": "password123"
    })
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    body = res.json()
    assert body["success"] is True
    assert "data" in body
    data = body["data"]
    assert data["email"] == "rajath.vs@rvce.edu.in"
    assert data["display_name"] == "Dr. Rajath V Shanbhogue"
    assert data["role"] == "ADMIN"
    assert data["token_type"] == "bearer"
    assert data["expires_in_minutes"] > 0
    token = data["access_token"]
    assert isinstance(token, str) and len(token) > 50

    # Verify the decoded JWT claims directly
    claims = decode_access_token(token)
    assert claims is not None, "Failed to decode generated token"
    assert claims["email"] == "rajath.vs@rvce.edu.in"
    assert claims["role"] == "ADMIN"
    assert "exp" in claims
    assert "sub" in claims
    print("[PASS] Test 01: Admin login and JWT claim structure verified.")


def test_02_login_invalid_password_rejected():
    """Verify login with incorrect password returns 401 Invalid Credentials."""
    res = client.post("/api/v1/auth/login", json={
        "username": "rajath.vs@rvce.edu.in",
        "password": "completelyWrongPassword!"
    })
    assert res.status_code == 401, f"Expected 401, got {res.status_code}: {res.text}"
    body = res.json()
    assert body.get("code") == "INVALID_CREDENTIALS" or "Invalid credentials" in str(body)
    print("[PASS] Test 02: Bad password properly rejected with 401.")


def test_03_login_nonexistent_user_rejected():
    """Verify login with an unknown email returns 401 without leaking existence."""
    res = client.post("/api/v1/auth/login", json={
        "username": "ghost.researcher@rvce.edu.in",
        "password": "password123"
    })
    assert res.status_code == 401, f"Expected 401, got {res.status_code}: {res.text}"
    print("[PASS] Test 03: Non-existent user properly rejected with 401.")


def test_04_get_current_user_profile():
    """Verify /me returns the current user when given a valid token."""
    # Obtain token
    login_res = client.post("/api/v1/auth/login", json={
        "username": "rajath.vs@rvce.edu.in",
        "password": "password123"
    })
    token = login_res.json()["data"]["access_token"]

    # Request /me
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()["data"]
    assert data["email"] == "rajath.vs@rvce.edu.in"
    assert data["display_name"] == "Dr. Rajath V Shanbhogue"
    assert data["role"] == "ADMIN"
    assert data["is_active"] is True
    print("[PASS] Test 04: /me returned accurate user profile.")


def test_05_unauthenticated_requests_blocked():
    """Verify endpoints with missing or forged tokens return 401."""
    # Missing token
    res_no_token = client.get("/api/v1/auth/me")
    assert res_no_token.status_code == 401, "Missing token did not trigger 401"

    # Forged/tampered token
    res_fake_token = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer fake.tampered.token"})
    assert res_fake_token.status_code == 401, "Forged token did not trigger 401"
    print("[PASS] Test 05: Missing and forged tokens correctly blocked with 401.")


def test_06_admin_can_register_new_researcher():
    """Verify an admin can provision a new researcher and the new user can immediately log in."""
    login_res = client.post("/api/v1/auth/login", json={
        "username": "rajath.vs@rvce.edu.in",
        "password": "password123"
    })
    admin_token = login_res.json()["data"]["access_token"]

    unique_email = f"researcher_{uuid.uuid4().hex[:8]}@rvce.edu.in"
    reg_res = client.post(
        "/api/v1/auth/register",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "display_name": "Dr. Elena Vance",
            "email": unique_email,
            "password": "secureElenaPassword2026",
            "role": "RESEARCHER"
        }
    )
    assert reg_res.status_code == 201, f"Expected 201, got {reg_res.status_code}: {reg_res.text}"
    new_user_data = reg_res.json()["data"]
    assert new_user_data["email"] == unique_email
    assert new_user_data["display_name"] == "Dr. Elena Vance"
    assert new_user_data["role"] == "RESEARCHER"
    assert new_user_data["is_active"] is True

    # Now verify the newly registered researcher can authenticate directly
    new_user_login = client.post("/api/v1/auth/login", json={
        "username": unique_email,
        "password": "secureElenaPassword2026"
    })
    assert new_user_login.status_code == 200, "Newly created user failed to login"
    assert new_user_login.json()["data"]["email"] == unique_email
    print("[PASS] Test 06: New researcher registered and successfully logged in.")
    return new_user_data["user_id"], unique_email


def test_07_duplicate_email_registration_rejected():
    """Verify registering an already existing email returns 409 Conflict."""
    login_res = client.post("/api/v1/auth/login", json={
        "username": "rajath.vs@rvce.edu.in",
        "password": "password123"
    })
    admin_token = login_res.json()["data"]["access_token"]

    # Try to register with already existing admin email
    dup_res = client.post(
        "/api/v1/auth/register",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "display_name": "Duplicate Attempt",
            "email": "rajath.vs@rvce.edu.in",
            "password": "somePassword123",
            "role": "RESEARCHER"
        }
    )
    assert dup_res.status_code == 409, f"Expected 409 Conflict, got {dup_res.status_code}: {dup_res.text}"
    body = dup_res.json()
    assert body.get("code") == "DUPLICATE_ENTITY" or "already exists" in str(body) or "already registered" in str(body)
    print("[PASS] Test 07: Duplicate email properly rejected with 409 Conflict.")


def test_08_non_admin_cannot_register_users():
    """Verify that a researcher without ADMIN role receives 403 Forbidden when calling /register."""
    # Login as researcher
    researcher_login = client.post("/api/v1/auth/login", json={
        "username": "siddhanth.kj@rvce.edu.in",
        "password": "password123"
    })
    researcher_token = researcher_login.json()["data"]["access_token"]

    forbidden_res = client.post(
        "/api/v1/auth/register",
        headers={"Authorization": f"Bearer {researcher_token}"},
        json={
            "display_name": "Unauthorized User",
            "email": f"unauth_{uuid.uuid4().hex[:6]}@rvce.edu.in",
            "password": "password123",
            "role": "RESEARCHER"
        }
    )
    assert forbidden_res.status_code == 403, f"Expected 403 Forbidden, got {forbidden_res.status_code}: {forbidden_res.text}"
    print("[PASS] Test 08: Non-admin correctly forbidden (403) from creating users.")


def test_09_list_users_with_role_filtering():
    """Verify user list retrieval and filtering by role."""
    login_res = client.post("/api/v1/auth/login", json={
        "username": "rajath.vs@rvce.edu.in",
        "password": "password123"
    })
    admin_token = login_res.json()["data"]["access_token"]

    # All users
    all_res = client.get("/api/v1/auth/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert all_res.status_code == 200
    all_users = all_res.json()["data"]
    assert len(all_users) >= 5

    # Filter by RESEARCHER
    filtered_res = client.get("/api/v1/auth/users?role=RESEARCHER", headers={"Authorization": f"Bearer {admin_token}"})
    assert filtered_res.status_code == 200
    researchers = filtered_res.json()["data"]
    assert len(researchers) >= 1
    for u in researchers:
        assert u["role"] == "RESEARCHER", f"Expected RESEARCHER, got {u['role']}"
    print(f"[PASS] Test 09: User list filtering verified (Found {len(researchers)} researchers).")


def test_10_deactivate_and_reactivate_user_lifecycle():
    """Verify admin can deactivate a user, deactivated user cannot log in, and reactivation restores access."""
    # 1. Admin logs in and registers a user to test deactivation
    login_res = client.post("/api/v1/auth/login", json={
        "username": "rajath.vs@rvce.edu.in",
        "password": "password123"
    })
    admin_token = login_res.json()["data"]["access_token"]

    test_email = f"temp_{uuid.uuid4().hex[:8]}@rvce.edu.in"
    reg_res = client.post(
        "/api/v1/auth/register",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "display_name": "Temporary User",
            "email": test_email,
            "password": "tempPassword123",
            "role": "TECHNICIAN"
        }
    )
    user_id = reg_res.json()["data"]["user_id"]

    # 2. Deactivate the user
    deact_res = client.put(
        f"/api/v1/auth/users/{user_id}/status",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"is_active": False}
    )
    assert deact_res.status_code == 200
    assert deact_res.json()["data"]["is_active"] is False

    # 3. Attempt to log in with deactivated user -> must fail with 401
    deact_login = client.post("/api/v1/auth/login", json={
        "username": test_email,
        "password": "tempPassword123"
    })
    assert deact_login.status_code == 401, "Deactivated user was incorrectly allowed to log in"
    assert "deactivated" in str(deact_login.json()).lower()

    # 4. Reactivate the user
    react_res = client.put(
        f"/api/v1/auth/users/{user_id}/status",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"is_active": True}
    )
    assert react_res.status_code == 200
    assert react_res.json()["data"]["is_active"] is True

    # 5. Log in again -> must succeed
    react_login = client.post("/api/v1/auth/login", json={
        "username": test_email,
        "password": "tempPassword123"
    })
    assert react_login.status_code == 200, "Reactivated user failed to log in"
    print("[PASS] Test 10: User deactivation and reactivation lifecycle verified.")


if __name__ == "__main__":
    print("=" * 60)
    print(" Executing Rigorous Test Suite for Module 1 (Auth & RBAC)")
    print("=" * 60)
    test_01_admin_login_success()
    test_02_login_invalid_password_rejected()
    test_03_login_nonexistent_user_rejected()
    test_04_get_current_user_profile()
    test_05_unauthenticated_requests_blocked()
    test_06_admin_can_register_new_researcher()
    test_07_duplicate_email_registration_rejected()
    test_08_non_admin_cannot_register_users()
    test_09_list_users_with_role_filtering()
    test_10_deactivate_and_reactivate_user_lifecycle()
    print("=" * 60)
    print(" [ALL 10 RIGOROUS TESTS PASSED WITH 100% SUCCESS!] ")
    print("=" * 60)
