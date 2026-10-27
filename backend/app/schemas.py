from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CabinetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class CabinetRead(ApiModel):
    id: UUID
    name: str
    created_at: datetime
    updated_at: datetime


class MedicationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str | None = Field(default=None, max_length=80)
    form: str = Field(default="Таблетка", max_length=60)
    dosage_value: str | None = Field(default=None, max_length=32)
    dosage_unit: str | None = Field(default=None, max_length=16)
    barcode: str | None = Field(default=None, max_length=64)
    note: str | None = None
    purchase_reminder_enabled: bool = False


class MedicationUpdate(BaseModel):
    cabinet_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = Field(default=None, max_length=80)
    form: str | None = Field(default=None, max_length=60)
    dosage_value: str | None = Field(default=None, max_length=32)
    dosage_unit: str | None = Field(default=None, max_length=16)
    barcode: str | None = Field(default=None, max_length=64)
    note: str | None = None
    purchase_reminder_enabled: bool | None = None


class MedicationRead(ApiModel):
    id: UUID
    cabinet_id: UUID
    name: str
    category: str | None
    form: str
    dosage_value: str | None
    dosage_unit: str | None
    barcode: str | None
    note: str | None
    purchase_reminder_enabled: bool
    created_at: datetime
    updated_at: datetime


class PackageCreate(BaseModel):
    quantity_initial: int = Field(ge=0)
    quantity_remaining: int = Field(ge=0)
    unit: str = Field(default="шт.", max_length=16)
    expires_on: date | None = None


class PackageRead(ApiModel):
    id: UUID
    medication_id: UUID
    quantity_initial: int
    quantity_remaining: int
    unit: str
    expires_on: date | None
    created_at: datetime
    updated_at: datetime


class SyncCabinet(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=60)


class SyncMedication(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    cabinet_id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    category: str | None = Field(default=None, max_length=80)
    form: str = Field(min_length=1, max_length=60)
    amount: str = Field(default="", max_length=32)
    unit: str = Field(default="", max_length=16)
    barcode: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=4_000)
    purchase_reminder: bool | None = None
    color: str = Field(default="#20A278", max_length=32)


class SyncPackage(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    medication_id: str = Field(min_length=1, max_length=128)
    quantity_remaining: float = Field(ge=0)
    unit: str = Field(min_length=1, max_length=16)
    expires_on: str | None = Field(default=None, max_length=10)


class SyncDose(BaseModel):
    id: str = Field(min_length=1, max_length=160)
    medication_id: str = Field(min_length=1, max_length=128)
    scheduled_time: str = Field(min_length=1, max_length=16)
    scheduled_date: str | None = Field(default=None, max_length=10)
    quantity: float = Field(ge=0)
    unit: str = Field(min_length=1, max_length=16)
    status: str = Field(pattern="^(pending|taken|skipped)$")


class SyncSchedule(BaseModel):
    id: str = Field(min_length=1, max_length=160)
    medication_id: str = Field(min_length=1, max_length=128)
    scheduled_time: str = Field(min_length=0, max_length=16)
    dose_quantity: float = Field(ge=0)
    dose_unit: str = Field(min_length=1, max_length=16)
    frequency: str | None = Field(default=None, max_length=32)
    start_date: str | None = Field(default=None, max_length=10)
    end_date: str | None = Field(default=None, max_length=10)
    weekdays: list[int] | None = Field(default=None, max_length=7)
    interval_days: int | None = Field(default=None, ge=1, le=366)


class SyncStatePayload(BaseModel):
    cabinets: list[SyncCabinet] = Field(default_factory=list, max_length=100)
    medications: list[SyncMedication] = Field(default_factory=list, max_length=1_000)
    packages: list[SyncPackage] = Field(default_factory=list, max_length=2_000)
    doses: list[SyncDose] = Field(default_factory=list, max_length=10_000)
    schedules: list[SyncSchedule] = Field(default_factory=list, max_length=2_000)


class SyncStateWrite(BaseModel):
    payload: SyncStatePayload
    expected_revision: int | None = Field(default=None, ge=1)


class SyncStateRead(BaseModel):
    payload: SyncStatePayload
    revision: int
    updated_at: datetime
