from datetime import date, timedelta

from app.models import AuditLog, RefreshToken, Role, User
from tests.conftest import PASSWORD, doc_id, login, make_user

API = "/api/v1"


def admin_headers(client, db):
    admin = make_user(db, role=Role.admin)
    return admin, login(client, admin.email)


def doc_body(**overrides):
    body = {
        "code": "CAV", "slug": "cav-authentication", "name": "CAV / Authentication", "description": "For abroad.",
        "category": "certificate", "base_fee": "350.00", "fee_per_copy": True, "max_copies": 3, "processing_days": 5,
        "requires_payment": True, "allow_courier": True, "allow_edocument": False,
        "purposes": ["Work abroad", "Work abroad", " "],
        "required_fields": [{"key": "country", "label": "Destination country", "type": "text", "required": True}],
        "required_attachments": [{"key": "passport", "label": "Passport bio page", "accept": ["pdf", "jpg"]}],
        "instructions": "", "is_active": True, "sort_order": 20,
    }
    return {**body, **overrides}


def test_admin_endpoints_are_admin_only(client, db, student_headers):
    staff = make_user(db, role=Role.staff)
    h = login(client, staff.email)
    for path in ("/admin/document-types", "/admin/settings", "/admin/users", "/admin/audit-logs", "/admin/reports/summary"):
        assert client.get(f"{API}{path}", headers=h).status_code == 403
        assert client.get(f"{API}{path}", headers=student_headers).status_code == 403


def test_document_type_crud_and_validation(client, db, student_headers):
    _, h = admin_headers(client, db)
    r = client.post(f"{API}/admin/document-types", headers=h, json=doc_body())
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["purposes"] == ["Work abroad"] and created["base_fee"] == "350.00"
    assert client.post(f"{API}/admin/document-types", headers=h, json=doc_body()).status_code == 409

    bad = doc_body(code="X2", slug="x2", required_fields=[
        {"key": "a", "label": "A", "type": "select", "options": []},
    ])
    assert client.post(f"{API}/admin/document-types", headers=h, json=bad).status_code == 422
    dupes = doc_body(code="X3", slug="x3", required_attachments=[{"key": "id", "label": "A"}, {"key": "id", "label": "B"}])
    assert client.post(f"{API}/admin/document-types", headers=h, json=dupes).status_code == 422

    # Hiding it removes it from the student catalog but keeps it for admins.
    r = client.put(f"{API}/admin/document-types/{created['id']}", headers=h, json=doc_body(is_active=False, base_fee="400"))
    assert r.status_code == 200 and r.json()["is_active"] is False and r.json()["base_fee"] == "400.00"
    names = [d["name"] for d in client.get(f"{API}/document-types", headers=student_headers).json()]
    assert "CAV / Authentication" not in names
    assert any(d["code"] == "CAV" for d in client.get(f"{API}/admin/document-types", headers=h).json())
    db.expire_all()
    log = db.query(AuditLog).filter_by(action="document_type_updated").one()
    assert set(log.meta["fields"]) == {"is_active", "base_fee"}


def test_fee_change_does_not_touch_submitted_requests(client, db, student_headers):
    from tests.test_staff import submitted_request

    _, h = admin_headers(client, db)
    ref = submitted_request(client, db, student_headers)
    coe = next(d for d in client.get(f"{API}/admin/document-types", headers=h).json() if d["code"] == "COE")
    body = {k: coe[k] for k in doc_body()} | {"base_fee": "999.00"}
    assert client.put(f"{API}/admin/document-types/{coe['id']}", headers=h, json=body).status_code == 200
    assert client.get(f"{API}/requests/{ref}", headers=student_headers).json()["fee_total"] == "100.00"
    quote = client.post(f"{API}/requests/quote", headers=student_headers,
                        json={"document_type_id": doc_id(db, "COE"), "copies": 1}).json()
    assert quote["fee_total"] == "999.00"


def test_settings_round_trip_and_feed_fees(client, db, student_headers):
    _, h = admin_headers(client, db)
    current = client.get(f"{API}/admin/settings", headers=h).json()
    assert current["courier_fee_metro"] == "150.00"
    r = client.put(f"{API}/admin/settings", headers=h, json={**current, "courier_fee_metro": "175.50"})
    assert r.status_code == 200 and r.json()["courier_fee_metro"] == "175.50"
    quote = client.post(f"{API}/requests/quote", headers=student_headers, json={
        "document_type_id": doc_id(db, "TOR"), "copies": 1, "delivery_method": "courier", "region": "metro"}).json()
    assert quote["fee_total"] == "475.50"
    bad = {**current, "registrar_contact": {**current["registrar_contact"], "email": "not-an-email"}}
    assert client.put(f"{API}/admin/settings", headers=h, json=bad).status_code == 422


def test_holidays_shift_estimates_and_reject_duplicates(client, db):
    _, h = admin_headers(client, db)
    day = date.today() + timedelta(days=40)
    r = client.post(f"{API}/admin/holidays", headers=h, json={"date": day.isoformat(), "name": "Foundation Day"})
    assert r.status_code == 201
    assert client.post(f"{API}/admin/holidays", headers=h, json={"date": day.isoformat(), "name": "Again"}).status_code == 409
    assert [x["name"] for x in client.get(f"{API}/admin/holidays", headers=h, params={"year": day.year}).json()] == ["Foundation Day"]
    assert client.delete(f"{API}/admin/holidays/{r.json()['id']}", headers=h).status_code == 204
    assert client.get(f"{API}/admin/holidays", headers=h).json() == []


def test_announcements_states_and_public_feed(client, db):
    _, h = admin_headers(client, db)
    future = (date.today() + timedelta(days=5)).isoformat() + "T00:00:00Z"
    live = client.post(f"{API}/admin/announcements", headers=h, json={"title": "Closed Friday", "body": "Holiday."}).json()
    scheduled = client.post(f"{API}/admin/announcements", headers=h,
                            json={"title": "Later notice", "body": "Soon.", "starts_at": future}).json()
    assert live["state"] == "live" and scheduled["state"] == "scheduled"
    assert [a["title"] for a in client.get(f"{API}/announcements/active").json()] == ["Closed Friday"]
    r = client.put(f"{API}/admin/announcements/{live['id']}", headers=h,
                   json={"title": "Closed Friday", "body": "Holiday.", "is_active": False})
    assert r.json()["state"] == "hidden"
    assert client.get(f"{API}/announcements/active").json() == []
    bad = {"title": "Bad window", "body": "x", "starts_at": future, "ends_at": "2020-01-01T00:00:00Z"}
    assert client.post(f"{API}/admin/announcements", headers=h, json=bad).status_code == 422
    assert client.delete(f"{API}/admin/announcements/{scheduled['id']}", headers=h).status_code == 204


def test_create_staff_with_setup_link(client, db):
    _, h = admin_headers(client, db)
    body = {"email": "New.Staff@tua.edu.ph", "first_name": "Rosa", "last_name": "Lim", "employee_no": "EMP-0099",
            "position": "Records Officer"}
    r = client.post(f"{API}/admin/users", headers=h, json=body)
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["user"]["email"] == "new.staff@tua.edu.ph" and out["user"]["role"] == "staff"
    token = out["setup_link"].split("token=")[1]  # development only
    assert client.post(f"{API}/auth/reset-password", json={"token": token, "new_password": "Welcome123"}).status_code == 200
    assert client.post(f"{API}/auth/login", json={"identifier": "new.staff@tua.edu.ph", "password": "Welcome123"}).status_code == 200
    assert client.post(f"{API}/admin/users", headers=h, json=body).status_code == 409
    assert client.post(f"{API}/admin/users", headers=h, json={**body, "email": "other@tua.edu.ph"}).status_code == 409


def test_deactivate_unlock_and_guards(client, db, student):
    admin, h = admin_headers(client, db)
    staff = make_user(db, role=Role.staff)
    staff_h = login(client, staff.email)

    r = client.patch(f"{API}/admin/users/{staff.id}", headers=h, json={"is_active": False})
    assert r.status_code == 200 and r.json()["user"]["is_active"] is False
    assert client.get(f"{API}/staff/dashboard", headers=staff_h).status_code == 401  # cut off immediately
    db.expire_all()
    assert db.query(RefreshToken).filter_by(user_id=staff.id, revoked_at=None).count() == 0

    # Self-protection and last-admin rule.
    assert client.patch(f"{API}/admin/users/{admin.id}", headers=h, json={"is_active": False}).json()["error"]["code"] == "SELF_LOCKOUT"
    other_admin = make_user(db, role=Role.admin)
    assert client.patch(f"{API}/admin/users/{other_admin.id}", headers=h, json={"role": "staff"}).status_code == 200
    assert client.patch(f"{API}/admin/users/{admin.id}", headers=h, json={"role": "staff"}).status_code == 409
    assert client.patch(f"{API}/admin/users/{student.id}", headers=h, json={"role": "staff"}).json()["error"]["code"] == "STUDENT_RECORD"

    for _ in range(5):
        client.post(f"{API}/auth/login", json={"identifier": student.email, "password": "wrong-password1"})
    rows = client.get(f"{API}/admin/users", headers=h, params={"state": "locked"}).json()
    assert [u["id"] for u in rows["items"]] == [student.id]
    assert client.post(f"{API}/admin/users/{student.id}/unlock", headers=h).json()["user"]["is_locked"] is False
    assert client.post(f"{API}/auth/login", json={"identifier": student.email, "password": PASSWORD}).status_code == 200


def test_user_search_and_password_link(client, db, student):
    _, h = admin_headers(client, db)
    page = client.get(f"{API}/admin/users", headers=h, params={"q": student.student_no}).json()
    assert page["total"] == 1 and page["items"][0]["program"]
    assert client.get(f"{API}/admin/users", headers=h, params={"role": "admin"}).json()["total"] == 1
    r = client.post(f"{API}/admin/users/{student.id}/send-password-link", headers=h)
    assert r.status_code == 200 and "reset-password?token=" in r.json()["setup_link"]
    db.expire_all()
    assert db.query(User).get(student.id).password_hash  # unchanged until the student uses the link


def test_saving_unchanged_document_type_is_not_audited(client, db):
    _, h = admin_headers(client, db)
    created = client.post(f"{API}/admin/document-types", headers=h, json=doc_body()).json()
    assert client.put(f"{API}/admin/document-types/{created['id']}", headers=h, json=doc_body()).status_code == 200
    db.expire_all()
    assert db.query(AuditLog).filter_by(action="document_type_updated").count() == 0
