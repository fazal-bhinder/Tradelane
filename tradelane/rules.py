"""The real-world rules the engine runs on, each with where it came from.

Checked 2026-10-22. Fees and tariffs change; every rule carries its source and
check date so the UI can show how fresh it is. Shipping rate cards are
assumptions on purpose: they belong to the seller's carrier contract.
"""

from __future__ import annotations

from dataclasses import replace

from .engine import Assumptions, Channel, DutyRule, FeeRule, Route, Source, Tier, World

CHECKED = "2026-10-22"

CATEGORIES = {
    "home": "Home & decor",
    "kitchen": "Kitchen & dining",
    "beauty": "Beauty & personal care",
    "clothing": "Clothing & accessories",
    "jewelry": "Jewellery",
    "toys": "Toys & games",
    "sports": "Sports & outdoors",
}

ORIGINS = {"IN": "India", "GB": "United Kingdom"}


def fact(label: str, url: str) -> Source:
    return Source("fact", label, url, CHECKED)


AMZ_US = fact("Amazon.com referral fees", "https://sell.amazon.com/pricing")
AMZ_UK = fact("Amazon.co.uk referral fees (fee base taken as VAT-inclusive, the higher of two readings)",
              "https://sell.amazon.co.uk/pricing")
WMT_US = fact("Walmart Marketplace referral fees",
              "https://marketplacelearn.walmart.com/guides/Policies%20&%20standards/Product%20listings/Referral-fee-schedule-for-contract-categories")


def flat(pct: float, minimum: float, src: Source) -> FeeRule:
    return FeeRule((Tier(pct),), False, minimum, src)


def bands(minimum: float, src: Source, *tiers: tuple[float, float | None]) -> FeeRule:
    """One rate for the whole price, picked by price band."""
    return FeeRule(tuple(Tier(p, u) for p, u in tiers), True, minimum, src)


def marginal(minimum: float, src: Source, *tiers: tuple[float, float | None]) -> FeeRule:
    """Each rate applies to the slice of the price inside its band."""
    return FeeRule(tuple(Tier(p, u) for p, u in tiers), False, minimum, src)


NO_VAT = Source("fact", "US sales tax is collected and remitted by the marketplace (facilitator laws)")
UK_VAT = fact("UK VAT at 20%, accounted for by the marketplace on consignments up to £135",
              "https://www.gov.uk/guidance/vat-and-overseas-goods-sold-to-customers-in-the-uk-using-online-marketplaces")

CHANNELS = {
    "amazon_uk": Channel("amazon_uk", "Amazon UK", "GB", "GBP", {
        "home": bands(0.25, AMZ_UK, (0.08, 20), (0.15, None)),
        "kitchen": flat(0.15, 0.25, AMZ_UK),
        "beauty": bands(0.25, AMZ_UK, (0.08, 10), (0.15, None)),
        "clothing": bands(0.25, AMZ_UK, (0.05, 15), (0.10, 20), (0.15, None)),
        "jewelry": marginal(0.25, AMZ_UK, (0.20, 225), (0.05, None)),
        "toys": flat(0.15, 0.25, AMZ_UK),
        "sports": flat(0.15, 0.25, AMZ_UK),
    }, 0.20, UK_VAT),
    "amazon_us": Channel("amazon_us", "Amazon US", "US", "USD", {
        "home": flat(0.15, 0.30, AMZ_US),
        "kitchen": flat(0.15, 0.30, AMZ_US),
        "beauty": bands(0.30, AMZ_US, (0.08, 10), (0.15, None)),
        "clothing": bands(0.30, AMZ_US, (0.05, 15), (0.10, 20), (0.17, None)),
        "jewelry": marginal(0.30, AMZ_US, (0.20, 250), (0.05, None)),
        "toys": flat(0.15, 0.30, AMZ_US),
        "sports": flat(0.15, 0.30, AMZ_US),
    }, 0.0, NO_VAT),
    "walmart_us": Channel("walmart_us", "Walmart US", "US", "USD", {
        "home": flat(0.15, 0.0, WMT_US),
        "kitchen": flat(0.15, 0.0, WMT_US),
        "beauty": bands(0.0, WMT_US, (0.08, 10), (0.15, None)),
        "clothing": bands(0.0, WMT_US, (0.05, 15), (0.10, 20), (0.15, None)),
        "jewelry": marginal(0.0, WMT_US, (0.20, 250), (0.05, None)),
        "toys": flat(0.15, 0.0, WMT_US),
        "sports": flat(0.15, 0.0, WMT_US),
    }, 0.0, NO_VAT),
}

SHIP = Source("assumption", "Sample parcel rate card: replace with your carrier contract")

ROUTES = {
    ("IN", "US"): Route("IN", "US", "USD", 6.00, 9.00, (8, 14), SHIP),
    ("IN", "GB"): Route("IN", "GB", "GBP", 5.00, 7.00, (7, 12), SHIP),
    ("GB", "US"): Route("GB", "US", "USD", 9.00, 8.00, (5, 8), SHIP),
    ("GB", "GB"): Route("GB", "GB", "GBP", 3.20, 0.60, (2, 3), SHIP),
}

US_MFN = fact("US HTS column 1 general rate for the category's typical line (set an HS code for the exact rate)",
              "https://hts.usitc.gov/")
US_301 = fact("Section 301 action, 10% on goods of India and the UK from 24 Jul 2026 (91 FR 47318)",
              "https://www.federalregister.gov/documents/2026/07/28/2026-15181/notice-of-actions-in-section-301-investigations-of-acts-policies-and-practices-of-various-economies")
UK_DUTY = Source("assumption", "UK Global Tariff typical rate for the category; only charged over £135. Duty relief under £135 is still in force (ends by Oct 2028)",
                 "https://www.gov.uk/government/publications/reforming-customs-rules-for-low-value-imports/reforming-the-customs-treatment-of-low-value-imports-into-the-uk",
                 CHECKED)

# The line each US default comes from, shown in the rules screen.
US_MFN_LINES = {
    "home": ("6302.21.90", "Cotton bed linen", "fact"),
    "kitchen": ("—", "Varies 0–10% by material; set the HS code", "assumption"),
    "beauty": ("3304.99.50", "Beauty preparations", "fact"),
    "clothing": ("6109.10.00", "Cotton T-shirts", "fact"),
    "jewelry": ("7113.11.50", "Silver jewellery", "fact"),
    "toys": ("9503.00.00", "Toys", "fact"),
    "sports": ("9506.91.00", "Exercise equipment", "fact"),
}

DUTIES = {
    # US: no de minimis (suspended for all countries), duty on FOB value, plus Section 301 for IN and GB.
    "US": DutyRule({"home": 0.067, "kitchen": 0.04, "beauty": 0.0, "clothing": 0.165, "jewelry": 0.05,
                    "toys": 0.0, "sports": 0.046},
                   {"IN": 0.10, "GB": 0.10}, None, False, US_MFN, US_301),
    # UK: CIF value, no duty on consignments up to £135.
    "GB": DutyRule({"home": 0.12, "kitchen": 0.04, "beauty": 0.0, "clothing": 0.12, "jewelry": 0.025,
                    "toys": 0.0, "sports": 0.027},
                   {}, 135.0, True, UK_DUTY, UK_DUTY),
}

FALLBACK_FX = {"USD": 1.0, "GBP": 0.7476, "INR": 94.60}  # Frankfurter v2, 2026-10-22
FALLBACK_FX_SOURCE = Source("assumption", "Saved ECB rates from 2026-10-22 (live rates unavailable)",
                            "https://api.frankfurter.dev/v2/rates?base=USD&quotes=GBP,INR", CHECKED)

ASSUMPTION_SOURCE = Source("assumption", "Your settings: edit them under Rules")

# Editable keys -> (label, unit, default). Route keys are "route:IN-US:per_kg" and "route:IN-US:base".
ASSUMPTION_FIELDS = {
    "target_margin": ("Target margin", "%", Assumptions.target_margin),
    "returns_rate": ("Returns written off", "%", Assumptions.returns_rate),
    "payout_fx_fee": ("Payout conversion fee", "%", Assumptions.payout_fx_fee),
    "ad_spend": ("Advertising", "% of price", Assumptions.ad_spend),
}


def build_world(overrides: dict[str, float], fx: dict[str, float], fx_source: Source) -> World:
    a = Assumptions(**{k: overrides.get(k, d) for k, (_, _, d) in ASSUMPTION_FIELDS.items()})
    routes = {}
    for (o, d), r in ROUTES.items():
        key = f"route:{o}-{d}"
        edited = f"{key}:base" in overrides or f"{key}:per_kg" in overrides
        routes[(o, d)] = replace(
            r,
            base=overrides.get(f"{key}:base", r.base),
            per_kg=overrides.get(f"{key}:per_kg", r.per_kg),
            source=Source("assumption", "Your carrier rates") if edited else r.source,
        )
    return World(CHANNELS, routes, DUTIES, fx, fx_source, a, ASSUMPTION_SOURCE)
