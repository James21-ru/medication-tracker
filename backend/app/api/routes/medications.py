from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import Cabinet, Medication, MedicationPackage
from app.db.session import get_session
from app.schemas import MedicationRead, MedicationUpdate, PackageCreate, PackageRead

router = APIRouter(prefix="/medications", tags=["medications"])


async def owned_medication(medication_id: UUID, session: AsyncSession) -> Medication:
    medication = await session.scalar(select(Medication).where(Medication.id == medication_id, Medication.owner_id == get_settings().local_test_user_id))
    if medication is None:
        raise HTTPException(status_code=404, detail="Препарат не найден")
    return medication


@router.get("/{medication_id}", response_model=MedicationRead)
async def get_medication(medication_id: UUID, session: AsyncSession = Depends(get_session)) -> Medication:
    return await owned_medication(medication_id, session)


@router.patch("/{medication_id}", response_model=MedicationRead)
async def update_medication(medication_id: UUID, payload: MedicationUpdate, session: AsyncSession = Depends(get_session)) -> Medication:
    medication = await owned_medication(medication_id, session)
    data = payload.model_dump(exclude_unset=True)
    if cabinet_id := data.get("cabinet_id"):
        cabinet = await session.scalar(select(Cabinet).where(Cabinet.id == cabinet_id, Cabinet.owner_id == get_settings().local_test_user_id))
        if cabinet is None:
            raise HTTPException(status_code=404, detail="Аптечка не найдена")
    for field, value in data.items():
        setattr(medication, field, value.strip() if isinstance(value, str) else value)
    await session.commit()
    await session.refresh(medication)
    return medication


@router.delete("/{medication_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_medication(medication_id: UUID, session: AsyncSession = Depends(get_session)) -> None:
    medication = await owned_medication(medication_id, session)
    await session.delete(medication)
    await session.commit()


@router.post("/{medication_id}/packages", response_model=PackageRead, status_code=status.HTTP_201_CREATED)
async def create_package(medication_id: UUID, payload: PackageCreate, session: AsyncSession = Depends(get_session)) -> MedicationPackage:
    await owned_medication(medication_id, session)
    package = MedicationPackage(medication_id=medication_id, **payload.model_dump())
    session.add(package)
    await session.commit()
    await session.refresh(package)
    return package
