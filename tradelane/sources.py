"""Live outside data: exchange rates (Frankfurter, ECB) and US duty rates (USITC HTS).

Both are cached in the database and fall back to saved values, so a slow or
down API never breaks a page.
"""

from __future__ import annotations

import re
from datetime import timedelta

import httpx
from sqlalchemy.orm import Session

from .db import Cache, now
from .engine import Source
from .rules import FALLBACK_FX, FALLBACK_FX_SOURCE

FX_URL = "https://api.frankfurter.dev/v2/rates?base=USD&quotes=GBP,INR"
HTS_URL = "https://hts.usitc.gov/reststop/search"


def _cached(db: Session, key: str, max_age: timedelta) -> dict | None:
    row = db.get(Cache, key)
    if row and now() - row.fetched_at.replace(tzinfo=row.fetched_at.tzinfo or now().tzinfo) < max_age:
        return row.value
    return None


def _store(db: Session, key: str, value: dict) -> None:
    row = db.get(Cache, key) or Cache(key=key, value=value)
    row.value, row.fetched_at = value, now()
    db.merge(row)
    db.commit()


def fx_rates(db: Session) -> tuple[dict[str, float], Source]:
    hit = _cached(db, "fx", timedelta(hours=12))
    if not hit:
        try:
            rows = httpx.get(FX_URL, timeout=4).raise_for_status().json()
            hit = {"rates": {"USD": 1.0, **{r["quote"]: r["rate"] for r in rows}}, "date": rows[0]["date"]}
            _store(db, "fx", hit)
        except (httpx.HTTPError, KeyError, IndexError, ValueError):
            return FALLBACK_FX, FALLBACK_FX_SOURCE
    return hit["rates"], Source("fact", f"ECB reference rates for {hit['date']} (Frankfurter)", FX_URL, hit["date"])


def parse_rate(general: str) -> float | None:
    """'Free' -> 0, '16.5%' -> 0.165. Specific duties ('4.4¢/kg') return None."""
    g = (general or "").strip()
    if g.lower() == "free":
        return 0.0
    m = re.fullmatch(r"(\d+(?:\.\d+)?)%", g)
    return float(m.group(1)) / 100 if m else None


def us_mfn(db: Session, hs_code: str) -> tuple[float, str] | None:
    """Column 1 general rate for an HS code, from the most specific HTS line that has one."""
    digits = re.sub(r"\D", "", hs_code or "")
    if len(digits) < 6:
        return None
    key = f"hts:{digits[:10]}"
    hit = _cached(db, key, timedelta(days=30))
    if hit is None:
        heading = f"{digits[:4]}.{digits[4:6]}"
        try:
            rows = httpx.get(HTS_URL, params={"keyword": heading}, timeout=6).raise_for_status().json()
        except (httpx.HTTPError, ValueError):
            return None
        best = None
        for r in rows:
            line = re.sub(r"\D", "", r.get("htsno") or "")
            if not line.startswith(digits[:6]) or line.startswith("99"):
                continue
            rate = parse_rate(r.get("general", ""))
            if rate is None:
                continue
            # prefer the line sharing the most digits with the code we were given; when several
            # lines match equally (a 6-digit code over 8-digit lines), take the highest rate,
            # so an imprecise code can only understate the margin, never flatter it
            score = (len(_common_prefix(line, digits)), rate)
            if best is None or score > best[0]:
                best = (score, rate, r["htsno"])
        hit = {"rate": best[1], "line": best[2]} if best else {}
        _store(db, key, hit)
    return (hit["rate"], hit["line"]) if hit else None


def _common_prefix(a: str, b: str) -> str:
    out = []
    for x, y in zip(a, b):
        if x != y:
            break
        out.append(x)
    return "".join(out)
