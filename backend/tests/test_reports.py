import csv
import io
from datetime import date, timedelta

from app.models import AuditLog, Role
from tests.conftest import login, make_user
from tests.test_payments import awaiting_payment, pay
from tests.test_staff import move, submitted_request

API = "/api/v1"


def admin_headers(client, db):
    return login(client, make_user(db, role=Role.admin).email)


def read_csv(resp):
    assert resp.headers["content-type"].startswith("text/csv")
    text = resp.content.decode("utf-8")
    assert text.startswith("﻿")  # BOM for Excel
    return list(csv.reader(io.StringIO(text[1:])))


def test_summary_counts_revenue_and_turnaround(client, db, student_headers):
    ref, _, staff_h = awaiting_payment(client, db, student_headers)
    pay(client, student_headers, ref)
    for to in ("payment_verified", "processing", "ready_for_pickup", "completed"):
        assert move(client, staff_h, ref, to).status_code == 200
    submitted_request(client, db, student_headers)  # still open

    h = admin_headers(client, db)
    s = client.get(f"{API}/admin/reports/summary", headers=h).json()
    t = s["totals"]
    assert t["submitted"] == 2 and t["completed"] == 1 and t["open"] == 1
    assert t["revenue"] == "100.00" and t["on_time_rate"] == 1.0 and t["avg_turnaround_days"] == 0.0
    assert s["by_document"][0] == {"code": "COE", "name": s["by_document"][0]["name"], "submitted": 2,
                                   "completed": 1, "revenue": "100.00", "avg_turnaround_days": 0.0}
    assert s["by_method"] == [{"method": "gcash", "count": 1, "amount": "100.00"}]
    assert len(s["daily"]) == 30 and s["daily"][-1]["submitted"] == 2

    old = (date.today() - timedelta(days=400)).isoformat()
    r = client.get(f"{API}/admin/reports/summary", headers=h, params={"date_from": old})
    assert r.status_code == 422
    r = client.get(f"{API}/admin/reports/summary", headers=h,
                   params={"date_from": date.today().isoformat(), "date_to": (date.today() - timedelta(days=1)).isoformat()})
    assert r.status_code == 422


def test_csv_exports_are_audited_and_injection_safe(client, db, student_headers):
    ref, _, _ = awaiting_payment(client, db, student_headers)
    pay(client, student_headers, ref, reference="=HYPERLINK(\"http://evil\")")
    h = admin_headers(client, db)

    rows = read_csv(client.get(f"{API}/admin/reports/requests.csv", headers=h))
    assert rows[0][0] == "Reference no." and rows[1][0] == ref and rows[1][2] == "awaiting_payment"
    assert len(read_csv(client.get(f"{API}/admin/reports/requests.csv", headers=h, params={"status": "completed"}))) == 1

    rows = read_csv(client.get(f"{API}/admin/reports/payments.csv", headers=h))
    assert rows[1][4] == "'=HYPERLINK(\"http://evil\")"  # neutralised for spreadsheets
    db.expire_all()
    assert db.query(AuditLog).filter_by(action="report_exported").count() == 3


def test_audit_log_viewer_filters_and_export(client, db, student, student_headers):
    ref = submitted_request(client, db, student_headers)
    h = admin_headers(client, db)

    page = client.get(f"{API}/admin/audit-logs", headers=h).json()
    assert page["total"] >= 4 and page["items"][0]["created_at"] >= page["items"][-1]["created_at"]
    actions = client.get(f"{API}/admin/audit-logs/actions", headers=h).json()
    assert "request_submitted" in actions and "login" in actions

    only = client.get(f"{API}/admin/audit-logs", headers=h, params={"action": "request_submitted"}).json()
    assert only["total"] == 1 and only["items"][0]["entity_id"] == ref
    assert only["items"][0]["actor_email"] == student.email and only["items"][0]["actor_role"] == "student"
    by_actor = client.get(f"{API}/admin/audit-logs", headers=h, params={"actor": student.student_no}).json()
    assert by_actor["total"] >= 3 and all(i["actor_id"] == student.id for i in by_actor["items"])
    assert client.get(f"{API}/admin/audit-logs", headers=h, params={"entity": ref}).json()["total"] >= 2
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    assert client.get(f"{API}/admin/audit-logs", headers=h, params={"date_from": tomorrow}).json()["total"] == 0

    rows = read_csv(client.get(f"{API}/admin/audit-logs.csv", headers=h, params={"action": "request_submitted"}))
    assert len(rows) == 2 and rows[1][1] == "request_submitted"
    db.expire_all()
    assert db.query(AuditLog).filter_by(action="audit_log_exported").count() == 1
