from __future__ import annotations

from datetime import datetime, timezone


def _to_utc_iso8601(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_timestamp(value: object) -> str | None:
    if not isinstance(value, str):
        return None

    timestamp = value.strip()
    if not timestamp:
        return None

    try:
        iso_candidate = timestamp.replace("Z", "+00:00")
        return _to_utc_iso8601(datetime.fromisoformat(iso_candidate))
    except ValueError:
        pass

    try:
        return _to_utc_iso8601(datetime.strptime(timestamp, "%d/%b/%Y:%H:%M:%S %z"))
    except ValueError:
        pass

    for fmt in ("%b %d %H:%M:%S",):
        try:
            parsed = datetime.strptime(timestamp, fmt)
            parsed = parsed.replace(year=datetime.now(timezone.utc).year, tzinfo=timezone.utc)
            return _to_utc_iso8601(parsed)
        except ValueError:
            continue

    return None


def normalize_event_timestamp(event: dict) -> dict:
    normalized = normalize_timestamp(event.get("timestamp"))
    if normalized:
        event["timestamp"] = normalized
    return event