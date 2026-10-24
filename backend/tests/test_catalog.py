from app.core.security import utcnow
from app.models import DocumentType, Holiday
from app.services.business_days import add_business_days, manila_date

API = "/api/v1"


def test_catalog_shows_ready_date_if_approved_today(client, db, student_headers):
    today = manila_date(utcnow())
    docs = {d["code"]: d for d in client.get(f"{API}/document-types", headers=student_headers).json()}
    for code, d in docs.items():
        expected = add_business_days(today, d["processing_days"], set())
        assert d["ready_if_approved_today"] == expected.isoformat(), code

    # A closed day inside the window pushes the date back by one working day.
    code, doc = next(iter(docs.items()))
    first_working = add_business_days(today, 1, set())
    db.add(Holiday(date=first_working, name="Test closure"))
    db.commit()
    again = next(d for d in client.get(f"{API}/document-types", headers=student_headers).json() if d["code"] == code)
    days = db.query(DocumentType).filter_by(code=code).one().processing_days
    assert again["ready_if_approved_today"] == add_business_days(today, days, {first_working}).isoformat()
    assert days == 0 or again["ready_if_approved_today"] > doc["ready_if_approved_today"]
