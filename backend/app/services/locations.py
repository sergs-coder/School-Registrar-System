"""Metro Manila cities/municipality and their barangays, for courier addresses.

Data: app/data/metro_manila.json (PSGC; see its "source" field). Addresses outside Metro Manila stay free text.
"""
import json
from functools import lru_cache
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "metro_manila.json"
METRO_PROVINCE = "Metro Manila"


@lru_cache
def metro_manila() -> list[dict]:
    """[{"name": "Quezon City", "barangays": ["Alicia", ...]}, ...], sorted by name."""
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return [{"name": c["name"], "barangays": c["barangays"]} for c in data["cities"]]


@lru_cache
def _barangays_by_city() -> dict[str, set[str]]:
    return {c["name"]: set(c["barangays"]) for c in metro_manila()}


def is_metro_city(city: str) -> bool:
    return city in _barangays_by_city()


def is_metro_barangay(city: str, barangay: str) -> bool:
    return barangay in _barangays_by_city().get(city, ())
