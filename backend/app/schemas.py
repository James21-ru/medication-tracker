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
