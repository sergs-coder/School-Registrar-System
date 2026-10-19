"""SMTP email. With no SMTP_HOST configured, messages are logged instead of sent."""
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("srm.email")


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Returns True only when the message was handed to an SMTP server. `html`, if given, is sent as an
    alternative part; clients that can't show HTML fall back to `text`."""
    if not settings.smtp_host:
        logger.info("EMAIL (not sent, SMTP_HOST empty) to=%s subject=%s\n%s", to, subject, text)
        return False
    msg = EmailMessage()
    msg["From"] = settings.mail_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
        return True
    except Exception:  # never let email failure break a request
        logger.exception("Failed to send email to %s", to)
        return False
