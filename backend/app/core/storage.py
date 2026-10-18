"""Encrypted file storage. Files are encrypted at rest with Fernet (AES-128-CBC + HMAC).

Only the LocalStorage backend is implemented; an S3-compatible backend can implement
the same three methods.
"""
import base64
import hashlib
import uuid
from datetime import datetime
from pathlib import Path

from cryptography.fernet import Fernet

from app.core.config import settings


def _fernet() -> Fernet:
    key = settings.file_encryption_key
    if not key:
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode()).digest()).decode()
    return Fernet(key)


class LocalStorage:
    def __init__(self, root: Path):
        self.root = Path(root)

    def put(self, data: bytes) -> str:
        now = datetime.now()
        key = f"{now:%Y}/{now:%m}/{uuid.uuid4().hex}.bin"
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(_fernet().encrypt(data))
        return key

    def get(self, key: str) -> bytes:
        return _fernet().decrypt((self.root / key).read_bytes())

    def delete(self, key: str) -> None:
        (self.root / key).unlink(missing_ok=True)


def get_storage() -> LocalStorage:
    return LocalStorage(settings.upload_dir)
