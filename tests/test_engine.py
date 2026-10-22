"""Hand-calculated cases. The world here is a fixture with round numbers so
every expected value can be checked on paper; real rules live in rules.py."""

from dataclasses import replace

import pytest

from tradelane.engine import (
    Assumptions, Channel, DutyRule, FeeRule, Product, Route, Source, Tier, World,
    chargeable_kg, evaluate, referral_fee, sensitivity,
)

F = Source("fact", "test")
A = Source("assumption", "test")


def world(**over) -> World:
    us = Channel("amazon_us", "Amazon US", "US", "USD",
                 {"home": FeeRule((Tier(0.15),), False, 0.30, F)}, 0.0, F)
    uk = Channel("amazon_uk", "Amazon UK", "GB", "GBP",
                 {"home": FeeRule((Tier(0.153),), False, 0.25, F)}, 0.20, F)
    w = World(
        channels={"amazon_us": us, "amazon_uk": uk},
        routes={("IN", "US"): Route("IN", "US", "USD", 5, 10, (6, 10), A),
                ("IN", "GB"): Route("IN", "GB", "GBP", 4, 8, (5, 8), A),
                ("GB", "GB"): Route("GB", "GB", "GBP", 3, 1, (1, 2), A)},
        duties={"US": DutyRule({"home": 0.05}, {"IN": 0.25}, None, False, F, F),
                "GB": DutyRule({"home": 0.04}, {}, 135.0, True, F, F)},
        fx={"USD": 1.0, "GBP": 0.8, "INR": 80.0},
        fx_source=F,
        assumptions=Assumptions(payout_fx_fee=0.015, returns_rate=0.05, ad_spend=0.0, target_margin=0.20),
        assumption_source=A,
    )
    return replace(w, **over)


def lamp(**over) -> Product:
    p = Product("SKU-1", "Brass lamp", 800.0, "INR", 1.0, (10, 10, 10), "IN", "home",
                prices={"amazon_us": 50.0, "amazon_uk": 40.0})
    for k, v in over.items():
        setattr(p, k, v)
    return p


def amounts(r):
    return {l.key: round(l.amount, 4) for l in r.lines}


def test_us_lane_by_hand():
    r = evaluate(lamp(), "amazon_us", world())
    # cost 800 INR = $10; ship 5 + 10*1kg = 15; duty FOB 10 * (5% + 25%) = 3
    # fee 15% of 50 = 7.5; payout fx 1.5% of 50 = 0.75; returns 5% of 50 = 2.5
    assert amounts(r) == {"product": 10, "shipping": 15, "duty": 0.5, "tariff": 2.5, "fee": 7.5, "fx": 0.75, "returns": 2.5}
    assert r.profit == 11.25
    assert r.margin == pytest.approx(0.225)
    assert r.verdict == "list"


def test_uk_lane_vat_and_low_value_relief():
    r = evaluate(lamp(), "amazon_uk", world())
    # VAT inside £40 = 6.6667, net 33.3333 <= £135 so no duty
    # cost 800/80*0.8 = £8; ship 4 + 8 = 12; fee 15.3% of the VAT-inclusive 40 = 6.12
    a = amounts(r)
    assert a["vat"] == pytest.approx(6.6667, abs=1e-4)
    assert a["duty"] == 0
    assert a["fee"] == pytest.approx(6.12)
    assert r.net_revenue == pytest.approx(33.33, abs=0.01)
    assert r.profit == pytest.approx(5.05, abs=0.01)
    assert r.verdict == "check"


def test_uk_duty_applies_above_threshold_on_cif_value():
    r = evaluate(lamp(prices={"amazon_uk": 200.0}), "amazon_uk", world())
    # net 166.67 > 135, duty 4% of (cost 8 + shipping 12)
    assert amounts(r)["duty"] == pytest.approx(0.8)


def test_product_hs_rate_beats_category_default():
    p = lamp(duty_rates={"US": (0.10, Source("fact", "HTS 9405"))})
    a = amounts(evaluate(p, "amazon_us", world()))
    assert a["duty"] == pytest.approx(1.0) and a["tariff"] == pytest.approx(2.5)


def test_volumetric_weight_wins_when_bulky():
    assert chargeable_kg(1.0, (40, 30, 20), 5000) == pytest.approx(4.8)
    r = evaluate(lamp(dims_cm=(40, 30, 20)), "amazon_us", world())
    assert amounts(r)["shipping"] == pytest.approx(5 + 48)


@pytest.mark.parametrize("price,tiers,whole,expected", [
    (300, (Tier(0.20, 250), Tier(0.05)), False, 250 * 0.20 + 50 * 0.05),  # jewelry-style marginal tiers
    (12, (Tier(0.05, 15), Tier(0.17)), True, 0.60),                        # clothing-style price bands
    (20, (Tier(0.05, 15), Tier(0.17)), True, 3.40),
    (1, (Tier(0.15),), False, 0.30),                                       # minimum fee wins
])
def test_referral_fee_shapes(price, tiers, whole, expected):
    assert referral_fee(price, FeeRule(tiers, whole, 0.30, F)) == pytest.approx(expected)


def test_break_even_is_the_lowest_price_that_does_not_lose():
    w, p = world(), lamp()
    be = evaluate(p, "amazon_us", w).break_even
    assert evaluate(lamp(prices={"amazon_us": be}), "amazon_us", w).profit >= 0
    assert evaluate(lamp(prices={"amazon_us": be - 0.02}), "amazon_us", w).profit < 0


def test_missing_price_gives_target_price_that_hits_target():
    w = world()
    r = evaluate(lamp(prices={}), "amazon_us", w)
    assert r.verdict == "check" and r.profit is None and r.missing == ["market price"]
    hit = evaluate(lamp(prices={"amazon_us": r.target_price}), "amazon_us", w)
    assert hit.margin >= 0.20


def test_missing_weight_needs_data():
    r = evaluate(lamp(weight_kg=None), "amazon_us", world())
    assert r.verdict == "needs-data" and "weight" in r.missing


def test_ai_category_never_auto_lists():
    r = evaluate(lamp(category_source=Source("ai", "GLM")), "amazon_us", world())
    assert r.verdict == "check"


def test_domestic_lane_has_no_duty_or_fx_fee():
    p = Product("SKU-2", "Mug", 3.0, "GBP", 0.4, None, "GB", "home", prices={"amazon_uk": 18.0})
    a = amounts(evaluate(p, "amazon_uk", world()))
    assert "duty" not in a and a["fx"] == 0


def test_loss_is_skip():
    r = evaluate(lamp(prices={"amazon_us": 25.0}), "amazon_us", world())
    assert r.profit < 0 and r.verdict == "skip"


def test_sensitivity_moves_profit_both_ways_and_ranks_by_swing():
    swings = sensitivity(lamp(), "amazon_us", world())
    assert swings and all(s.low < s.base < s.high for s in swings)
    spans = [abs(s.high - s.low) for s in swings]
    assert spans == sorted(spans, reverse=True)
    assert swings[0].key == "price"
