"""Request-update emails: a plain-text body plus an HTML version with a progress tracker.

Everything interpolated into the HTML is escaped; remarks come from staff and students.
"""
from dataclasses import dataclass, field
from html import escape

from app.core.config import settings

BLUE = "#1c3785"
GOLD = "#d4a017"
INK = "#0f172a"
MUTED = "#475569"
LINE = "#e2e8f0"
GREEN = "#16a34a"
RED = "#dc2626"


@dataclass
class TrackerStep:
    label: str
    state: str  # done | current | todo | stopped


@dataclass
class UpdateEmail:
    headline: str  # e.g. "Approved", "Ready for Pick-up"
    body: str
    reference_no: str
    document_name: str
    steps: list[TrackerStep] = field(default_factory=list)
    next_step: str | None = None
    estimated_release: str | None = None  # already formatted for display
    urgent: bool = False  # reminders: shows an "Action needed" banner


def request_link(reference_no: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/requests/{reference_no}"


def render_text(e: UpdateEmail) -> str:
    marks = {"done": "[x]", "current": "[>]", "todo": "[ ]", "stopped": "[!]"}
    lines = ["Hello,", ""] + (["ACTION NEEDED", ""] if e.urgent else []) + [e.body, ""]
    if e.next_step:
        lines += [e.next_step, ""]
    if e.steps:
        lines.append("Progress: " + "  ".join(f"{marks[s.state]} {s.label}" for s in e.steps))
    if e.estimated_release:
        lines.append(f"Estimated release: {e.estimated_release}")
    lines += [
        f"Request: {e.reference_no} ({e.document_name})",
        f"Track your request: {request_link(e.reference_no)}",
        "",
        "— Office of the University Registrar, Trinity University of Asia",
        "",
        "This is an automated message. Please do not reply.",
    ]
    return "\n".join(lines)


def _tracker_html(steps: list[TrackerStep]) -> str:
    cells = []
    for s in steps:
        if s.state == "done":
            dot, color, weight = "&#10003;", GREEN, "600"
            circle = f"background:{GREEN};color:#fff;border:2px solid {GREEN};"
        elif s.state == "current":
            dot, color, weight = "&#9679;", BLUE, "700"
            circle = f"background:#fff;color:{BLUE};border:2px solid {BLUE};"
        elif s.state == "stopped":
            dot, color, weight = "&#10005;", RED, "700"
            circle = f"background:{RED};color:#fff;border:2px solid {RED};"
        else:
            dot, color, weight = "&nbsp;", MUTED, "400"
            circle = f"background:#fff;color:{MUTED};border:2px solid {LINE};"
        cells.append(
            f'<td align="center" valign="top" style="padding:0 2px;width:{100 // max(len(steps), 1)}%;">'
            f'<div style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:50%;'
            f'font-size:12px;font-weight:700;{circle}">{dot}</div>'
            f'<div style="margin-top:6px;font-size:11px;color:{color};font-weight:{weight};">{escape(s.label)}</div></td>'
        )
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="margin:20px 0 4px;border-collapse:collapse;"><tr>{"".join(cells)}</tr></table>'
    )


def render_html(e: UpdateEmail) -> str:
    link = escape(request_link(e.reference_no), quote=True)
    next_step = (
        f'<p style="margin:16px 0 0;padding:12px 14px;background:#f1f5f9;border-radius:8px;font-size:14px;color:{INK};">'
        f"{escape(e.next_step)}</p>"
        if e.next_step else ""
    )
    eta = (
        f'<p style="margin:12px 0 0;font-size:13px;color:{MUTED};">Estimated release: '
        f'<strong style="color:{INK};">{escape(e.estimated_release)}</strong></p>'
        if e.estimated_release else ""
    )
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid {LINE};border-radius:12px;overflow:hidden;">
  <tr><td style="background:{BLUE};padding:16px 24px;border-bottom:3px solid {GOLD};">
    <div style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.3px;">TRINITY UNIVERSITY OF ASIA</div>
    <div style="color:#d9e3f8;font-size:12px;">Office of the University Registrar</div>
  </td></tr>
  <tr><td style="padding:24px;">
    {f'<div style="display:inline-block;margin-bottom:10px;padding:4px 10px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:700;">ACTION NEEDED</div>' if e.urgent else ""}
    <div style="font-size:12px;color:{MUTED};font-family:Consolas,monospace;">{escape(e.reference_no)} &middot; {escape(e.document_name)}</div>
    <h1 style="margin:6px 0 0;font-size:20px;line-height:28px;color:{INK};">{escape(e.headline)}</h1>
    <p style="margin:12px 0 0;font-size:15px;line-height:22px;color:{INK};">{escape(e.body)}</p>
    {next_step}
    {_tracker_html(e.steps) if e.steps else ""}
    {eta}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;"><tr><td style="background:{BLUE};border-radius:8px;">
      <a href="{link}" style="display:inline-block;padding:11px 20px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Track your request</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:14px 24px;border-top:1px solid {LINE};font-size:11px;color:{MUTED};">
    This is an automated message from the TUA Student Request Portal. Please do not reply.
  </td></tr>
</table>
</td></tr></table>
</body></html>"""
