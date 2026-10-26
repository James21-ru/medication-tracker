from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import Cabinet, Medication
from app.db.session import get_session
from app.schemas import CabinetCreate, CabinetRead, MedicationCreate, MedicationRead

router = APIRouter(prefix="/cabinets", tags=["cabinets"])


async def owned_cabinet(cabinet_id: UUID, session: AsyncSession) -> Cabinet:
    cabinet = await session.scalar(select(Cabinet).where(Cabinet.id == cabinet_id, Cabinet.owner_id == get_settings().local_test_user_id))
    if cabinet is None:
        raise HTTPException(status_code=404, detail="Аптечка не найдена")
    return cabinet


@router.get("", response_model=list[CabinetRead])
async def list_cabinets(session: AsyncSession = Depends(get_session)) -> list[Cabinet]:
    statement = select(Cabinet).where(Cabinet.owner_id == get_settings().local_test_user_id).order_by(Cabinet.created_at)
    return list((await session.scalars(statement)).all())


@router.post("", response_model=CabinetRead, status_code=status.HTTP_201_CREATED)
async def create_cabinet(payload: CabinetCreate, session: AsyncSession = Depends(get_session)) -> Cabinet:
    cabinet = Cabinet(owner_id=get_settings().local_test_user_id, name=payload.name.strip())
    session.add(cabinet)
    await session.commit()
    await session.refresh(cabinet)
    return cabinet


@router.patch("/{cabinet_id}", response_model=CabinetRead)
async def rename_cabinet(cabinet_id: UUID, payload: CabinetCreate, session: AsyncSession = Depends(get_session)) -> Cabinet:
    cabinet = await owned_cabinet(cabinet_id, session)
    cabinet.name = payload.name.strip()
    await session.commit()
    await session.refresh(cabinet)
    return cabinet


@router.get("/{cabinet_id}/medications", response_model=list[MedicationRead])
async def list_medications(cabinet_id: UUID, session: AsyncSession = Depends(get_session)) -> list[Medication]:
    await owned_cabinet(cabinet_id, session)
    return list((await session.scalars(select(Medication).where(Medication.cabinet_id == cabinet_id).order_by(Medication.created_at.desc()))).all())


@router.post("/{cabinet_id}/medications", response_model=MedicationRead, status_code=status.HTTP_201_CREATED)
async def create_medication(cabinet_id: UUID, payload: MedicationCreate, session: AsyncSession = Depends(get_session)) -> Medication:
    await owned_cabinet(cabinet_id, session)
    medication = Medication(owner_id=get_settings().local_test_user_id, cabinet_id=cabinet_id, **payload.model_dump())
    session.add(medication)
    await session.commit()
    await session.refresh(medication)
    return medication
