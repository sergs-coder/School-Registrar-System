from fastapi import APIRouter

from app.api.v1 import auth, catalog, me, notifications, requests, staff

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(me.router)
api_router.include_router(catalog.router)
api_router.include_router(requests.router)
api_router.include_router(notifications.router)
api_router.include_router(staff.router)
