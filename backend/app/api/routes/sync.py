from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.telegram_auth import current_telegram_user_id
from app.db.models import TelegramSyncState
from app.db.session import get_session
from app.schemas import SyncStateRead, SyncStateWrite

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/state", response_model=SyncStateRead)
async def get_sync_state(
    telegram_user_id: str = Depends(current_telegram_user_id),
    session: AsyncSession = Depends(get_session),
) -> SyncStateRead:
    state = await session.get(TelegramSyncState, telegram_user_id)
    if state is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Облачных данных пока нет.")
    return SyncStateRead(payload=state.payload, revision=state.revision, updated_at=state.updated_at)


@router.put("/state", response_model=SyncStateRead)
async def put_sync_state(
    body: SyncStateWrite,
    response: Response,
    telegram_user_id: str = Depends(current_telegram_user_id),
    session: AsyncSession = Depends(get_session),
) -> SyncStateRead:
    state = await session.get(TelegramSyncState, telegram_user_id)
    if state is None:
        state = TelegramSyncState(telegram_user_id=telegram_user_id, payload=body.payload.model_dump(mode="json"), revision=1)
        session.add(state)
    else:
        if body.expected_revision is not None and body.expected_revision != state.revision:
            response.status_code = status.HTTP_409_CONFLICT
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Данные были изменены на другом устройстве. Обновите экран и повторите действие.")
        state.payload = body.payload.model_dump(mode="json")
        state.revision += 1
    await session.commit()
    await session.refresh(state)
    return SyncStateRead(payload=state.payload, revision=state.revision, updated_at=state.updated_at)
