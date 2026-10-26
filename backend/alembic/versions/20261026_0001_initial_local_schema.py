"""Create initial local medication tracker schema.

Revision ID: 20261026_0001
Revises:
Create Date: 2026-10-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261026_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    uuid, timestamp = sa.Uuid(), sa.DateTime(timezone=True)
    op.create_table("cabinets", sa.Column("id", uuid, primary_key=True), sa.Column("owner_id", uuid, nullable=False), sa.Column("name", sa.String(60), nullable=False), sa.Column("created_at", timestamp, server_default=sa.text("now()"), nullable=False), sa.Column("updated_at", timestamp, server_default=sa.text("now()"), nullable=False))
    op.create_index("ix_cabinets_owner_id", "cabinets", ["owner_id"])
    op.create_table("medications", sa.Column("id", uuid, primary_key=True), sa.Column("owner_id", uuid, nullable=False), sa.Column("cabinet_id", uuid, sa.ForeignKey("cabinets.id", ondelete="CASCADE"), nullable=False), sa.Column("name", sa.String(120), nullable=False), sa.Column("category", sa.String(80)), sa.Column("form", sa.String(60), nullable=False, server_default="Таблетка"), sa.Column("dosage_value", sa.String(32)), sa.Column("dosage_unit", sa.String(16)), sa.Column("barcode", sa.String(64)), sa.Column("note", sa.Text()), sa.Column("purchase_reminder_enabled", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("created_at", timestamp, server_default=sa.text("now()"), nullable=False), sa.Column("updated_at", timestamp, server_default=sa.text("now()"), nullable=False))
    op.create_index("ix_medications_owner_id", "medications", ["owner_id"])
    op.create_index("ix_medications_cabinet_id", "medications", ["cabinet_id"])
    op.create_index("ix_medications_barcode", "medications", ["barcode"])
    op.create_table("medication_packages", sa.Column("id", uuid, primary_key=True), sa.Column("medication_id", uuid, sa.ForeignKey("medications.id", ondelete="CASCADE"), nullable=False), sa.Column("quantity_initial", sa.Integer(), nullable=False), sa.Column("quantity_remaining", sa.Integer(), nullable=False), sa.Column("unit", sa.String(16), nullable=False, server_default="шт."), sa.Column("expires_on", sa.Date()), sa.Column("created_at", timestamp, server_default=sa.text("now()"), nullable=False), sa.Column("updated_at", timestamp, server_default=sa.text("now()"), nullable=False))
    op.create_index("ix_medication_packages_medication_id", "medication_packages", ["medication_id"])
    op.create_index("ix_medication_packages_expires_on", "medication_packages", ["expires_on"])
    op.create_table("medication_schedules", sa.Column("id", uuid, primary_key=True), sa.Column("medication_id", uuid, sa.ForeignKey("medications.id", ondelete="CASCADE"), nullable=False), sa.Column("frequency", sa.String(32), nullable=False, server_default="daily"), sa.Column("times", sa.JSON(), nullable=False), sa.Column("weekdays", sa.JSON()), sa.Column("interval_days", sa.Integer()), sa.Column("dose_quantity", sa.String(32), nullable=False, server_default="1"), sa.Column("dose_unit", sa.String(16), nullable=False, server_default="шт."), sa.Column("starts_on", sa.Date(), nullable=False), sa.Column("ends_on", sa.Date()), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("created_at", timestamp, server_default=sa.text("now()"), nullable=False), sa.Column("updated_at", timestamp, server_default=sa.text("now()"), nullable=False))
    op.create_index("ix_medication_schedules_medication_id", "medication_schedules", ["medication_id"])
    op.create_table("dose_events", sa.Column("id", uuid, primary_key=True), sa.Column("schedule_id", uuid, sa.ForeignKey("medication_schedules.id", ondelete="SET NULL")), sa.Column("medication_id", uuid, sa.ForeignKey("medications.id", ondelete="CASCADE"), nullable=False), sa.Column("scheduled_for", timestamp, nullable=False), sa.Column("status", sa.String(16), nullable=False, server_default="planned"), sa.Column("completed_at", timestamp), sa.Column("note", sa.Text()), sa.Column("created_at", timestamp, server_default=sa.text("now()"), nullable=False), sa.Column("updated_at", timestamp, server_default=sa.text("now()"), nullable=False))
    op.create_index("ix_dose_events_schedule_id", "dose_events", ["schedule_id"])
    op.create_index("ix_dose_events_medication_id", "dose_events", ["medication_id"])
    op.create_index("ix_dose_events_scheduled_for", "dose_events", ["scheduled_for"])


def downgrade() -> None:
    op.drop_table("dose_events")
    op.drop_table("medication_schedules")
    op.drop_table("medication_packages")
    op.drop_table("medications")
    op.drop_table("cabinets")
