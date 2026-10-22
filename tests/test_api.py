"""The API end to end on a throwaway SQLite file, with outside calls stubbed so
the test never touches the network."""

import csv
import io
import os
import tempfile

import pytest

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ.pop("GLM_API_KEY", None)

from fastapi.testclient import TestClient  # noqa: E402

from tradelane import app as appmod  # noqa: E402
from tradelane.rules import FALLBACK_FX, FALLBACK_FX_SOURCE  # noqa: E402


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    from tradelane import catalogue
    monkeypatch.setattr(catalogue, "fx_rates", lambda s: (FALLBACK_FX, FALLBACK_FX_SOURCE))
    monkeypatch.setattr(appmod, "us_mfn", lambda s, hs: (0.05, "9999.99.99") if hs else None)


@pytest.fixture
def c():
    client = TestClient(appmod.app)
    assert client.post("/api/login", json={"user_id": "rohan"}).status_code == 200
    assert client.post("/api/products/sample").json()["imported"] == 30
    return client


def test_everything_needs_a_demo_user():
    anon = TestClient(appmod.app)
    assert anon.get("/api/products").status_code == 401
    assert anon.get("/api/users").json()[0]["id"] == "asha"
    anon.cookies.set("tl_session", "rohan.forged")
    assert anon.get("/api/me").status_code == 401


def test_only_the_approver_decides_and_everything_is_logged(c):
    buyer = TestClient(appmod.app)
    buyer.post("/api/login", json={"user_id": "asha"})
    pid = by_sku(c, "JWL-BR-403")["id"]
    r = buyer.post("/api/reviews", json={"product_id": pid, "channel": "amazon_us", "decision": "approved"})
    assert r.status_code == 403
    buyer.patch(f"/api/products/{pid}", json={"prices": {"amazon_us": 175.0}})
    c.post("/api/reviews", json={"product_id": pid, "channel": "amazon_us", "decision": "approved"})
    feed = c.get("/api/activity").json()
    assert feed[0]["user"] == "rohan" and feed[0]["kind"] == "review" and "approved Amazon US" in feed[0]["message"]
    assert feed[1]["user"] == "asha" and feed[1]["kind"] == "price"


def test_analyst_says_plainly_when_ai_is_off(c):
    body = c.post("/api/ask", json={"question": "Which lanes lose money?"}).text
    assert '"type": "error"' in body and "GLM_API_KEY" in body


def test_analyst_tools_answer_from_the_engine(c):
    from tradelane.analyst import run_tool
    from tradelane.db import session
    with session() as s:
        losing, summary = run_tool(s, "find_lanes", {"max_margin": 0, "sort": "margin_asc", "limit": 3})
        assert losing["count"] > 0 and all(l["margin"] <= 0 for l in losing["lanes"])
        sku = losing["lanes"][0]["sku"]
        ch = next(k for k, v in __import__("tradelane.rules", fromlist=["CHANNELS"]).CHANNELS.items() if v.name == losing["lanes"][0]["channel"])
        better, _ = run_tool(s, "what_if", {"query": sku, "channel": ch, "price": losing["lanes"][0]["target_price"]})
        assert better["after"]["margin"] >= 0.2 > better["before"]["margin"]


def by_sku(c, sku):
    return next(p for p in c.get("/api/products").json()["products"] if p["sku"] == sku)


def test_sample_prices_every_lane(c):
    products = c.get("/api/products").json()["products"]
    lanes = [l for p in products for l in p["lanes"]]
    assert len(lanes) == 90
    assert {l["verdict"] for l in lanes} == {"list", "check", "skip", "needs-data"}
    # a product with no weight cannot be priced anywhere
    assert {l["verdict"] for l in by_sku(c, "GBR-MG-704")["lanes"]} == {"needs-data"}


def test_classify_without_key_uses_keyword_match_and_never_auto_lists(c):
    pid = by_sku(c, "MRD-PL-008")["id"]
    p = c.post(f"/api/products/{pid}/classify").json()
    assert p["category"] == "home" and p["category_kind"] == "assumption" and p["ai"]["by"] == "keyword match"
    assert all(l["verdict"] != "list" for l in p["lanes"])
    p = c.patch(f"/api/products/{pid}", json={"category": "home"}).json()
    assert p["category_kind"] == "fact"


def test_price_edit_moves_the_verdict(c):
    pid = by_sku(c, "FAB-TS-303")["id"]
    lane = lambda p: next(l for l in p["lanes"] if l["channel"] == "amazon_us")
    before = lane(c.get(f"/api/products/{pid}").json())
    after = lane(c.patch(f"/api/products/{pid}", json={"prices": {"amazon_us": before["target_price"]}}).json())
    assert after["margin"] >= 0.20 and after["verdict"] == "list"


def test_rule_edit_applies_everywhere_and_resets(c):
    count = lambda: sum(l["verdict"] == "list" for p in c.get("/api/products").json()["products"] for l in p["lanes"])
    base = count()
    assert c.put("/api/rules", json={"key": "target_margin", "value": 0.35}).status_code == 200
    assert count() < base
    assert c.put("/api/rules", json={"key": "target_margin", "value": 20}).status_code == 422  # percent, not fraction
    c.delete("/api/rules/target_margin")
    assert count() == base


def test_review_export_and_guardrails(c):
    good = by_sku(c, "JWL-BR-403")
    missing = by_sku(c, "GBR-MG-704")
    r = c.post("/api/reviews", json={"product_id": missing["id"], "channel": "amazon_uk", "decision": "approved"})
    assert r.status_code == 422 and "weight" in r.json()["detail"]
    assert c.post("/api/reviews", json={"product_id": good["id"], "channel": "amazon_us", "decision": "approved", "note": "strong"}).status_code == 200
    assert c.post("/api/reviews", json={"product_id": good["id"], "channel": "walmart_us", "decision": "rejected"}).status_code == 200
    rows = list(csv.DictReader(io.StringIO(c.get("/api/export.csv?channel=amazon_us").text)))
    assert [r["sku"] for r in rows] == ["JWL-BR-403"] and rows[0]["note"] == "strong"
    assert list(csv.DictReader(io.StringIO(c.get("/api/export.csv?channel=walmart_us").text))) == []


def test_import_reports_bad_rows_and_keeps_good_ones(c):
    sheet = "name,unit_cost,weight_kg,origin,category\nGood mug,200,0.4,IN,kitchen\n,100,1,IN,\nBad origin,1,1,CN,\nOdd cat,5,1,IN,gadgets\n"
    r = c.post("/api/products/import?replace_all=true", files={"file": ("s.csv", sheet, "text/csv")}).json()
    assert r["imported"] == 1 and len(r["errors"]) == 3
    assert c.post("/api/products/import", files={"file": ("s.txt", "x", "text/plain")}).status_code == 422
