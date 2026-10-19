import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import register_error_handlers

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("srm.reminders")


def _reminder_pass() -> None:
    from app.db.session import SessionLocal
    from app.services.reminders import run_reminders

    db = SessionLocal()
    try:
        result = run_reminders(db)
        if result.action_reminders or result.late_notices:
            logger.info("Reminders sent: %s action needed, %s running late", result.action_reminders, result.late_notices)
    finally:
        db.close()


async def _reminder_loop() -> None:
    await asyncio.sleep(30)  # let startup finish first
    while True:
        try:
            await asyncio.to_thread(_reminder_pass)
        except Exception:  # a failed pass must never stop the loop
            logger.exception("Reminder pass failed")
        await asyncio.sleep(settings.reminder_interval_minutes * 60)


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(_reminder_loop()) if settings.reminders_enabled else None
    yield
    if task:
        task.cancel()


app = FastAPI(
    lifespan=lifespan,
    title=settings.app_name,
    version="0.1.0",
    description="REST API for the Trinity University of Asia Student Request Portal.",
    openapi_url=f"{settings.api_prefix}/openapi.json",
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    return response


register_error_handlers(app)
app.include_router(api_router, prefix=settings.api_prefix)


@app.get(f"{settings.api_prefix}/health", tags=["health"])
def health():
    return {"status": "ok"}


if settings.static_dir and settings.static_dir.is_dir():
    static_root = settings.static_dir.resolve()

    # Registered last so API routes win. Unknown non-API paths get index.html for client-side routing.
    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        if path.startswith(settings.api_prefix.strip("/") + "/"):
            raise HTTPException(status_code=404, detail="Not found")
        file = (static_root / path).resolve()
        if path and file.is_file() and file.is_relative_to(static_root):
            return FileResponse(file)
        return FileResponse(static_root / "index.html")
