"""Validates request form_data against a document type's required_fields definition."""
from datetime import date

from app.core.errors import AppError


def clean_form_data(fields: list[dict], data: dict, *, strict: bool) -> dict:
    """Drops unknown keys and type-checks values. With strict=True, required fields must be present
    (used on submit); drafts are saved with strict=False."""
    cleaned: dict = {}
    errors: list[dict] = []
    for field in fields:
        key, ftype = field["key"], field.get("type", "text")
        value = data.get(key)
        if isinstance(value, str):
            value = value.strip()
        empty = value in (None, "", []) or (ftype == "checkbox" and value is False and field.get("required"))
        if empty:
            if strict and field.get("required"):
                errors.append({"field": f"form_data.{key}", "message": f"{field['label']} is required."})
            continue
        try:
            if ftype == "number":
                value = int(value)
            elif ftype == "date":
                value = date.fromisoformat(str(value)).isoformat()
            elif ftype == "checkbox":
                value = bool(value)
            elif ftype == "select":
                if value not in field.get("options", []):
                    raise ValueError
            else:
                value = str(value)
                if len(value) > int(field.get("max_length", 1000)):
                    raise ValueError
        except (TypeError, ValueError):
            errors.append({"field": f"form_data.{key}", "message": f"{field['label']} has an invalid value."})
            continue
        cleaned[key] = value
    if errors:
        raise AppError("VALIDATION_ERROR", "Some fields are invalid.", 422, errors)
    return cleaned
