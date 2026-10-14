"""Choose which Open States sessions to search for each jurisdiction.

The old logic took the single newest "active" session. That broke when:
  * a session had no dates or no end date (MO '2018S2', AK '27') and counted as active forever;
  * a short special session was the newest (FL '2026F', MS '20261E') and hid the regular session.
New rule: the two latest regular-length sessions always, plus other recent sessions, capped to keep the
daily scan inside the Open States request quota.
"""
from __future__ import annotations

from datetime import date, timedelta

REGULAR_MIN_DAYS = 30   # shorter sessions are treated as special sessions
RECENT_DAYS = 365
MAX_SESSIONS = 3


def _day(value):
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def select_sessions(candidates: list[dict], today: date, max_sessions: int = MAX_SESSIONS) -> list[str]:
    rows = []
    for item in candidates:
        ident, start, end = item.get("identifier"), _day(item.get("start_date")), _day(item.get("end_date"))
        if not ident or start is None or start > today:
            continue  # undated or future sessions are never "current"
        regular = end is None and (today - start).days >= REGULAR_MIN_DAYS or (end is not None and (end - start).days >= REGULAR_MIN_DAYS)
        recent = (end or start) >= today - timedelta(days=RECENT_DAYS) and not (end is None and start < today - timedelta(days=RECENT_DAYS))
        rows.append({"id": str(ident), "start": start, "regular": regular, "recent": recent})
    if not rows:
        return []
    picked = []
    regulars = sorted((r for r in rows if r["regular"]), key=lambda r: r["start"], reverse=True)
    # The two latest regular sessions are always searched, however old their dates look: Open States
    # sometimes dates a 2026 session with 2025 dates (MS) or lumps two years under one id (AK '34').
    picked.extend(regulars[:2])
    others = sorted((r for r in rows if r["recent"] and r not in picked),
                    key=lambda r: (r["regular"], r["start"]), reverse=True)
    picked += others[: max_sessions - len(picked)]
    if not picked:
        picked = [max(rows, key=lambda r: r["start"])]
    return [r["id"] for r in picked]
