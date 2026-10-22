"""Reading the catalogue out of the database and through the engine. Shared by
the API and the analyst, so both see exactly the same numbers."""

from __future__ import annotations

from statistics import median

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import ProductRow, Review, Setting
from .engine import Product, Result, Source, World, evaluate
from .rules import CATEGORIES, CHANNELS, ROUTES, build_world
from .sources import fx_rates

KIND_LABEL = {"fact": "Supplier sheet", "ai": "AI suggestion", "assumption": "Keyword match", "unknown": "No category yet"}


def world(s: Session) -> World:
    overrides = {r.key: r.value for r in s.scalars(select(Setting))}
    fx, fx_src = fx_rates(s)
    return build_world(overrides, fx, fx_src)


def to_engine(r: ProductRow) -> Product:
    dims = (r.length_cm, r.width_cm, r.height_cm)
    duty_rates = {}
    if r.us_mfn is not None:
        vague = len("".join(ch for ch in (r.hs_code or "") if ch.isdigit())) < 8
        label = (f"Highest US HTS rate under {r.hs_code[:4]}.{r.hs_code[4:6]} ({r.us_mfn_line}); an 8-10 digit code gives the exact rate"
                 if vague else f"US HTS {r.us_mfn_line} column 1 rate")
        duty_rates["US"] = (r.us_mfn, Source("assumption" if vague else "fact", label, "https://hts.usitc.gov/"))
    return Product(
        sku=r.sku, name=r.name, unit_cost=r.unit_cost, cost_currency=r.cost_currency, weight_kg=r.weight_kg,
        dims_cm=dims if all(dims) else None, origin=r.origin, category=r.category,
        category_source=Source(r.category_kind, KIND_LABEL.get(r.category_kind, r.category_kind)),
        prices={k: v for k, v in (r.prices or {}).items()}, duty_rates=duty_rates,
    )


def lanes_for(r: ProductRow) -> list[str]:
    return [cid for cid, ch in CHANNELS.items() if (r.origin, ch.country) in ROUTES]


def latest_reviews(s: Session) -> dict[tuple[int, str], Review]:
    out: dict[tuple[int, str], Review] = {}
    for rv in s.scalars(select(Review).order_by(Review.created_at)):
        out[(rv.product_id, rv.channel)] = rv
    return out


def all_lanes(s: Session, w: World | None = None) -> list[tuple[ProductRow, Result]]:
    w = w or world(s)
    rows = s.scalars(select(ProductRow).order_by(ProductRow.id)).all()
    return [(r, evaluate(to_engine(r), cid, w)) for r in rows for cid in lanes_for(r)]


COST_GROUPS = {"shipping": ["shipping"], "duty and tariff": ["duty", "tariff"], "marketplace fees": ["fee"], "supplier cost": ["product"]}


def top_cost(res: Result) -> tuple[str, float] | None:
    if not res.price or not res.lines:
        return None
    shares = {g: sum(l.amount for l in res.lines if l.key in keys) / res.price for g, keys in COST_GROUPS.items()}
    g = max(shares, key=shares.get)
    return g, shares[g]


def stats(s: Session, w: World | None = None) -> dict:
    """A compact picture of the whole catalogue: what the brief and the analyst start from."""
    w = w or world(s)
    lanes = all_lanes(s, w)
    reviews = latest_reviews(s)
    per_channel = {}
    for cid, ch in CHANNELS.items():
        mine = [(r, res) for r, res in lanes if res.channel == cid]
        priced = [res for _, res in mine if res.profit is not None]
        losing = [res for res in priced if res.profit < 0]
        drivers: dict[str, list[float]] = {}
        for res in losing:
            t = top_cost(res)
            if t:
                drivers.setdefault(t[0], []).append(t[1])
        per_channel[ch.name] = {
            "priced": len(priced),
            "list": sum(res.verdict == "list" for _, res in mine),
            "check": sum(res.verdict == "check" for _, res in mine),
            "skip": sum(res.verdict == "skip" for _, res in mine),
            "needs_data": sum(res.verdict == "needs-data" for _, res in mine),
            "median_margin": round(median([res.margin for res in priced]), 4) if priced else None,
            "losing": len(losing),
            "main_cost_in_losers": max(drivers, key=lambda k: len(drivers[k])) if drivers else None,
            "approved": sum(1 for r, res in mine if (rv := reviews.get((r.id, cid))) and rv.decision == "approved"),
        }
    priced = [(r, res) for r, res in lanes if res.margin is not None]
    best = sorted(priced, key=lambda x: -x[1].margin)[:3]
    worst = sorted(priced, key=lambda x: x[1].margin)[:3]
    fmt = lambda r, res: {"sku": r.sku, "name": r.name, "channel": CHANNELS[res.channel].name,
                          "margin": round(res.margin, 4), "profit": res.profit, "currency": res.currency}
    return {
        "products": len({r.id for r, _ in lanes}),
        "target_margin": w.assumptions.target_margin,
        "unconfirmed_categories": len({r.id for r, _ in lanes if r.category_kind != "fact"}),
        "waiting_for_review": sum(1 for r, res in lanes if (r.id, res.channel) not in reviews and res.verdict != "needs-data"),
        "channels": per_channel,
        "best_lanes": [fmt(*x) for x in best],
        "worst_lanes": [fmt(*x) for x in worst],
        "categories": CATEGORIES,
    }
