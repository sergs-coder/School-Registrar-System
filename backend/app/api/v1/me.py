from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.deps import require_student
from app.db.session import get_db
from app.models import User
from app.schemas.auth import ProfileUpdate, StudentProfileOut
from app.services.audit import audit

router = APIRouter(prefix="/me", tags=["profile"])


@router.get("/profile", response_model=StudentProfileOut)
def get_profile(user: User = Depends(require_student)):
    return user.student


@router.patch("/profile", response_model=StudentProfileOut)
def update_profile(
    body: ProfileUpdate, http: Request, user: User = Depends(require_student), db: Session = Depends(get_db)
):
    # Name, student number and program come from the Registrar's records and are read-only here.
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(user.student, key, value)
    audit(db, "profile_updated", actor=user, entity_type="student", entity_id=user.student.id, http=http,
          meta={"fields": sorted(changes)})
    db.commit()
    return user.student
