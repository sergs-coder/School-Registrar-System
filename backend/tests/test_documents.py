import io

from pypdf import PdfReader

from app.models import AuditLog, DocumentType, IssuedDocument
from app.seed.seed import sample_pdf
from tests.conftest import login, make_user
from tests.test_staff import move, staff_headers, submitted_request

API = "/api/v1"


def to_processing(client, db, student_headers, code="COE"):
    ref = submitted_request(client, db, student_headers, code)
    _, h = staff_headers(client, db)
    for to in ("under_review", "approve", "payment_verified", "processing"):
        assert move(client, h, ref, to).status_code == 200
    return ref, h


def upload_edoc(client, h, ref, data=None, name="coe.pdf"):
    return client.post(f"{API}/staff/requests/{ref}/e-document", headers=h,
                       files={"file": (name, data or sample_pdf("Certificate of Enrollment"), "application/pdf")})


def verify(client, code):
    return client.get(f"{API}/verify/{code}")


def test_pickup_slip_lifecycle(client, db, student_headers):
    ref, h = to_processing(client, db, student_headers)
    r = client.get(f"{API}/requests/{ref}/pickup-slip", headers=student_headers)
    assert r.status_code == 409 and r.json()["error"]["code"] == "SLIP_NOT_AVAILABLE"

    detail = move(client, h, ref, "ready_for_pickup").json()
    assert "pickup_slip" in detail["allowed_actions"]
    r = client.get(f"{API}/requests/{ref}/pickup-slip", headers=student_headers)
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    text = PdfReader(io.BytesIO(r.content)).pages[0].extract_text()
    assert ref in text and "PICK-UP SLIP" in text

    assert client.get(f"{API}/requests/{ref}/pickup-slip", headers=h).status_code == 200  # staff can reprint
    db.expire_all()
    slips = db.query(IssuedDocument).filter_by(kind="pickup_slip").all()
    assert len(slips) == 1  # same code every time
    code = slips[0].code

    body = verify(client, code.lower()).json()  # case and grouping don't matter
    assert body["state"] == "valid" and body["reference_no"] == ref
    assert body["student_no_masked"].endswith("•") and "Student" in body["holder_name"]

    move(client, h, ref, "completed")
    assert verify(client, f"{code[:4]}-{code[4:8]} {code[8:]}").json()["state"] == "claimed"


def test_slip_is_private_and_verify_rejects_unknown_codes(client, db, student_headers):
    ref, h = to_processing(client, db, student_headers)
    move(client, h, ref, "ready_for_pickup")
    other = make_user(db)
    assert client.get(f"{API}/requests/{ref}/pickup-slip", headers=login(client, other.email)).status_code == 404
    assert client.get(f"{API}/requests/{ref}/pickup-slip").status_code == 401
    assert verify(client, "AAAA-BBBB-CCCC-DDDD").status_code == 404
    assert verify(client, "short").status_code == 404


def test_e_document_release_watermark_and_privacy(client, db, student_headers):
    ref, h = to_processing(client, db, student_headers)
    staff_view = client.get(f"{API}/staff/requests/{ref}", headers=h).json()
    assert staff_view["can_upload_edocument"] is True

    r = upload_edoc(client, h, ref)
    assert r.status_code == 201, r.text
    edoc = r.json()["e_documents"][0]
    assert edoc["filename"] == "coe.pdf" and edoc["revoked_at"] is None
    release_att = next(a for a in r.json()["attachments"] if a["kind"] == "release_document")

    # Not released yet: the student can't see or fetch it.
    student_view = client.get(f"{API}/requests/{ref}", headers=student_headers).json()
    assert student_view["e_documents"] == []
    assert client.get(f"{API}/issued/{edoc['id']}/download", headers=student_headers).status_code == 404
    assert verify(client, edoc["code"]).json()["state"] == "not_claimable"

    move(client, h, ref, "ready_for_pickup")
    student_view = client.get(f"{API}/requests/{ref}", headers=student_headers).json()
    assert [d["id"] for d in student_view["e_documents"]] == [edoc["id"]]
    assert student_view["e_documents"][0]["filename"] is None
    assert all(a["kind"] != "release_document" for a in student_view["attachments"])
    # The clean original is never served to the student.
    assert client.get(f"{API}/attachments/{release_att['id']}/download", headers=student_headers).status_code == 404

    r = client.get(f"{API}/issued/{edoc['id']}/download", headers=student_headers)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    reader = PdfReader(io.BytesIO(r.content))
    assert reader.is_encrypted  # locked against editing; opens without a password
    reader.decrypt("")
    text = reader.pages[0].extract_text()
    assert ref in text and edoc["code"] in text and "SAMPLE UPLOAD" in text

    assert verify(client, edoc["code"]).json()["state"] == "valid"
    db.expire_all()
    assert db.query(AuditLog).filter_by(action="e_document_downloaded").count() == 1
    assert db.query(AuditLog).filter_by(action="document_verified").count() == 2


def test_replace_and_revoke_e_document(client, db, student_headers):
    ref, h = to_processing(client, db, student_headers)
    first = upload_edoc(client, h, ref).json()["e_documents"][0]
    docs = upload_edoc(client, h, ref, name="coe-v2.pdf").json()["e_documents"]
    assert docs[0]["revoked_at"] and docs[0]["revoke_reason"] == "Replaced by a newer copy."
    assert verify(client, first["code"]).json()["state"] == "revoked"

    second = docs[1]
    r = client.post(f"{API}/staff/requests/{ref}/e-documents/{second['id']}/revoke", headers=h, json={"reason": "Wrong term"})
    assert r.json()["e_documents"][1]["revoke_reason"] == "Wrong term"
    again = client.post(f"{API}/staff/requests/{ref}/e-documents/{second['id']}/revoke", headers=h, json={"reason": "x"})
    assert again.status_code == 409

    move(client, h, ref, "ready_for_pickup")
    assert client.get(f"{API}/requests/{ref}", headers=student_headers).json()["e_documents"] == []
    assert client.get(f"{API}/issued/{second['id']}/download", headers=student_headers).status_code == 404


def test_e_document_upload_rules(client, db, student_headers):
    early = submitted_request(client, db, student_headers)
    ref, h = to_processing(client, db, student_headers)
    assert upload_edoc(client, h, early).status_code == 409  # not being processed yet

    coe = db.query(DocumentType).filter_by(code="COE").one()
    coe.allow_edocument = False  # like the TOR, which is only ever released on paper
    db.commit()
    assert client.get(f"{API}/staff/requests/{ref}", headers=h).json()["can_upload_edocument"] is False
    r = upload_edoc(client, h, ref)
    assert r.status_code == 409 and r.json()["error"]["code"] == "EDOC_NOT_ALLOWED"
    coe.allow_edocument = True
    db.commit()

    png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    assert upload_edoc(client, h, ref, data=png, name="scan.png").status_code == 415
    r = upload_edoc(client, h, ref, data=b"%PDF-1.4 this is not really a pdf")
    assert r.status_code == 422 and r.json()["error"]["code"] == "PDF_UNREADABLE"
    assert client.post(f"{API}/staff/requests/{ref}/e-document", headers=student_headers,
                       files={"file": ("x.pdf", sample_pdf("x"), "application/pdf")}).status_code == 403
