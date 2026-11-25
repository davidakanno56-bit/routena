"""Synthetic driver onboarding API. Driver claims stay separate from fare rules."""

import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from decimal import Decimal
from time import time
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from .config import settings
from .db import get_db
from .models import City, DriverAccount, DriverReview, DriverSession, DriverVehicle, NigerianState

SESSION_SECONDS = 12 * 60 * 60
PASSWORD_ROUNDS = 600_000
EDITABLE = {"DRAFT", "MORE_INFORMATION_REQUIRED"}
REVIEW_TRANSITIONS = {
    "PENDING_REVIEW": {"APPROVED", "REJECTED", "MORE_INFORMATION_REQUIRED"},
    "APPROVED": {"SUSPENDED"},
}
CATEGORIES = {"Economy": "STANDARD", "Comfort": "PREMIUM", "Moto": "MOTORCYCLE"}
bearer = HTTPBearer(auto_error=False)
Database = Annotated[Session, Depends(get_db)]
Credential = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def demo_only(response: Response):
    if not settings.driver_onboarding_demo:
        raise HTTPException(404, "Driver onboarding is unavailable.")
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(prefix="/api/v1", dependencies=[Depends(demo_only)], tags=["Driver onboarding demo"])


class DemoInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class DriverProfileInput(DemoInput):
    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(pattern=r"^\+[1-9][0-9]{7,14}$")
    city_id: int = Field(gt=0)


class Registration(DriverProfileInput):
    email: str = Field(max_length=254, pattern=r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[Tt][Ee][Ss][Tt]$")
    password: SecretStr
    demo_acknowledged: Literal[True]


class Login(DemoInput):
    email: str = Field(min_length=3, max_length=254)
    password: SecretStr


class VehicleInput(DemoInput):
    category: Literal["Economy", "Comfort", "Moto"]
    manufacturer: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=60)
    year: int = Field(ge=1980)
    colour: str = Field(min_length=1, max_length=40)
    registration_number: str = Field(pattern=r"^DEMO-[A-Z0-9-]{2,26}$")
    fuel_type: Literal["PMS", "DIESEL", "HYBRID", "ELECTRIC"]
    claimed_fuel_efficiency: Annotated[float, Field(gt=0, le=200)] | None = None

    @field_validator("year")
    @classmethod
    def reasonable_year(cls, year: int):
        if year > datetime.now(timezone.utc).year + 1:
            raise ValueError("Vehicle model year is too far in the future.")
        return year


class DocumentInput(DemoInput):
    licence_placeholder: str = Field(pattern=r"^DEMO-[A-Z0-9-]{2,26}$")
    vehicle_documents_ready: bool


class ReviewInput(DemoInput):
    status: Literal["APPROVED", "REJECTED", "MORE_INFORMATION_REQUIRED", "SUSPENDED"]
    feedback: str = Field(min_length=3, max_length=1000)


Status = Literal["DRAFT", "PENDING_REVIEW", "MORE_INFORMATION_REQUIRED", "APPROVED", "REJECTED", "SUSPENDED"]


class OperatingCity(BaseModel):
    id: int
    city: str
    state: str
    state_code: str


class ApplicationSummary(BaseModel):
    id: int
    full_name: str
    city_id: int
    status: Status
    demo_only: Literal[True]


class VehicleDetails(BaseModel):
    category: Literal["Economy", "Comfort", "Moto"]
    vehicle_class: Literal["STANDARD", "PREMIUM", "MOTORCYCLE"]
    manufacturer: str
    model: str
    year: int
    colour: str
    registration_number: str
    fuel_type: str
    claimed_fuel_efficiency: Decimal | None
    fuel_efficiency_verified: Literal[False]
    status: Status


class ApplicationDetails(ApplicationSummary):
    email: str
    phone: str
    city: str
    state: str
    state_code: str
    licence_placeholder: str | None
    vehicle_documents_ready: bool
    documents_verified: Literal[False]
    review_feedback: str | None
    vehicle: VehicleDetails | None


class ReviewEvent(BaseModel):
    from_status: Status
    to_status: Status
    actor: Literal["DRIVER", "DEMO_ADMIN"]
    feedback: str | None
    occurred_at: datetime


class AdminApplication(ApplicationDetails):
    history: list[ReviewEvent]


class SessionDetails(BaseModel):
    access_token: str
    token_type: Literal["bearer"]
    expires_in: int
    demo_only: Literal[True]


def password_digest(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_ROUNDS).hex()


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def unauthorized():
    return HTTPException(401, "Valid driver credentials are required.", headers={"WWW-Authenticate": "Bearer"})


def driver_session(db: Database, credential: Credential):
    if credential is None or len(credential.credentials) != 43:
        raise unauthorized()
    session = db.get(DriverSession, token_digest(credential.credentials))
    if not session or session.expires_at <= int(time()):
        raise unauthorized()
    return session


ActiveSession = Annotated[DriverSession, Depends(driver_session)]


def own_account(db: Database, session: ActiveSession):
    account = db.get(DriverAccount, session.driver_id)
    if not account:
        raise unauthorized()
    return account


OwnAccount = Annotated[DriverAccount, Depends(own_account)]


def reviewer(credential: Credential):
    token = settings.driver_review_token
    if not token or len(token) < 32 or not credential or not hmac.compare_digest(token.encode(), credential.credentials.encode()):
        raise HTTPException(403, "Driver review authorization is required.")


def operating_city(db: Session, city_id: int):
    city = db.get(City, city_id)
    if not city or not city.is_active:
        raise HTTPException(422, "Select an active operating city.")


def allow_edit(account: DriverAccount):
    if account.status not in EDITABLE:
        raise HTTPException(409, "You can edit a draft or an application returned for corrections.")


def commit(db: Session):
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "An account or vehicle with those details already exists.") from exc
    except StaleDataError as exc:
        db.rollback()
        raise HTTPException(409, "The application has changed. Reload it and try again.") from exc


def vehicle_details(vehicle: DriverVehicle | None):
    if not vehicle:
        return None
    return {
        "category": next(category for category, value in CATEGORIES.items() if value == vehicle.vehicle_class),
        "vehicle_class": vehicle.vehicle_class, "manufacturer": vehicle.manufacturer, "model": vehicle.model,
        "year": vehicle.year, "colour": vehicle.colour, "registration_number": vehicle.registration_number,
        "fuel_type": vehicle.fuel_type, "claimed_fuel_efficiency": vehicle.claimed_fuel_efficiency,
        "fuel_efficiency_verified": False, "status": vehicle.status,
    }


def application(db: Session, account: DriverAccount):
    city = db.get(City, account.city_id)
    state = db.get(NigerianState, city.state_id)
    return {
        "id": account.id, "full_name": account.full_name, "email": account.email, "phone": account.phone,
        "city_id": city.id, "city": city.name, "state": state.name, "state_code": state.code,
        "status": account.status, "review_feedback": account.review_feedback, "demo_only": True,
        "licence_placeholder": account.licence_placeholder, "vehicle_documents_ready": account.vehicle_documents_ready,
        "documents_verified": False, "vehicle": vehicle_details(db.get(DriverVehicle, account.id)),
    }


@router.get("/drivers/cities", response_model=list[OperatingCity])
def cities(db: Database):
    rows = db.execute(select(City, NigerianState).join(NigerianState, City.state_id == NigerianState.id)
                      .where(City.is_active.is_(True)).order_by(NigerianState.name, City.name, City.id))
    return [{"id": city.id, "city": city.name, "state": state.name, "state_code": state.code} for city, state in rows]


@router.post("/drivers/register", status_code=201, response_model=ApplicationDetails)
def register(data: Registration, db: Database):
    password = data.password.get_secret_value()
    if not 12 <= len(password) <= 128:
        raise HTTPException(422, "Password must be 12 to 128 characters.")
    operating_city(db, data.city_id)
    salt = secrets.token_bytes(16)
    account = DriverAccount(
        **data.model_dump(include={"full_name", "phone", "city_id"}),
        email=data.email.lower(), password_hash=f"{salt.hex()}${password_digest(password, salt)}",
    )
    db.add(account)
    commit(db)
    return application(db, account)


@router.post("/drivers/login", response_model=SessionDetails)
def login(data: Login, db: Database):
    password = data.password.get_secret_value()
    if len(password) > 128:
        raise unauthorized()
    account = db.scalar(select(DriverAccount).where(DriverAccount.email == data.email.lower()))
    salt, expected = account.password_hash.split("$") if account else ("0" * 32, "0" * 64)
    valid = hmac.compare_digest(password_digest(password, bytes.fromhex(salt)), expected)
    if not valid or not account:
        raise unauthorized()
    now = int(time())
    db.execute(delete(DriverSession).where(DriverSession.driver_id == account.id, DriverSession.expires_at <= now))
    token = secrets.token_urlsafe(32)
    db.add(DriverSession(token_hash=token_digest(token), driver_id=account.id, expires_at=now + SESSION_SECONDS))
    commit(db)
    return {"access_token": token, "token_type": "bearer", "expires_in": SESSION_SECONDS, "demo_only": True}


@router.post("/drivers/logout", status_code=204)
def logout(db: Database, session: ActiveSession):
    db.execute(delete(DriverSession).where(DriverSession.token_hash == session.token_hash))
    db.commit()
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.get("/drivers/me", response_model=ApplicationDetails)
def profile(db: Database, account: OwnAccount):
    return application(db, account)


@router.put("/drivers/me/profile", response_model=ApplicationDetails)
def update_profile(data: DriverProfileInput, db: Database, account: OwnAccount):
    allow_edit(account)
    operating_city(db, data.city_id)
    for field, value in data.model_dump().items():
        setattr(account, field, value)
    commit(db)
    return application(db, account)


@router.put("/drivers/me/vehicle", response_model=ApplicationDetails)
def update_vehicle(data: VehicleInput, db: Database, account: OwnAccount):
    allow_edit(account)
    vehicle_class = CATEGORIES[data.category]
    if vehicle_class not in settings.allowed_vehicle_classes:
        raise HTTPException(422, "This vehicle category is unavailable.")
    vehicle = db.get(DriverVehicle, account.id)
    if not vehicle:
        vehicle = DriverVehicle(driver_id=account.id)
        db.add(vehicle)
    for field, value in data.model_dump(exclude={"category"}).items():
        setattr(vehicle, field, value)
    vehicle.vehicle_class = vehicle_class
    vehicle.status = "DRAFT"
    account.vehicle_documents_ready = False
    account.revision += 1
    commit(db)
    return application(db, account)


@router.put("/drivers/me/documents", response_model=ApplicationDetails)
def update_documents(data: DocumentInput, db: Database, account: OwnAccount):
    allow_edit(account)
    if data.vehicle_documents_ready and not db.get(DriverVehicle, account.id):
        raise HTTPException(409, "Register a vehicle first.")
    account.licence_placeholder = data.licence_placeholder
    account.vehicle_documents_ready = data.vehicle_documents_ready
    commit(db)
    return application(db, account)


def transition(db: Session, account: DriverAccount, vehicle: DriverVehicle, status: str, actor: str,
               feedback: str | None = None):
    db.add(DriverReview(
        driver_id=account.id, previous_status=account.status, new_status=status, actor=actor,
        feedback=feedback, occurred_at=datetime.now(timezone.utc),
    ))
    account.status = vehicle.status = status
    account.review_feedback = feedback
    commit(db)
    return application(db, account)


@router.post("/drivers/me/submit", response_model=ApplicationDetails)
def submit(db: Database, account: OwnAccount):
    allow_edit(account)
    operating_city(db, account.city_id)
    vehicle = db.get(DriverVehicle, account.id)
    if not vehicle or not account.licence_placeholder or not account.vehicle_documents_ready:
        raise HTTPException(409, "Complete the vehicle and demo document stages before submitting.")
    return transition(db, account, vehicle, "PENDING_REVIEW", "DRIVER")


@router.get("/admin/drivers", dependencies=[Depends(reviewer)], response_model=list[ApplicationSummary])
def review_queue(db: Database, offset: Annotated[int, Query(ge=0)] = 0, status: Status = "PENDING_REVIEW"):
    records = db.scalars(select(DriverAccount).where(DriverAccount.status == status)
                         .order_by(DriverAccount.id).offset(offset).limit(50))
    return [{"id": account.id, "full_name": account.full_name, "city_id": account.city_id,
             "status": account.status, "demo_only": True} for account in records]


def account_for_review(db: Session, driver_id: int):
    account = db.get(DriverAccount, driver_id)
    if not account:
        raise HTTPException(404, "Driver application not found.")
    return account


@router.get("/admin/drivers/{driver_id}", dependencies=[Depends(reviewer)], response_model=AdminApplication)
def inspect_application(driver_id: int, db: Database):
    result = application(db, account_for_review(db, driver_id))
    history = db.scalars(select(DriverReview).where(DriverReview.driver_id == driver_id).order_by(DriverReview.id))
    result["history"] = [{"from_status": review.previous_status, "to_status": review.new_status,
                          "actor": review.actor, "feedback": review.feedback,
                          "occurred_at": review.occurred_at.replace(tzinfo=timezone.utc)} for review in history]
    return result


@router.post("/admin/drivers/{driver_id}/review", dependencies=[Depends(reviewer)], response_model=ApplicationDetails)
def review_application(driver_id: int, data: ReviewInput, db: Database):
    account = account_for_review(db, driver_id)
    if data.status not in REVIEW_TRANSITIONS.get(account.status, set()):
        raise HTTPException(409, "That review action is unavailable for the current status.")
    if data.status == "APPROVED":
        operating_city(db, account.city_id)
    vehicle = db.get(DriverVehicle, account.id)
    if not vehicle:
        raise HTTPException(409, "There is no vehicle attached to this application.")
    return transition(db, account, vehicle, data.status, "DEMO_ADMIN", data.feedback)
