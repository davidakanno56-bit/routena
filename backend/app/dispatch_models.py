from sqlalchemy import ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


class Passenger(Base):
    __tablename__ = "dispatch_passengers"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(160))


class PassengerSession(Base):
    __tablename__ = "dispatch_passenger_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    passenger_id: Mapped[int] = mapped_column(ForeignKey("dispatch_passengers.id"), index=True)
    expires_at: Mapped[int]


class OwnedQuote(Base):
    __tablename__ = "dispatch_quotes"
    quote_id: Mapped[str] = mapped_column(ForeignKey("quotes.id"), primary_key=True)
    passenger_id: Mapped[int] = mapped_column(ForeignKey("dispatch_passengers.id"), index=True)


class Availability(Base):
    __tablename__ = "dispatch_availability"
    driver_id: Mapped[int] = mapped_column(ForeignKey("driver_accounts.id"), primary_key=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("service_zones.id"))
    latitude: Mapped[float]
    longitude: Mapped[float]
    last_seen: Mapped[int]
    session_hash: Mapped[str] = mapped_column(String(64))


class Ride(Base):
    __tablename__ = "dispatch_rides"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    quote_id: Mapped[str] = mapped_column(ForeignKey("quotes.id"), unique=True)
    passenger_id: Mapped[int] = mapped_column(ForeignKey("dispatch_passengers.id"), index=True)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("driver_accounts.id"), index=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("service_zones.id"))
    status: Mapped[str] = mapped_column(String(32), index=True)
    deadline: Mapped[int]
    offer_until: Mapped[int | None]
    pickup_proximity_meters: Mapped[int | None]
    attempted: Mapped[list] = mapped_column(JSON, default=list)
    escrow_pin: Mapped[str | None] = mapped_column(String(6), nullable=True)
    escrow_amount: Mapped[str | None] = mapped_column(String(32), nullable=True)
    platform_fee: Mapped[str | None] = mapped_column(String(32), nullable=True)
    driver_payout: Mapped[str | None] = mapped_column(String(32), nullable=True)
    payout_status: Mapped[str | None] = mapped_column(String(32), nullable=True, default="HELD_IN_ESCROW")
    created_at: Mapped[int]
    updated_at: Mapped[int]


class DispatchLock(Base):
    __tablename__ = "dispatch_lock"
    id: Mapped[int] = mapped_column(primary_key=True)
    revision: Mapped[int]
