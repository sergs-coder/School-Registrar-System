import re
from datetime import date

from app.models import Role
from app.services.business_days import add_business_days
from app.services.workflow import transition
from tests.conftest import doc_id, login, make_user, pdf_upload

API = "/api/v1"


def create_coe(client, db, headers, **overrides):
    body = {"document_type_id": doc_id(db, "COE"), "purpose": "Employment", "copies": 2,
            "form_data": {"term": "1st Semester", "academic_year": "2026–2027"}, **overrides}
    r = client.post(f"{API}/requests", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_catalog_lists_active_document_types(client, student_headers):
    r = client.get(f"{API}/document-types", headers=student_headers)
    assert r.status_code == 200
    names = [d["name"] for d in r.json()]
    assert "Transcript of Records (TOR)" in names and len(names) == 11
    assert client.get(f"{API}/document-types/transcript-of-records", headers=student_headers).status_code == 200


def test_quote_includes_courier_fee(client, db, student_headers):
    r = client.post(f"{API}/requests/quote", headers=student_headers, json={
        "document_type_id": doc_id(db, "TOR"), "copies": 2, "delivery_method": "courier", "region": "provincial"})
    body = r.json()
    assert body["fee_total"] == "850.00"  # 2 × 300 + 250 provincial courier
    assert len(body["fee_breakdown"]) == 2


def test_draft_submit_flow(client, db, student_headers):
    draft = create_coe(client, db, student_headers)
    assert re.fullmatch(r"SRM-\d{4}-\d{6}", draft["reference_no"])
    assert draft["status"] == "draft" and draft["fee_total"] == "200.00"
    ref = draft["reference_no"]

    # Missing required valid ID -> submission blocked with a field-level error.
    r = client.post(f"{API}/requests/{ref}/submit", headers=student_headers)
    assert r.status_code == 422
    assert any(d["field"] == "attachments.valid_id" for d in r.json()["error"]["details"])

    r = client.post(f"{API}/requests/{ref}/attachments", headers=student_headers,
                    data={"requirement_key": "valid_id"}, files=pdf_upload())
    assert r.status_code == 201 and len(r.json()["attachments"]) == 1

    r = client.post(f"{API}/requests/{ref}/submit", headers=student_headers)
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["status"] == "submitted"
    assert detail["estimated_release_date"]
    assert detail["history"][-1]["to_status"] == "submitted"
    assert "cancel" in detail["allowed_actions"] and "edit" not in detail["allowed_actions"]

    # Locked once submitted.
    assert client.patch(f"{API}/requests/{ref}", headers=student_headers, json={"copies": 1}).status_code == 409

    r = client.post(f"{API}/requests/{ref}/cancel", headers=student_headers, json={"remarks": "No longer needed"})
    assert r.json()["status"] == "cancelled"
    assert client.post(f"{API}/requests/{ref}/cancel", headers=student_headers, json={}).status_code == 409


def test_reference_numbers_are_sequential_and_unique(client, db, student_headers):
    refs = [create_coe(client, db, student_headers)["reference_no"] for _ in range(3)]
    assert len(set(refs)) == 3
    nums = [int(r.rsplit("-", 1)[1]) for r in refs]
    assert nums == sorted(nums) and nums[-1] - nums[0] == 2


def test_required_form_fields_are_enforced_on_submit(client, db, student_headers):
    draft = create_coe(client, db, student_headers, form_data={"term": "1st Semester"})
    ref = draft["reference_no"]
    client.post(f"{API}/requests/{ref}/attachments", headers=student_headers,
                data={"requirement_key": "valid_id"}, files=pdf_upload())
    r = client.post(f"{API}/requests/{ref}/submit", headers=student_headers)
    assert any(d["field"] == "form_data.academic_year" for d in r.json()["error"]["details"])


def test_invalid_select_value_rejected(client, db, student_headers):
    r = client.post(f"{API}/requests", headers=student_headers, json={
        "document_type_id": doc_id(db, "COE"), "form_data": {"term": "Winter"}})
    assert r.status_code == 422


def test_upload_rejects_disguised_and_oversized_files(client, db, student_headers):
    ref = create_coe(client, db, student_headers)["reference_no"]
    url = f"{API}/requests/{ref}/attachments"
    fake = {"file": ("id.pdf", b"MZ\x90\x00 not really a pdf", "application/pdf")}
    r = client.post(url, headers=student_headers, data={"requirement_key": "valid_id"}, files=fake)
    assert r.status_code == 415 and r.json()["error"]["code"] == "FILE_TYPE_NOT_ALLOWED"
    exe = {"file": ("id.exe", b"%PDF-1.4 sneaky", "application/octet-stream")}
    assert client.post(url, headers=student_headers, data={"requirement_key": "valid_id"}, files=exe).status_code == 415
    big = {"file": ("id.pdf", b"%PDF-" + b"0" * (6 * 1024 * 1024), "application/pdf")}
    assert client.post(url, headers=student_headers, data={"requirement_key": "valid_id"}, files=big).status_code == 413
    unknown = client.post(url, headers=student_headers, data={"requirement_key": "nope"}, files=pdf_upload())
    assert unknown.status_code == 422


def test_uploaded_files_are_encrypted_at_rest(client, db, student_headers, tmp_path):
    ref = create_coe(client, db, student_headers)["reference_no"]
    r = client.post(f"{API}/requests/{ref}/attachments", headers=student_headers,
                    data={"requirement_key": "valid_id"}, files=pdf_upload())
    att_id = r.json()["attachments"][0]["id"]
    stored = list((tmp_path / "uploads").rglob("*.bin"))
    assert stored and not stored[0].read_bytes().startswith(b"%PDF")
    dl = client.get(f"{API}/attachments/{att_id}/download", headers=student_headers)
    assert dl.status_code == 200 and dl.content.startswith(b"%PDF")


def test_students_cannot_see_each_others_requests(client, db, student_headers):
    ref_detail = create_coe(client, db, student_headers)
    ref = ref_detail["reference_no"]
    client.post(f"{API}/requests/{ref}/attachments", headers=student_headers,
                data={"requirement_key": "valid_id"}, files=pdf_upload())
    att_id = client.get(f"{API}/requests/{ref}", headers=student_headers).json()["attachments"][0]["id"]

    other = make_user(db)
    other_headers = login(client, other.email)
    assert client.get(f"{API}/requests/{ref}", headers=other_headers).status_code == 404
    assert client.post(f"{API}/requests/{ref}/cancel", headers=other_headers, json={}).status_code == 404
    assert client.get(f"{API}/attachments/{att_id}/download", headers=other_headers).status_code == 404
    assert client.get(f"{API}/requests", headers=other_headers).json()["total"] == 0


def test_staff_cannot_use_student_endpoints(client, db):
    staff = make_user(db, role=Role.staff)
    headers = login(client, staff.email)
    assert client.get(f"{API}/requests", headers=headers).status_code == 403


def test_needs_correction_then_resubmit(client, db, student, student_headers):
    ref = create_coe(client, db, student_headers)["reference_no"]
    client.post(f"{API}/requests/{ref}/attachments", headers=student_headers,
                data={"requirement_key": "valid_id"}, files=pdf_upload())
    client.post(f"{API}/requests/{ref}/submit", headers=student_headers)

    from app.models import Request
    staff = make_user(db, role=Role.staff)
    db.expire_all()
    req = db.query(Request).filter_by(reference_no=ref).one()
    transition(db, req, req.status.__class__.under_review, staff)
    transition(db, req, req.status.__class__.needs_correction, staff, "Blurry ID")
    db.commit()

    detail = client.get(f"{API}/requests/{ref}", headers=student_headers).json()
    assert detail["status"] == "needs_correction"
    assert detail["latest_remarks"] == "Blurry ID"
    assert {"edit", "resubmit"} <= set(detail["allowed_actions"])
    assert detail["history"][-1]["actor_name"] == "Registrar's Office"  # staff names hidden from students

    r = client.post(f"{API}/requests/{ref}/attachments", headers=student_headers,
                    data={"requirement_key": "valid_id"}, files=pdf_upload("clear.pdf"))
    assert [a["original_filename"] for a in r.json()["attachments"]] == ["clear.pdf"]  # replaced, not duplicated
    r = client.post(f"{API}/requests/{ref}/resubmit", headers=student_headers, json={"remarks": "Clearer copy"})
    assert r.json()["status"] == "resubmitted"

    notes = client.get(f"{API}/requests/{ref}", headers=student_headers).json()
    assert len(notes["history"]) == 4


def test_drafts_can_be_deleted_but_not_submitted_requests(client, db, student_headers):
    ref = create_coe(client, db, student_headers)["reference_no"]
    assert client.delete(f"{API}/requests/{ref}", headers=student_headers).status_code == 204
    assert client.get(f"{API}/requests/{ref}", headers=student_headers).status_code == 404


def test_courier_requires_address_and_allowed_doc(client, db, student_headers):
    r = client.post(f"{API}/requests", headers=student_headers, json={
        "document_type_id": doc_id(db, "HD"), "purpose": "Transfer to another school", "delivery_method": "courier",
        "form_data": {"receiving_school": "UP", "reason": "Moving"}})
    ref = r.json()["reference_no"]
    for key in ("valid_id", "clearance"):
        client.post(f"{API}/requests/{ref}/attachments", headers=student_headers,
                    data={"requirement_key": key}, files=pdf_upload())
    r = client.post(f"{API}/requests/{ref}/submit", headers=student_headers)
    fields = {d["field"] for d in r.json()["error"]["details"]}
    assert "delivery_method" in fields


def test_business_days_skip_weekends_and_holidays():
    friday = date(2026, 10, 30)
    # Mon Nov 2 is a holiday, so 2 business days from Fri Oct 30 -> Wed Nov 4.
    assert add_business_days(friday, 2, {date(2026, 11, 2)}) == date(2026, 11, 4)
    assert add_business_days(friday, 1, set()) == date(2026, 11, 2)
