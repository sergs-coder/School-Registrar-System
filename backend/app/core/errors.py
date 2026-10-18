"""Consistent error envelope: {"error": {"code", "message", "details"}}."""
import logging

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400, details=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or []


class NotFound(AppError):
    def __init__(self, message: str = "Resource not found."):
        super().__init__("NOT_FOUND", message, status.HTTP_404_NOT_FOUND)


class Forbidden(AppError):
    def __init__(self, message: str = "You do not have permission to do this.", code: str = "FORBIDDEN"):
        super().__init__(code, message, status.HTTP_403_FORBIDDEN)


class Unauthorized(AppError):
    def __init__(self, message: str = "Authentication required.", code: str = "UNAUTHORIZED"):
        super().__init__(code, message, status.HTTP_401_UNAUTHORIZED)


def error_body(code: str, message: str, details=None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or []}}


_HTTP_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    429: "RATE_LIMITED",
}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError):
        return JSONResponse(error_body(exc.code, exc.message, exc.details), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError):
        details = []
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")]
            details.append({"field": ".".join(loc), "message": err.get("msg", "Invalid value.")})
        return JSONResponse(
            error_body("VALIDATION_ERROR", "Some fields are invalid.", details),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(_: Request, exc: StarletteHTTPException):
        code = _HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(error_body(code, message), status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(Exception)
    async def unhandled_handler(_: Request, exc: Exception):
        logger.exception("Unhandled error", exc_info=exc)
        return JSONResponse(
            error_body("INTERNAL_ERROR", "Something went wrong on our side. Please try again."),
            status_code=500,
        )
