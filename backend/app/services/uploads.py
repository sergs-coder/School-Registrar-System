"""Upload validation: the declared extension must be allowed AND the file's magic bytes must match."""
import hashlib
import re

from app.core.config import settings
from app.core.errors import AppError

SIGNATURES = {
    "pdf": (b"%PDF-",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "jpg": (b"\xff\xd8\xff",),
}
MIME = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg"}
EXT_ALIASES = {"jpeg": "jpg"}


def detect_type(data: bytes) -> str | None:
    for ext, sigs in SIGNATURES.items():
        if any(data.startswith(sig) for sig in sigs):
            return ext
    return None


def safe_filename(name: str) -> str:
    name = name.replace("\\", "/").split("/")[-1]
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip() or "file"
    return name[:200]


def validate_upload(filename: str, data: bytes, accept: list[str] | None, max_mb: int | None) -> tuple[str, str]:
    """Returns (detected_ext, mime_type) or raises AppError."""
    accept = [EXT_ALIASES.get(a, a) for a in (accept or ["pdf", "jpg", "png"])]
    limit_mb = min(max_mb or settings.max_upload_mb, settings.max_upload_mb)
    if not data:
        raise AppError("FILE_EMPTY", "The file is empty.", 422)
    if len(data) > limit_mb * 1024 * 1024:
        raise AppError("FILE_TOO_LARGE", f"Files must be {limit_mb} MB or smaller.", 413)
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    ext = EXT_ALIASES.get(ext, ext)
    detected = detect_type(data)
    allowed = ", ".join(a.upper() for a in accept)
    if ext not in accept or detected not in accept or detected != ext:
        raise AppError("FILE_TYPE_NOT_ALLOWED", f"Only {allowed} files are accepted.", 415)
    return detected, MIME[detected]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
