from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1 import documents, me
from app.core import deps
from app.core.config import settings
from app.core.security import hash_password, utcnow
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import DocumentType, Program, Role, Staff, Student, User
from app.seed.data import DOCUMENT_TYPES, PROGRAMS
from app.seed.seed import sample_pdf

PASSWORD = "Passw0rd!"


@pytest.fixture()
def engine():
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(eng, "connect")
    def _fk(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def db(engine):
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = Session()
    for code, name, college in PROGRAMS[:2]:
        session.add(Program(code=code, name=name, college=college))
    for i, d in enumerate(DOCUMENT_TYPES):
        session.add(DocumentType(**{**d, "base_fee": Decimal(d["base_fee"])}, sort_order=i))
    session.commit()
    yield session
    session.close()


@pytest.fixture()
def client(engine, db, tmp_path, monkeypatch):
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def _get_db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    monkeypatch.setattr(settings, "upload_dir", tmp_path / "uploads")
    deps.login_limiter.hits.clear()
    deps.reset_limiter.hits.clear()
    documents.verify_limiter.hits.clear()
    me.personal_email_limiter.hits.clear()
    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


_hash = None


def make_user(db, *, role=Role.student, email=None, student_no=None, consent=True) -> User:
    global _hash
    _hash = _hash or hash_password(PASSWORD)
    n = db.query(User).count() + 1
    email = email or f"user{n}@tua.edu.ph"
    user = User(email=email, password_hash=_hash, role=role, privacy_consent_at=utcnow() if consent else None)
    if role == Role.student:
        student_no = student_no or f"2023-{20000 + n}"
        user.student_no = student_no
        user.student = Student(student_no=student_no, first_name="Test", last_name=f"Student{n}",
                               program_id=db.query(Program).first().id, year_level=3)
    else:
        user.staff = Staff(employee_no=f"EMP-T{n}", first_name="Staff", last_name=str(n))
    db.add(user)
    db.commit()
    return user


def login(client, identifier, password=PASSWORD) -> dict:
    r = client.post("/api/v1/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def student(db):
    return make_user(db)


@pytest.fixture()
def student_headers(client, student):
    return login(client, student.email)


def doc_id(db, code) -> int:
    return db.query(DocumentType).filter_by(code=code).one().id


def pdf_upload(name="id.pdf"):
    return {"file": (name, sample_pdf("test"), "application/pdf")}
