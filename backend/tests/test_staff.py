from app.models import Notification, Request, Role
from tests.conftest import doc_id, login, make_user, pdf_upload

API = "/api/v1"


def submitted_request(client, db, headers, code="COE"):
    body = {"document_type_id": doc_id(db, code), "purpose": "Employment", "copies": 1,
            "form_data": {"term": "1st Semester", "academic_year": "2026–2027"}}
    ref = client.post(f"{API}/requests", json=body, headers=headers).json()["reference_no"]
    client.post(f"{API}/requests/{ref}/attachments", headers=headers, data={"requirement_key": "valid_id"}, files=pdf_upload())
    r = client.post(f"{API}/requests/{ref}/submit", headers=headers)
    assert r.status_code == 200, r.text
    return ref


def staff_headers(client, db):
    staff = make_user(db, role=Role.staff)
    return staff, login(client, staff.email)


def move(client, headers, ref, to, remarks=None, **extra):
    return client.post(f"{API}/staff/requests/{ref}/transition", headers=headers,
                       json={"to_status": to, "remarks": remarks, **extra})


def test_students_cannot_use_staff_endpoints(client, student_headers):
    assert client.get(f"{API}/staff/requests", headers=student_headers).status_code == 403
    assert client.get(f"{API}/staff/dashboard", headers=student_headers).status_code == 403


def test_full_happy_path_with_notifications(client, db, student, student_headers):
    ref = submitted_request(client, db, student_headers)
    staff, h = staff_headers(client, db)

    r = move(client, h, ref, "under_review")
    assert r.status_code == 200 and r.json()["status"] == "under_review"
    assert r.json()["assigned_to"]["id"] == staff.staff.id  # auto-assigned to the reviewer
    targets = {t["to_status"] for t in r.json()["transitions"]}
    assert "awaiting_payment" in targets and "processing" not in targets  # fee is due

    assert move(client, h, ref, "approve").json()["status"] == "awaiting_payment"
    for to in ("payment_verified", "processing", "ready_for_pickup", "completed"):
        r = move(client, h, ref, to)
        assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["status"] == "completed" and detail["completed_at"]
    assert [h_["to_status"] for h_ in detail["history"]][-1] == "completed"

    notes = client.get(f"{API}/notifications", headers=student_headers).json()
    assert notes["total"] == 7  # submitted + 6 staff moves
    assert notes["items"][0]["reference_no"] == ref
    assert client.get(f"{API}/notifications/unread-count", headers=student_headers).json()["unread"] == 7
    client.post(f"{API}/notifications/{notes['items'][0]['id']}/read", headers=student_headers)
    assert client.get(f"{API}/notifications/unread-count", headers=student_headers).json()["unread"] == 6
    assert client.post(f"{API}/notifications/read-all", headers=student_headers).json()["unread"] == 0


def test_free_document_skips_payment(client, db, student_headers):
    body = {"document_type_id": doc_id(db, "SHF"), "purpose": "Shift to another program",
            "form_data": {"new_program": "BSCS", "effective_term": "1st Semester", "reason": "Interest"}}
    ref = client.post(f"{API}/requests", json=body, headers=student_headers).json()["reference_no"]
    client.post(f"{API}/requests/{ref}/submit", headers=student_headers)
    _, h = staff_headers(client, db)
    move(client, h, ref, "under_review")
    assert move(client, h, ref, "approve").json()["status"] == "processing"


def test_invalid_moves_and_required_remarks(client, db, student_headers):
    ref = submitted_request(client, db, student_headers)
    _, h = staff_headers(client, db)
    r = move(client, h, ref, "completed")
    assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_TRANSITION"
    move(client, h, ref, "under_review")
    r = move(client, h, ref, "needs_correction")
    assert r.status_code == 422 and r.json()["error"]["code"] == "REMARKS_REQUIRED"
    assert move(client, h, ref, "needs_correction", "Blurry ID").json()["latest_remarks"] == "Blurry ID"


def test_stale_version_is_rejected(client, db, student_headers):
    ref = submitted_request(client, db, student_headers)
    _, h = staff_headers(client, db)
    version = client.get(f"{API}/staff/requests/{ref}", headers=h).json()["version"]
    assert move(client, h, ref, "under_review", version=version).status_code == 200
    r = move(client, h, ref, "rejected", "Duplicate", version=version)
    assert r.status_code == 409 and r.json()["error"]["code"] == "STALE_REQUEST"


def test_internal_notes_hidden_from_students(client, db, student_headers):
    ref = submitted_request(client, db, student_headers)
    _, h = staff_headers(client, db)
    r = client.post(f"{API}/staff/requests/{ref}/notes", headers=h, json={"remarks": "Check with Accounting first"})
    assert r.json()["history"][-1]["is_internal"] is True
    student_view = client.get(f"{API}/requests/{ref}", headers=student_headers).json()
    assert all(not x["is_internal"] for x in student_view["history"])
    assert "Check with Accounting" not in str(student_view)


def test_bulk_transition_reports_per_item(client, db, student_headers):
    a = submitted_request(client, db, student_headers)
    b = submitted_request(client, db, student_headers)
    _, h = staff_headers(client, db)
    move(client, h, b, "under_review")
    r = client.post(f"{API}/staff/requests/bulk-transition", headers=h,
                    json={"refs": [a, b, "SRM-0000-000000"], "to_status": "under_review"})
    results = {x["reference_no"]: x for x in r.json()}
    assert results[a]["ok"] and results[a]["status"] == "under_review"
    assert not results[b]["ok"] and not results["SRM-0000-000000"]["ok"]


def test_queue_filters_sort_and_hides_drafts(client, db, student_headers):
    ref = submitted_request(client, db, student_headers)
    draft = client.post(f"{API}/requests", headers=student_headers,
                        json={"document_type_id": doc_id(db, "COE")}).json()["reference_no"]
    _, h = staff_headers(client, db)
    page = client.get(f"{API}/staff/requests", headers=h).json()
    refs = [i["reference_no"] for i in page["items"]]
    assert ref in refs and draft not in refs
    assert client.get(f"{API}/staff/requests/{draft}", headers=h).status_code == 404

    assert client.get(f"{API}/staff/requests", headers=h, params={"q": ref}).json()["total"] == 1
    assert client.get(f"{API}/staff/requests", headers=h, params={"status": "completed"}).json()["total"] == 0
    assert client.get(f"{API}/staff/requests", headers=h, params={"assigned": "unassigned"}).json()["total"] == 1
    assert client.get(f"{API}/staff/requests", headers=h, params={"sort": "nope"}).status_code == 422
    assert client.get(f"{API}/staff/requests", headers=h, params={"sort": "-student"}).status_code == 200


def test_staff_view_is_audited_and_dashboard(client, db, student_headers):
    ref = submitted_request(client, db, student_headers)
    _, h = staff_headers(client, db)
    client.get(f"{API}/staff/requests/{ref}", headers=h)
    from app.models import AuditLog
    db.expire_all()
    assert db.query(AuditLog).filter_by(action="request_viewed", entity_id=ref).count() == 1

    dash = client.get(f"{API}/staff/dashboard", headers=h).json()
    counts = {c["status"]: c["count"] for c in dash["counts"]}
    assert counts["submitted"] == 1 and dash["active_total"] == 1 and dash["submitted_today"] == 1
    assert len(dash["daily_submissions"]) == 14


def test_assign_and_attachment_review(client, db, student_headers):
    ref = submitted_request(client, db, student_headers)
    staff, h = staff_headers(client, db)
    r = client.post(f"{API}/staff/requests/{ref}/assign", headers=h, json={"staff_id": staff.staff.id})
    assert r.json()["assigned_to"]["full_name"] == staff.staff.full_name
    att = r.json()["attachments"][0]["id"]
    r = client.patch(f"{API}/staff/attachments/{att}", headers=h, json={"review_status": "accepted"})
    assert r.json()["attachments"][0]["review_status"] == "accepted"
    assert client.post(f"{API}/staff/requests/{ref}/assign", headers=h, json={"staff_id": None}).json()["assigned_to"] is None
