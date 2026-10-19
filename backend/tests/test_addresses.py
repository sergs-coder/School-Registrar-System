from app.models import Notification
from tests.conftest import doc_id
from tests.test_payments import awaiting_payment

API = "/api/v1"


def courier_draft(client, db, headers, address):
    return client.post(f"{API}/requests", headers=headers, json={
        "document_type_id": doc_id(db, "TOR"), "purpose": "Employment", "delivery_method": "courier",
        "delivery_address": address,
    })


BASE = {"recipient": "Juan Dela Cruz", "contact_no": "09171234567", "line1": "123 Mabini St.", "zip": "1112"}


def test_metro_manila_list(client):
    cities = client.get(f"{API}/locations/metro-manila").json()
    assert len(cities) == 17
    by_name = {c["name"]: c["barangays"] for c in cities}
    assert "Pembo" in by_name["Taguig City"] and "Pembo" not in by_name["Makati City"]
    assert len(by_name["Manila"]) == 897 and by_name["Manila"][:3] == ["Barangay 1", "Barangay 2", "Barangay 3"]


def test_metro_address_needs_a_real_city_and_barangay(client, db, student_headers):
    good = {**BASE, "region": "metro", "city": "Quezon City", "barangay": "Kamuning",
            "landmark": "  Near the church  "}
    r = courier_draft(client, db, student_headers, good)
    assert r.status_code == 201, r.text
    addr = r.json()["delivery_address"]
    assert addr["province"] == "Metro Manila" and addr["barangay"] == "Kamuning" and addr["landmark"] == "Near the church"

    for bad in ({**good, "barangay": "Pembo"}, {**good, "barangay": None}, {**good, "city": "Antipolo City"}):
        r = courier_draft(client, db, student_headers, bad)
        assert r.status_code == 422 and r.json()["error"]["details"][0]["field"] == "delivery_address", r.text


def test_provincial_address_is_free_text(client, db, student_headers):
    r = courier_draft(client, db, student_headers, {
        **BASE, "region": "provincial", "line1": "45 Rizal St., Brgy. Poblacion", "city": "Antipolo City",
        "province": "Rizal", "barangay": "ignored", "landmark": ""})
    assert r.status_code == 201, r.text
    addr = r.json()["delivery_address"]
    assert addr["barangay"] is None and addr["landmark"] is None and addr["province"] == "Rizal"
    assert r.json()["fee_breakdown"][-1]["label"] == "Courier (Provincial)"


def test_approval_email_states_amount_due(client, db, student, student_headers):
    awaiting_payment(client, db, student_headers)
    note = db.query(Notification).filter_by(user_id=student.id).order_by(Notification.id.desc()).first()
    assert note.title.endswith("Approved") and "Amount due: ₱100.00." in note.body


def test_provincial_address_needs_a_province(client, db, student_headers):
    r = courier_draft(client, db, student_headers, {**BASE, "region": "provincial", "city": "Antipolo City"})
    assert r.status_code == 422 and r.json()["error"]["details"][0]["message"].endswith("Enter the province.")
