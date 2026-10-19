from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "TUA Student Request Portal"
    environment: str = "development"
    api_prefix: str = "/api/v1"

    database_url: str = f"sqlite:///{BASE_DIR / 'srm.db'}"

    secret_key: str = "change-me-in-production-please-use-a-long-random-string"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    refresh_cookie_name: str = "srm_refresh"
    cookie_secure: bool = False

    max_failed_logins: int = 5
    lockout_minutes: int = 15
    password_reset_expire_minutes: int = 30

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    frontend_url: str = "http://localhost:5173"

    upload_dir: Path = BASE_DIR / "storage"
    # Fernet key (urlsafe base64, 32 bytes). Derived from secret_key when empty (dev only).
    file_encryption_key: str = ""
    max_upload_mb: int = 5

    smtp_host: str = ""
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = False
    mail_from: str = "TUA Registrar <registrar@tua.edu.ph>"

    # Background check for stalled requests (see services/reminders.py). With several backend
    # instances, enable it on one only, or run `python -m app.services.reminders` from cron instead.
    reminders_enabled: bool = True
    reminder_interval_minutes: int = 60

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
