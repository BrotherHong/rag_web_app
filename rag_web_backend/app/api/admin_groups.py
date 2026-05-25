"""管理組織 API 路由（SuperAdmin 專用）"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User, Department
from app.models.user import UserRole
from app.models.admin_group import AdminGroup
from app.models.file import File
from app.schemas.admin_group import (
    AdminGroupCreate,
    AdminGroupUpdate,
    AdminGroupSchema,
    AdminGroupListResponse,
)

router = APIRouter(prefix="/admin-groups", tags=["管理組織"])


def _require_super_admin(current_user: User) -> None:
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="僅限 SuperAdmin")


def _require_same_dept_or_super_admin(current_user: User, department_id: int) -> None:
    """SuperAdmin 可操作任何處室，Admin 只能操作自己的處室"""
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if current_user.department_id != department_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="無權限存取其他處室的管理組織")


async def _build_schema(group: AdminGroup, db: AsyncSession) -> AdminGroupSchema:
    """補充 user_count 和 file_count 統計"""
    user_count_result = await db.execute(
        select(func.count()).where(User.admin_group_id == group.id)
    )
    file_count_result = await db.execute(
        select(func.count()).where(File.admin_group_id == group.id)
    )
    schema = AdminGroupSchema.model_validate(group)
    schema.user_count = user_count_result.scalar_one()
    schema.file_count = file_count_result.scalar_one()
    return schema


@router.get("/", response_model=AdminGroupListResponse)
async def list_admin_groups(
    department_id: int = Query(..., description="處室 ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """列出處室的管理組織列表"""
    _require_same_dept_or_super_admin(current_user, department_id)

    result = await db.execute(
        select(AdminGroup)
        .where(AdminGroup.department_id == department_id)
        .order_by(AdminGroup.created_at)
    )
    groups = result.scalars().all()

    items = [await _build_schema(g, db) for g in groups]
    return AdminGroupListResponse(items=items, total=len(items))


@router.post("/", response_model=AdminGroupSchema, status_code=status.HTTP_201_CREATED)
async def create_admin_group(
    data: AdminGroupCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """建立管理組織（SuperAdmin 專用）"""
    _require_super_admin(current_user)

    # 確認處室存在
    dept = await db.get(Department, data.department_id)
    if not dept:
        raise HTTPException(status_code=404, detail="處室不存在")

    group = AdminGroup(
        name=data.name,
        description=data.description,
        color=data.color,
        department_id=data.department_id,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return await _build_schema(group, db)


@router.put("/{group_id}", response_model=AdminGroupSchema)
async def update_admin_group(
    group_id: int,
    data: AdminGroupUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """更新管理組織（SuperAdmin 專用）"""
    _require_super_admin(current_user)

    group = await db.get(AdminGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="管理組織不存在")

    if data.name is not None:
        group.name = data.name
    if data.description is not None:
        group.description = data.description
    if data.color is not None:
        group.color = data.color

    await db.commit()
    await db.refresh(group)
    return await _build_schema(group, db)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """刪除管理組織（SuperAdmin 專用）

    若仍有檔案屬於此組織，禁止刪除。
    """
    _require_super_admin(current_user)

    group = await db.get(AdminGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="管理組織不存在")

    file_count_result = await db.execute(
        select(func.count()).where(File.admin_group_id == group_id)
    )
    if file_count_result.scalar_one() > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="此管理組織仍有檔案，請先轉移或刪除這些檔案後再刪除組織"
        )

    await db.delete(group)
    await db.commit()
