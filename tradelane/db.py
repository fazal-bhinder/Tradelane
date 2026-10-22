"""Storage. Neon Postgres in production (DATABASE_URL), SQLite file locally."""

from __future__ import annotations

import os
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import NullPool


def _url() -> str:
    # Without Neon, Vercel can only write to /tmp: the demo still works, but resets on a cold start.
    url = os.environ.get("DATABASE_URL") or ("sqlite:////tmp/tradelane.db" if os.environ.get("VERCEL") else "sqlite:///./tradelane.db")
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


URL = _url()
if URL.startswith("sqlite"):
    engine = create_engine(URL, poolclass=NullPool, connect_args={"check_same_thread": False})
else:
    # A small pool: a new TLS handshake to Neon costs ~2 s from far away, and warm serverless
    # instances reuse it. connect_timeout makes libpq move on from an address that hangs
    # (an unreachable IPv6 route otherwise blocks for minutes).
    engine = create_engine(URL, pool_size=2, max_overflow=3, pool_pre_ping=True, pool_recycle=240,
                           connect_args={"connect_timeout": 10})
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class ProductRow(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sku: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    supplier: Mapped[str] = mapped_column(String(120), default="")
    unit_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    cost_currency: Mapped[str] = mapped_column(String(3), default="INR")
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    length_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    width_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    origin: Mapped[str] = mapped_column(String(2), default="IN")
    category: Mapped[str | None] = mapped_column(String(32), nullable=True)
    category_kind: Mapped[str] = mapped_column(String(16), default="unknown")  # fact | ai | assumption | unknown
    hs_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    us_mfn: Mapped[float | None] = mapped_column(Float, nullable=True)  # from the HS code, via the HTS API
    us_mfn_line: Mapped[str | None] = mapped_column(String(32), nullable=True)
    prices: Mapped[dict] = mapped_column(JSON, default=dict)  # channel id -> shelf price
    ai: Mapped[dict] = mapped_column(JSON, default=dict)  # model output: confidence, reasoning, title, bullets
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Review(Base):
    __tablename__ = "reviews"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(32))
    decision: Mapped[str] = mapped_column(String(16))  # approved | rejected
    user_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    snapshot: Mapped[dict] = mapped_column(JSON)  # the evaluation the decision was made on
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(16))  # buyer | approver
    title: Mapped[str] = mapped_column(String(80))
    color: Mapped[str] = mapped_column(String(9))


class Event(Base):
    """The activity log: every change, who made it and when."""

    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(32))
    message: Mapped[str] = mapped_column(Text)
    product_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    channel: Mapped[str | None] = mapped_column(String(32), nullable=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class Ask(Base):
    """A question put to the analyst, with the steps it took and its answer."""

    __tablename__ = "asks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text, default="")
    steps: Mapped[list] = mapped_column(JSON, default=list)
    ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[float] = mapped_column(Float)


class Cache(Base):
    __tablename__ = "cache"
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


DEMO_USERS = [
    User(id="asha", name="Asha Mehta", role="buyer", title="Buyer, sources products", color="#533afd"),
    User(id="rohan", name="Rohan Kapoor", role="approver", title="Head of growth, approves listings", color="#ea2261"),
]


def init_db() -> None:
    Base.metadata.create_all(engine)
    with session() as s:
        for u in DEMO_USERS:
            if not s.get(User, u.id):
                s.add(User(id=u.id, name=u.name, role=u.role, title=u.title, color=u.color))
        s.commit()


def session() -> Session:
    return SessionLocal()
