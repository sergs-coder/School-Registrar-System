from tests.conftest import PASSWORD, login, make_user


def test_login_with_email_or_student_number(client, student):
    assert login(client, student.email.upper())
    assert login(client, student.student_no)


def test_wrong_password_uses_error_envelope(client, student):
    r = client.post("/api/v1/auth/login", json={"identifier": student.email, "password": "nope"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "INVALID_CREDENTIALS"
    r = client.post("/api/v1/auth/login", json={"identifier": "ghost@tua.edu.ph", "password": "nope"})
    assert r.json()["error"]["code"] == "INVALID_CREDENTIALS"  # same answer: no account probing


def test_lockout_after_repeated_failures(client, student):
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"identifier": student.email, "password": "bad"})
    r = client.post("/api/v1/auth/login", json={"identifier": student.email, "password": PASSWORD})
    assert r.status_code == 423
    assert r.json()["error"]["code"] == "ACCOUNT_LOCKED"


def test_refresh_rotates_and_detects_reuse(client, student):
    login(client, student.email)
    old = client.cookies.get("srm_refresh")
    r = client.post("/api/v1/auth/refresh")
    assert r.status_code == 200 and r.json()["access_token"]
    new = client.cookies.get("srm_refresh")
    assert new and new != old

    # Replaying the rotated token revokes every session, including the new one.
    client.cookies.set("srm_refresh", old, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401
    client.cookies.set("srm_refresh", new, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_logout_revokes_refresh_token(client, student):
    login(client, student.email)
    token = client.cookies.get("srm_refresh")
    client.post("/api/v1/auth/logout")
    client.cookies.set("srm_refresh", token, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_missing_and_bad_tokens(client):
    assert client.get("/api/v1/auth/me").json()["error"]["code"] == "UNAUTHORIZED"
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer junk"})
    assert r.json()["error"]["code"] == "INVALID_TOKEN"


def test_consent_gate(client, db):
    user = make_user(db, consent=False)
    headers = login(client, user.email)
    assert client.get("/api/v1/auth/me", headers=headers).json()["consent_required"] is True
    r = client.get("/api/v1/document-types", headers=headers)
    assert r.status_code == 403 and r.json()["error"]["code"] == "CONSENT_REQUIRED"
    assert client.post("/api/v1/auth/consent", headers=headers).json()["consent_required"] is False
    assert client.get("/api/v1/document-types", headers=headers).status_code == 200


def test_change_password_validates_strength(client, student, student_headers):
    r = client.post("/api/v1/auth/change-password", headers=student_headers,
                    json={"current_password": PASSWORD, "new_password": "short"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    r = client.post("/api/v1/auth/change-password", headers=student_headers,
                    json={"current_password": PASSWORD, "new_password": "NewPassw0rd"})
    assert r.status_code == 200
    assert login(client, student.email, "NewPassw0rd")


def test_forgot_password_does_not_reveal_accounts(client, student):
    a = client.post("/api/v1/auth/forgot-password", json={"email": student.email}).json()
    b = client.post("/api/v1/auth/forgot-password", json={"email": "nobody@tua.edu.ph"}).json()
    assert a == b


def test_profile_only_updates_contact_fields(client, student_headers):
    r = client.patch("/api/v1/me/profile", headers=student_headers,
                     json={"contact_no": "09171234567", "first_name": "Hacker"})
    assert r.status_code == 200
    assert r.json()["contact_no"] == "09171234567"
    assert r.json()["first_name"] == "Test"
    r = client.patch("/api/v1/me/profile", headers=student_headers, json={"contact_no": "12345"})
    assert r.status_code == 422
