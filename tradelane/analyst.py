"""Ask Tradelane: an analyst that answers questions about the catalogue.

The model never sees the raw database. It calls a few tools that run the same
engine the screens use, so every number it quotes is one the app can show.
Steps are streamed as they happen; the whole exchange is saved."""

from __future__ import annotations

import json
import os
import time
from dataclasses import replace
from typing import Iterator

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import ai
from .catalogue import all_lanes, stats, to_engine, top_cost, world
from .db import Ask, ProductRow
from .engine import evaluate
from .rules import CATEGORIES, CHANNELS

DEADLINE_S = 240  # Vercel functions on fluid compute may run 300 s
MAX_ROUNDS = 4
FAST = {"reasoning_effort": "low"}  # GLM 5.3 thinks on every call; low effort keeps a multi-step answer quick

SYSTEM = """You are Tradelane's analyst for a cross-border seller (sourcing from India and the UK, selling on Amazon UK, Amazon US and Walmart US).
Answer from the tools only; never invent a product, price or rate. Call tools first, then answer.
Write like a sharp colleague: plain words, short. Lead with the answer in one sentence, then at most 5 bullets with the evidence (SKU or name, marketplace, money with its currency, margin %).
Margin means net profit over net revenue. Say when a number rests on an assumption (shipping rate card, returns, a 6-digit HS code). If something needs a person's decision, say which and why.
Under 170 words. Use **bold** sparingly. No tables, no headings.
Be economical: ask for everything you need in one round of tool calls when you can (several calls at once is fine)."""

TOOLS = [
    {"type": "function", "function": {
        "name": "catalogue_overview",
        "description": "Totals for the whole catalogue per marketplace: priced lanes, verdict counts, median margin, money-losing lanes and their main cost, approvals; plus the best and worst lanes.",
        "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {
        "name": "find_lanes",
        "description": "List product-marketplace lanes matching filters, with price, profit, margin, verdict and the biggest cost.",
        "parameters": {"type": "object", "properties": {
            "channel": {"type": "string", "enum": list(CHANNELS)},
            "verdict": {"type": "string", "enum": ["list", "check", "skip", "needs-data"]},
            "origin": {"type": "string", "enum": ["IN", "GB"]},
            "category": {"type": "string", "enum": list(CATEGORIES)},
            "max_margin": {"type": "number", "description": "e.g. 0 for lanes losing money"},
            "min_margin": {"type": "number"},
            "sort": {"type": "string", "enum": ["margin_desc", "margin_asc", "profit_desc", "profit_asc"]},
            "limit": {"type": "integer", "minimum": 1, "maximum": 15}}}}},
    {"type": "function", "function": {
        "name": "product_detail",
        "description": "Every cost line for one product on every marketplace, with break-even and target prices. Match by SKU or part of the name.",
        "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "what_if",
        "description": "Recompute one product on one marketplace with changed inputs, without saving anything.",
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string", "description": "SKU or part of the name"},
            "channel": {"type": "string", "enum": list(CHANNELS)},
            "price": {"type": "number", "description": "new shelf price in the marketplace currency"},
            "unit_cost": {"type": "number", "description": "new supplier cost in the product's cost currency"},
            "shipping_change_pct": {"type": "number", "description": "e.g. -20 for a 20% cheaper carrier"}},
            "required": ["query", "channel"]}}},
]

LABELS = {
    "catalogue_overview": lambda a: "Reading the whole catalogue",
    "find_lanes": lambda a: "Finding " + " ".join(filter(None, [
        {"skip": "money-losing", "list": "listable", "check": "borderline", "needs-data": "incomplete"}.get(a.get("verdict", ""), ""),
        "lanes", f"on {CHANNELS[a['channel']].name}" if a.get("channel") in CHANNELS else "",
        f"in {CATEGORIES[a['category']].lower()}" if a.get("category") in CATEGORIES else ""])),
    "product_detail": lambda a: f"Opening {a.get('query', 'a product')}",
    "what_if": lambda a: f"Testing a scenario for {a.get('query', 'a product')}",
}


def _find_product(s: Session, q: str) -> ProductRow | None:
    q = (q or "").strip().lower()
    rows = s.scalars(select(ProductRow)).all()
    return next((r for r in rows if r.sku.lower() == q), None) or next((r for r in rows if q and q in r.name.lower()), None)


def _lane_row(r: ProductRow, res) -> dict:
    t = top_cost(res)
    return {"sku": r.sku, "name": r.name, "channel": CHANNELS[res.channel].name, "currency": res.currency,
            "price": res.price, "profit": res.profit, "margin": None if res.margin is None else round(res.margin, 4),
            "verdict": res.verdict, "biggest_cost": f"{t[0]} {t[1]:.0%} of price" if t else None,
            "target_price": res.target_price}


def run_tool(s: Session, name: str, args: dict) -> tuple[dict, str]:
    """Returns (result for the model, one-line summary for the person watching)."""
    if name == "catalogue_overview":
        st = stats(s)
        return st, f"{st['products']} products, {st['waiting_for_review']} lanes waiting"
    if name == "find_lanes":
        rows = [(r, res) for r, res in all_lanes(s) if
                (not args.get("channel") or res.channel == args["channel"]) and
                (not args.get("verdict") or res.verdict == args["verdict"]) and
                (not args.get("origin") or r.origin == args["origin"]) and
                (not args.get("category") or r.category == args["category"]) and
                (args.get("max_margin") is None or (res.margin is not None and res.margin <= args["max_margin"])) and
                (args.get("min_margin") is None or (res.margin is not None and res.margin >= args["min_margin"]))]
        key = {"margin_desc": lambda x: -(x[1].margin or -9), "margin_asc": lambda x: x[1].margin or 9,
               "profit_desc": lambda x: -(x[1].profit or -9e9), "profit_asc": lambda x: x[1].profit or 9e9}[args.get("sort", "margin_asc")]
        rows.sort(key=key)
        out = [_lane_row(*x) for x in rows[: int(args.get("limit", 8))]]
        return {"count": len(rows), "lanes": out}, f"{len(rows)} lanes match"
    if name == "product_detail":
        r = _find_product(s, args.get("query", ""))
        if not r:
            return {"error": "No product matches that"}, "no match"
        w, p = world(s), to_engine(r)
        lanes = []
        for cid in CHANNELS:
            if (r.origin, CHANNELS[cid].country) not in {(o, d) for o, d in w.routes}:
                continue
            res = evaluate(p, cid, w)
            lanes.append({**_lane_row(r, res), "break_even": res.break_even, "reasons": res.reasons, "missing": res.missing,
                          "lines": [{"cost": l.label, "amount": round(l.amount, 2), "source": l.source.kind} for l in res.lines]})
        return {"sku": r.sku, "name": r.name, "origin": r.origin, "category": r.category, "category_confirmed": r.category_kind == "fact",
                "unit_cost": r.unit_cost, "cost_currency": r.cost_currency, "weight_kg": r.weight_kg, "hs_code": r.hs_code,
                "lanes": lanes}, r.name
    if name == "what_if":
        r = _find_product(s, args.get("query", ""))
        cid = args.get("channel")
        if not r or cid not in CHANNELS:
            return {"error": "Need a product and a marketplace"}, "no match"
        w, p = world(s), to_engine(r)
        before = evaluate(p, cid, w)
        if args.get("price") is not None:
            p = replace(p, prices={**p.prices, cid: float(args["price"])})
        if args.get("unit_cost") is not None:
            p = replace(p, unit_cost=float(args["unit_cost"]))
        if args.get("shipping_change_pct") is not None:
            k = 1 + float(args["shipping_change_pct"]) / 100
            key = (p.origin, CHANNELS[cid].country)
            if key in w.routes:
                rt = w.routes[key]
                w = replace(w, routes={**w.routes, key: replace(rt, base=rt.base * k, per_kg=rt.per_kg * k)})
        after = evaluate(p, cid, w)
        pick = lambda x: {"price": x.price, "profit": x.profit, "margin": None if x.margin is None else round(x.margin, 4), "verdict": x.verdict}
        return {"product": r.name, "channel": CHANNELS[cid].name, "currency": after.currency, "before": pick(before), "after": pick(after)}, \
            f"margin {_pct(before.margin)} → {_pct(after.margin)}"
    return {"error": f"unknown tool {name}"}, "unknown tool"


def _pct(m):
    return "—" if m is None else f"{m:.1%}"


def _client():
    from openai import OpenAI

    return OpenAI(api_key=os.environ["GLM_API_KEY"], base_url=os.environ.get("GLM_BASE_URL", "https://api.aicredits.in/v1"), timeout=90)


def ask(s: Session, user_id: str, question: str, context_sku: str | None = None) -> Iterator[dict]:
    """Yields {type: step|answer|error} events and saves the exchange."""
    started = time.monotonic()
    steps: list[dict] = []
    record = Ask(user_id=user_id, question=question)
    if not ai.enabled():
        yield {"type": "error", "message": "The AI is off: add GLM_API_KEY to turn on the analyst."}
        return
    messages = [{"role": "system", "content": SYSTEM}]
    if context_sku:
        messages.append({"role": "system", "content": f"The person is looking at product {context_sku}."})
    messages.append({"role": "user", "content": question})
    client, answer = _client(), ""
    try:
        for _ in range(MAX_ROUNDS):
            late = time.monotonic() - started > DEADLINE_S - 15
            resp = client.chat.completions.create(model=ai.model_name(), messages=messages,
                                                  tools=None if late else TOOLS, tool_choice=None if late else "auto",
                                                  extra_body=FAST)
            msg = resp.choices[0].message
            if not msg.tool_calls:
                answer = (msg.content or "").strip()
                break
            messages.append({"role": "assistant", "content": msg.content or "",
                             "tool_calls": [tc.model_dump() for tc in msg.tool_calls]})
            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                label = LABELS.get(tc.function.name, lambda a: tc.function.name)(args)
                yield {"type": "step", "label": label, "tool": tc.function.name, "args": args, "status": "running"}
                result, summary = run_tool(s, tc.function.name, args)
                step = {"type": "step", "label": label, "tool": tc.function.name, "args": args, "status": "done", "summary": summary}
                steps.append(step)
                yield step
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result, default=str)[:12000]})
        if not answer:
            resp = client.chat.completions.create(model=ai.model_name(), messages=messages + [
                {"role": "user", "content": "Answer now with what you have."}])
            answer = (resp.choices[0].message.content or "").strip()
    except Exception as e:  # gateway, timeout or model error: say so, keep what we had
        yield {"type": "error", "message": f"The analyst stopped: {e}"}
        answer = answer or ""
    record.answer, record.steps, record.ms = answer, steps, int((time.monotonic() - started) * 1000)
    s.add(record)
    s.commit()
    if answer:
        yield {"type": "answer", "text": answer, "id": record.id, "ms": record.ms}


BRIEF_SYSTEM = """You write the morning brief for a cross-border seller's team. From the JSON stats only, write 3 short bullets:
what is working, what is losing money and why (name the marketplace and the main cost), and the single most useful next action.
Each bullet one sentence, under 28 words, with real numbers from the JSON. No greeting, no headings. Start each bullet with "- "."""


def brief(s: Session) -> tuple[str, str]:
    """Returns (text, who wrote it)."""
    st = stats(s)
    if not ai.enabled():
        worst = max(st["channels"].items(), key=lambda kv: kv[1]["losing"])
        return (f"- {sum(c['list'] for c in st['channels'].values())} lanes clear the {st['target_margin']:.0%} target.\n"
                f"- {worst[0]} loses money on {worst[1]['losing']} products, mostly to {worst[1]['main_cost_in_losers']}.\n"
                f"- {st['waiting_for_review']} lanes are waiting for a decision.", "template")
    resp = _client().chat.completions.create(model=ai.model_name(), messages=[
        {"role": "system", "content": BRIEF_SYSTEM}, {"role": "user", "content": json.dumps(st, default=str)}], extra_body=FAST)
    return (resp.choices[0].message.content or "").strip(), ai.model_name()
