"""Landed-margin engine. Pure: no I/O, no database, no network.

Every figure the engine produces is a Line with a Source, so the UI can say
whether a number is a published fact, an editable assumption, an AI guess or
missing. Money is computed in the destination channel's currency.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Literal

Kind = Literal["fact", "assumption", "ai", "unknown"]


@dataclass(frozen=True)
class Source:
    kind: Kind
    label: str
    url: str | None = None
    checked: str | None = None  # ISO date the fact was last checked


@dataclass(frozen=True)
class Tier:
    """Referral fee tier: `pct` applies to the part of the price up to `upto`
    (or, when `whole_price` is set, to the whole price if price <= upto)."""

    pct: float
    upto: float | None = None


@dataclass(frozen=True)
class FeeRule:
    tiers: tuple[Tier, ...]
    whole_price: bool  # True: one rate picked by price band. False: marginal tiers.
    min_fee: float
    source: Source


@dataclass(frozen=True)
class Channel:
    id: str
    name: str
    country: str  # destination, ISO 3166 alpha-2
    currency: str
    fees: dict[str, FeeRule]  # category -> rule
    vat_rate: float  # VAT inside the shelf price the seller must hand over (UK 0.20, US 0)
    vat_source: Source


@dataclass(frozen=True)
class Route:
    origin: str
    dest: str
    currency: str
    base: float  # per parcel
    per_kg: float  # per chargeable kg
    transit_days: tuple[int, int]
    source: Source
    volumetric_divisor: float = 5000.0  # cm^3 per kg, courier standard


@dataclass(frozen=True)
class DutyRule:
    """Import duty for one destination. `extra` is any origin-specific
    additional tariff on top of the category rate."""

    category_rates: dict[str, float]
    extra_by_origin: dict[str, float]
    relief_threshold: float | None  # consignment value (dest currency) at or under which duty is 0
    includes_shipping: bool  # True: CIF basis (UK), False: FOB basis (US)
    source: Source
    extra_source: Source


@dataclass(frozen=True)
class Assumptions:
    payout_fx_fee: float = 0.015  # charged when payout currency differs from seller's
    returns_rate: float = 0.05  # share of sales refunded and written off
    ad_spend: float = 0.0  # share of price spent on ads
    target_margin: float = 0.20  # net profit / net revenue needed for "List"


@dataclass
class Product:
    sku: str
    name: str
    unit_cost: float | None
    cost_currency: str
    weight_kg: float | None
    dims_cm: tuple[float, float, float] | None
    origin: str
    category: str | None
    category_source: Source = field(default_factory=lambda: Source("fact", "Supplier sheet"))
    prices: dict[str, float | None] = field(default_factory=dict)  # channel id -> shelf price
    # dest country -> (MFN rate, source) from the product's own HS code; beats the category default
    duty_rates: dict[str, tuple[float, Source]] = field(default_factory=dict)


@dataclass(frozen=True)
class Line:
    key: str
    label: str
    amount: float  # positive = cost, except revenue lines
    source: Source


@dataclass
class Result:
    channel: str
    lane: str
    currency: str
    price: float | None
    lines: list[Line]
    net_revenue: float | None
    profit: float | None
    margin: float | None
    break_even: float | None
    target_price: float | None
    verdict: Literal["list", "check", "skip", "needs-data"]
    reasons: list[str]
    missing: list[str]


SELLER_CURRENCY = {"IN": "INR", "GB": "GBP", "US": "USD", "CN": "CNY"}


def convert(amount: float, frm: str, to: str, fx: dict[str, float]) -> float:
    """fx maps currency -> units per 1 USD."""
    if frm == to:
        return amount
    return amount / fx[frm] * fx[to]


def referral_fee(price: float, rule: FeeRule) -> float:
    if rule.whole_price:
        for t in rule.tiers:
            if t.upto is None or price <= t.upto:
                return max(rule.min_fee, price * t.pct)
        raise ValueError("fee tiers must end with an open band")
    fee, floor = 0.0, 0.0
    for t in rule.tiers:
        top = price if t.upto is None else min(price, t.upto)
        if top > floor:
            fee += (top - floor) * t.pct
        if t.upto is None or price <= t.upto:
            break
        floor = t.upto
    return max(rule.min_fee, fee)


def chargeable_kg(weight_kg: float, dims_cm: tuple[float, float, float] | None, divisor: float) -> float:
    if not dims_cm:
        return weight_kg
    l, w, h = dims_cm
    return max(weight_kg, l * w * h / divisor)


@dataclass(frozen=True)
class World:
    """Everything the engine needs besides the product."""

    channels: dict[str, Channel]
    routes: dict[tuple[str, str], Route]
    duties: dict[str, DutyRule]  # by destination country
    fx: dict[str, float]
    fx_source: Source
    assumptions: Assumptions
    assumption_source: Source


def _profit_at(price: float, p: Product, ch: Channel, w: World) -> tuple[list[Line], float, float]:
    """Return (cost lines, net revenue, profit) at a given shelf price."""
    a = w.assumptions
    cur = ch.currency
    route = w.routes[(p.origin, ch.country)]
    duty_rule = w.duties.get(ch.country)
    lines: list[Line] = []

    vat = price - price / (1 + ch.vat_rate) if ch.vat_rate else 0.0
    net_revenue = price - vat

    cost = convert(p.unit_cost, p.cost_currency, cur, w.fx)
    lines.append(Line("product", "Product cost", cost, Source("fact", "Supplier sheet")))

    kg = chargeable_kg(p.weight_kg, p.dims_cm, route.volumetric_divisor)
    ship = convert(route.base + route.per_kg * kg, route.currency, cur, w.fx)
    lines.append(Line("shipping", f"Shipping ({kg:.2f} kg chargeable)", ship, route.source))

    duty = 0.0
    if duty_rule and p.origin != ch.country:
        value = cost + (ship if duty_rule.includes_shipping else 0.0)
        relieved = duty_rule.relief_threshold is not None and net_revenue <= duty_rule.relief_threshold
        own = p.duty_rates.get(ch.country)
        base_rate, base_src = own if own else (duty_rule.category_rates.get(p.category or "", 0.0), duty_rule.source)
        extra = duty_rule.extra_by_origin.get(p.origin, 0.0)
        if relieved:
            lines.append(Line("duty", "Import duty (low-value relief)", 0.0, duty_rule.source))
        else:
            lines.append(Line("duty", f"Import duty ({base_rate:.1%} on {'CIF' if duty_rule.includes_shipping else 'FOB'} value)",
                              value * base_rate, base_src))
            if extra:
                lines.append(Line("tariff", f"Additional tariff ({extra:.0%})", value * extra, duty_rule.extra_source))

    rule = ch.fees.get(p.category or "")
    fee = referral_fee(price, rule) if rule else 0.0
    lines.append(Line("fee", "Marketplace referral fee", fee, rule.source if rule else Source("unknown", "No fee rule for category")))

    fx_fee = net_revenue * a.payout_fx_fee if SELLER_CURRENCY.get(p.origin) != cur else 0.0
    lines.append(Line("fx", "Payout currency conversion", fx_fee, w.assumption_source))

    returns = net_revenue * a.returns_rate
    lines.append(Line("returns", "Returns allowance", returns, w.assumption_source))

    if a.ad_spend:
        lines.append(Line("ads", "Advertising", price * a.ad_spend, w.assumption_source))

    profit = net_revenue - sum(l.amount for l in lines)
    if vat:
        lines.insert(0, Line("vat", f"VAT inside price ({ch.vat_rate:.0%})", vat, ch.vat_source))
    return lines, net_revenue, profit


def _solve_price(p: Product, ch: Channel, w: World, margin: float) -> float | None:
    """Lowest shelf price where profit >= margin * net revenue. Scans then bisects,
    because duty relief thresholds and fee bands make profit a step function."""

    def ok(x: float) -> bool:
        _, nr, pr = _profit_at(x, p, ch, w)
        return pr >= margin * nr - 1e-9

    base = max(convert(p.unit_cost, p.cost_currency, ch.currency, w.fx), 0.01)
    lo, x = 0.0, base * 0.5
    for _ in range(200):
        if ok(x):
            break
        lo, x = x, x * 1.08
    else:
        return None  # margin unreachable (e.g. fees + allowances exceed it)
    hi = x
    for _ in range(60):
        mid = (lo + hi) / 2
        if ok(mid):
            hi = mid
        else:
            lo = mid
    return round(hi + 0.005, 2)


def evaluate(p: Product, channel_id: str, w: World, solve: bool = True) -> Result:
    """`solve=False` skips the break-even and target-price searches (sensitivity runs don't need them)."""
    ch = w.channels[channel_id]
    lane = f"{p.origin} → {ch.name}"
    price = p.prices.get(channel_id)
    missing = [name for name, v in [("unit cost", p.unit_cost), ("weight", p.weight_kg), ("category", p.category)] if v in (None, "")]
    if (p.origin, ch.country) not in w.routes:
        missing.append(f"shipping route {p.origin}→{ch.country}")
    if missing:
        return Result(channel_id, lane, ch.currency, price, [], None, None, None, None, None, "needs-data",
                      [f"Missing {', '.join(missing)}"], missing)

    break_even = _solve_price(p, ch, w, 0.0) if solve else None
    target = _solve_price(p, ch, w, w.assumptions.target_margin) if solve else None
    if price is None:
        return Result(channel_id, lane, ch.currency, None, [], None, None, None, break_even, target, "check",
                      ["No market price yet: compare it with the target price"], ["market price"])

    lines, net_revenue, profit = _profit_at(price, p, ch, w)
    margin = profit / net_revenue if net_revenue else None
    reasons: list[str] = []
    if profit < 0:
        verdict = "skip"
        reasons.append("Loses money at this price")
    elif margin is not None and margin >= w.assumptions.target_margin:
        verdict = "list"
    else:
        verdict = "check"
        reasons.append(f"Below the {w.assumptions.target_margin:.0%} target margin")
    if p.category_source.kind != "fact" and verdict == "list":
        verdict = "check"
        reasons.append("Category not confirmed yet")
    return Result(channel_id, lane, ch.currency, price, lines, round(net_revenue, 2), round(profit, 2),
                  margin, break_even, target, verdict, reasons, [])


@dataclass(frozen=True)
class Swing:
    key: str
    label: str
    low: float  # profit when the input moves against the seller
    high: float  # profit when it moves in the seller's favour
    base: float


def sensitivity(p: Product, channel_id: str, w: World, step: float = 0.15) -> list[Swing]:
    """Profit when each input moves ±step, sorted by how far it swings profit."""
    base = evaluate(p, channel_id, w)
    if base.profit is None:
        return []
    ch = w.channels[channel_id]
    route = w.routes[(p.origin, ch.country)]
    duty = w.duties.get(ch.country)

    def run(prod: Product = p, world: World = w) -> float:
        return evaluate(prod, channel_id, world, solve=False).profit  # type: ignore[return-value]

    def scaled_route(k: float) -> World:
        r = replace(route, base=route.base * k, per_kg=route.per_kg * k)
        return replace(w, routes={**w.routes, (p.origin, ch.country): r})

    def scaled_fees(k: float) -> World:
        fees = {c: replace(f, tiers=tuple(replace(t, pct=t.pct * k) for t in f.tiers)) for c, f in ch.fees.items()}
        return replace(w, channels={**w.channels, channel_id: replace(ch, fees=fees)})

    def fx_move(k: float) -> World:
        # k > 1: seller's cost currency strengthens, so goods cost more in the sale currency
        if p.cost_currency == ch.currency:
            return w
        return replace(w, fx={**w.fx, p.cost_currency: w.fx[p.cost_currency] / k})

    def scaled_duty(k: float) -> World:
        if not duty:
            return w
        d = replace(duty, category_rates={c: r * k for c, r in duty.category_rates.items()},
                    extra_by_origin={o: r * k for o, r in duty.extra_by_origin.items()})
        return replace(w, duties={**w.duties, ch.country: d})

    def duty_product(k: float) -> Product:
        return replace(p, duty_rates={c: (r * k, s) for c, (r, s) in p.duty_rates.items()})

    def scaled_returns(k: float) -> World:
        return replace(w, assumptions=replace(w.assumptions, returns_rate=w.assumptions.returns_rate * k))

    up, down = 1 + step, 1 - step
    price = base.price or 0
    swings = [
        Swing("price", "Selling price", run(replace(p, prices={**p.prices, channel_id: price * down})),
              run(replace(p, prices={**p.prices, channel_id: price * up})), base.profit),
        Swing("cost", "Supplier cost", run(replace(p, unit_cost=p.unit_cost * up)),
              run(replace(p, unit_cost=p.unit_cost * down)), base.profit),
        Swing("shipping", "Shipping rate", run(world=scaled_route(up)), run(world=scaled_route(down)), base.profit),
        Swing("fee", "Referral fee %", run(world=scaled_fees(up)), run(world=scaled_fees(down)), base.profit),
        Swing("duty", "Duty and tariff", run(duty_product(up), scaled_duty(up)),
              run(duty_product(down), scaled_duty(down)), base.profit),
        Swing("fx", "Exchange rate", run(world=fx_move(up)), run(world=fx_move(down)), base.profit),
        Swing("returns", "Returns rate", run(world=scaled_returns(up)), run(world=scaled_returns(down)), base.profit),
    ]
    swings = [s for s in swings if abs(s.high - s.low) > 0.004]
    return sorted(swings, key=lambda s: abs(s.high - s.low), reverse=True)
