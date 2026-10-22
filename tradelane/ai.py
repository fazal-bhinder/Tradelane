"""The one AI job: read a supplier row and suggest category, HS code and listing copy.

The model may only pick a category from a fixed list, and its answer is
validated before anything is saved. Without an API key a keyword match stands
in, labelled as such, so the app still works end to end.
"""

from __future__ import annotations

import json
import os
import re

from pydantic import BaseModel, Field, ValidationError, field_validator

from .rules import CATEGORIES


class Suggestion(BaseModel):
    category: str
    hs_code: str = Field(description="6-digit HS code, digits only")
    confidence: float = Field(ge=0, le=1)
    reasoning: str = Field(max_length=400)
    title: str = Field(max_length=200)
    bullets: list[str] = Field(min_length=3, max_length=5)

    @field_validator("category")
    @classmethod
    def known_category(cls, v: str) -> str:
        if v not in CATEGORIES:
            raise ValueError(f"category must be one of {list(CATEGORIES)}")
        return v

    @field_validator("hs_code")
    @classmethod
    def six_digits(cls, v: str) -> str:
        d = re.sub(r"\D", "", v)
        if len(d) < 6:
            raise ValueError("hs_code needs at least 6 digits")
        return d[:6]


TOOL = {
    "type": "function",
    "function": {
        "name": "classify_product",
        "description": "Classify one supplier product for cross-border marketplace listing.",
        "parameters": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "enum": list(CATEGORIES)},
                "hs_code": {"type": "string", "description": "6-digit Harmonized System code, digits only"},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1,
                               "description": "How sure you are of the category AND the HS code together"},
                "reasoning": {"type": "string", "description": "One or two sentences: material and use that decided the code"},
                "title": {"type": "string", "description": "Marketplace listing title, under 150 characters, no ALL CAPS, no claims you cannot verify"},
                "bullets": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 5,
                            "description": "Factual listing bullets from the supplier data only"},
            },
            "required": ["category", "hs_code", "confidence", "reasoning", "title", "bullets"],
        },
    },
}

SYSTEM = (
    "You classify products for a cross-border e-commerce seller. Use only facts in the supplier row. "
    "Pick the HS code from the product's material and use, as a customs broker would. "
    "Lower your confidence when the material is not stated. Never invent certifications, sizes or brand names."
)


def model_name() -> str:
    return os.environ.get("GLM_MODEL", "z-ai/glm-5.3-flash")


def enabled() -> bool:
    return bool(os.environ.get("GLM_API_KEY"))


def _row_text(name: str, description: str, supplier_category: str | None) -> str:
    return json.dumps({"name": name, "description": description, "supplier_category": supplier_category or ""})


def classify(name: str, description: str, supplier_category: str | None = None) -> tuple[Suggestion, str]:
    """Returns the suggestion and who made it ('model id' or 'keyword match')."""
    if not enabled():
        return keyword_guess(name, description), "keyword match"
    from openai import OpenAI

    client = OpenAI(api_key=os.environ["GLM_API_KEY"],
                    base_url=os.environ.get("GLM_BASE_URL", "https://api.aicredits.in/v1"), timeout=50)
    messages = [{"role": "system", "content": SYSTEM},
                {"role": "user", "content": _row_text(name, description, supplier_category)}]
    last_error = ""
    for _ in range(2):  # one retry, with the validation error fed back
        resp = client.chat.completions.create(
            model=model_name(), messages=messages, tools=[TOOL],
            tool_choice={"type": "function", "function": {"name": "classify_product"}},
        )
        msg = resp.choices[0].message
        raw = msg.tool_calls[0].function.arguments if msg.tool_calls else _json_in(msg.content or "")
        try:
            return Suggestion.model_validate_json(raw), model_name()
        except ValidationError as e:
            last_error = str(e)
            messages += [{"role": "assistant", "content": raw},
                         {"role": "user", "content": f"That answer was invalid: {last_error}. Call classify_product again."}]
    raise ValueError(f"Model answer failed validation twice: {last_error}")


def _json_in(text: str) -> str:
    """Some gateways answer in text instead of a tool call: take the first JSON object."""
    m = re.search(r"\{.*\}", text, re.S)
    return m.group(0) if m else "{}"


KEYWORDS = [
    ("jewelry", r"earring|necklace|bracelet|ring|pendant|anklet|jewel\w*|jhumka|bangle|choker", "711311"),
    ("clothing", r"\w*shirt|kurta|dress|scarf|stole|shawl|saree|jacket|tee|top|trouser|dupatta", "610910"),
    ("beauty", r"soap|oil|serum|cream|lotion|balm|scrub|shampoo|face|hair", "330499"),
    ("toys", r"toy|puzzle|doll|game|blocks|kite", "950300"),
    ("sports", r"yoga|mat|gym|cricket|ball|bat|dumbbell|resistance|fitness", "950691"),
    ("kitchen", r"mug|cup|plate|bowl|spice|tea\b|kitchen|tray|coaster|bottle|jar|cutlery|spoon", "732393"),
    ("home", r"cushion|throw|blanket|rug|lamp|candle|vase|bedsheet|bed sheet|quilt|curtain|planter|decor|frame", "630221"),
]


def keyword_guess(name: str, description: str) -> Suggestion:
    text = f"{name} {description}".lower()
    for cat, pattern, hs in KEYWORDS:
        if re.search(rf"\b(?:{pattern})s?\b", text):
            return Suggestion(category=cat, hs_code=hs, confidence=0.35,
                              reasoning=f"Keyword match on the name ({CATEGORIES[cat].lower()}); no AI key set.",
                              title=name, bullets=[description or name, "Ships from the origin warehouse", "See listing for size and material"])
    return Suggestion(category="home", hs_code="630221", confidence=0.1, reasoning="No keyword matched; defaulted to home.",
                      title=name, bullets=[description or name, "Ships from the origin warehouse", "See listing for size and material"])
