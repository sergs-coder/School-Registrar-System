from fastapi import APIRouter

from app.api.v1 import (
    account_requests,
    admin,
    auth,
    catalog,
    documents,
    me,
    notifications,
    pickups,
    reports,
    requests,
    staff,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(account_requests.router)
api_router.include_router(me.router)
api_router.include_router(catalog.router)
api_router.include_router(requests.router)
api_router.include_router(notifications.router)
api_router.include_router(staff.router)
api_router.include_router(documents.router)
api_router.include_router(pickups.router)
api_router.include_router(admin.router)
api_router.include_router(reports.router)
