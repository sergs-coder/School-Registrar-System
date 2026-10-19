from fastapi import APIRouter, Depends, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.deps import require_consent
from app.core.errors import NotFound
from app.core.security import utcnow
from app.db.session import get_db
from app.models import Announcement, DocumentType
from app.schemas.catalog import DocumentTypeOut
from app.services.app_settings import get_setting
from app.services.locations import metro_manila

router = APIRouter(tags=["catalog"])


@router.get("/document-types", response_model=list[DocumentTypeOut], dependencies=[Depends(require_consent)])
def list_document_types(db: Session = Depends(get_db)):
    return db.execute(
        select(DocumentType).where(DocumentType.is_active.is_(True)).order_by(DocumentType.sort_order, DocumentType.name)
    ).scalars().all()


@router.get("/document-types/{slug}", response_model=DocumentTypeOut, dependencies=[Depends(require_consent)])
def get_document_type(slug: str, db: Session = Depends(get_db)):
    doc = db.execute(
        select(DocumentType).where(DocumentType.slug == slug, DocumentType.is_active.is_(True))
    ).scalar_one_or_none()
    if doc is None:
        raise NotFound("That document type is not available.")
    return doc


@router.get("/announcements/active", tags=["announcements"])
def active_announcements(db: Session = Depends(get_db)):
    now = utcnow()
    rows = db.execute(
        select(Announcement)
        .where(
            Announcement.is_active.is_(True),
            or_(Announcement.starts_at.is_(None), Announcement.starts_at <= now),
            or_(Announcement.ends_at.is_(None), Announcement.ends_at >= now),
        )
        .order_by(Announcement.created_at.desc())
    ).scalars().all()
    return [{"id": a.id, "title": a.title, "body": a.body, "level": a.level.value} for a in rows]


@router.get("/locations/metro-manila", tags=["catalog"])
def metro_manila_locations(response: Response):
    """Cities/municipality in Metro Manila and their barangays, for the courier address form."""
    response.headers["Cache-Control"] = "public, max-age=86400"
    return metro_manila()


@router.get("/site-info", tags=["announcements"])
def site_info(db: Session = Depends(get_db)):
    """Public office details shown in the footer and on pick-up instructions."""
    return {
        "registrar_contact": get_setting(db, "registrar_contact"),
        "payment_instructions": get_setting(db, "payment_instructions"),
    }
