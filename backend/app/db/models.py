from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TimestampedModel:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Cabinet(TimestampedModel, Base):
    __tablename__ = "cabinets"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(Uuid, index=True)
    name: Mapped[str] = mapped_column(String(60))
    medications: Mapped[list["Medication"]] = relationship(back_populates="cabinet")


class Medication(TimestampedModel, Base):
    __tablename__ = "medications"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(Uuid, index=True)
    cabinet_id: Mapped[UUID] = mapped_column(ForeignKey("cabinets.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    form: Mapped[str] = mapped_column(String(60), default="Таблетка")
    dosage_value: Mapped[str | None] = mapped_column(String(32), nullable=True)
    dosage_unit: Mapped[str | None] = mapped_column(String(16), nullable=True)
    barcode: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    purchase_reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    cabinet: Mapped[Cabinet] = relationship(back_populates="medications")
    packages: Mapped[list["MedicationPackage"]] = relationship(back_populates="medication")
    schedules: Mapped[list["MedicationSchedule"]] = relationship(back_populates="medication")


class MedicationPackage(TimestampedModel, Base):
    __tablename__ = "medication_packages"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    medication_id: Mapped[UUID] = mapped_column(ForeignKey("medications.id", ondelete="CASCADE"), index=True)
    quantity_initial: Mapped[int] = mapped_column(Integer)
    quantity_remaining: Mapped[int] = mapped_column(Integer)
    unit: Mapped[str] = mapped_column(String(16), default="шт.")
    expires_on: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    medication: Mapped[Medication] = relationship(back_populates="packages")


class MedicationSchedule(TimestampedModel, Base):
    __tablename__ = "medication_schedules"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    medication_id: Mapped[UUID] = mapped_column(ForeignKey("medications.id", ondelete="CASCADE"), index=True)
    frequency: Mapped[str] = mapped_column(String(32), default="daily")
    times: Mapped[list[str]] = mapped_column(JSON, default=list)
    weekdays: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dose_quantity: Mapped[str] = mapped_column(String(32), default="1")
    dose_unit: Mapped[str] = mapped_column(String(16), default="шт.")
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    medication: Mapped[Medication] = relationship(back_populates="schedules")


class DoseEvent(TimestampedModel, Base):
    __tablename__ = "dose_events"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    schedule_id: Mapped[UUID | None] = mapped_column(ForeignKey("medication_schedules.id", ondelete="SET NULL"), nullable=True, index=True)
    medication_id: Mapped[UUID] = mapped_column(ForeignKey("medications.id", ondelete="CASCADE"), index=True)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    status: Mapped[str] = mapped_column(String(16), default="planned")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
