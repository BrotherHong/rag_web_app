"""用戶身分組管理 API 路由"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.core.security import get_current_user, get_current_active_admin
from app.models.user import User
from app.models.user_group import UserGroup, FileUserGroupPermission, query_user_groups
from app.models.query_user import QueryUser
from app.schemas.user_group import (
    UserGroupListResponse,
    UserGroupSchema,
    UserGroupCreate,
    UserGroupUpdate,
    UserGroupDetailSchema,
    SetFileUserGroupPermissionsRequest,
    BatchSetFileUserGroupPermissionsRequest,
    FileUserGroupPermissionSchema
)
from app.services.activity import activity_service

router = APIRouter(prefix="/user-groups", tags=["user-groups"])


@router.get("/", response_model=UserGroupListResponse)
async def get_user_groups(
    include_counts: bool = True,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """取得身分組列表
    
    - 自動過濾處室：只能看到自己處室的身分組
    - 按優先級（priority）排序，數字越小越前面
    - 可選包含成員數量和檔案數量統計
    """
    # 查詢身分組（只查詢當前處室）
    query = select(UserGroup).where(
        UserGroup.department_id == current_user.department_id
    ).order_by(UserGroup.priority, UserGroup.name)
    
    result = await db.execute(query)
    user_groups = result.scalars().all()
    
    # 如果需要包含統計數據
    if include_counts:
        group_list = []
        for group in user_groups:
            # 查詢該身分組的成員數量
            member_count = await db.scalar(
                select(func.count()).select_from(query_user_groups)
                .where(query_user_groups.c.user_group_id == group.id)
            )
            
            # 查詢該身分組可訪問的檔案數量
            file_count = await db.scalar(
                select(func.count(FileUserGroupPermission.id))
                .where(FileUserGroupPermission.user_group_id == group.id)
            )
            
            # 建立 schema 並設定統計數據
            group_schema = UserGroupSchema.model_validate(group)
            group_schema.member_count = member_count or 0
            group_schema.file_count = file_count or 0
            group_list.append(group_schema)
        
        return UserGroupListResponse(items=group_list)
    else:
        return UserGroupListResponse(
            items=[UserGroupSchema.model_validate(g) for g in user_groups]
        )


@router.get("/{group_id}", response_model=UserGroupDetailSchema)
async def get_user_group(
    group_id: int,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """取得身分組詳細資訊（包含成員列表）"""
    # 查詢身分組
    query = select(UserGroup).where(
        UserGroup.id == group_id,
        UserGroup.department_id == current_user.department_id
    ).options(joinedload(UserGroup.query_users))
    
    result = await db.execute(query)
    user_group = result.scalar_one_or_none()
    
    if not user_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="身分組不存在或無權訪問"
        )
    
    # 準備成員列表
    members = [
        {
            "id": member.id,
            "username": member.username,
            "email": member.email,
            "fullName": member.full_name,
            "status": member.status
        }
        for member in user_group.query_users
    ]
    
    # 查詢統計數據
    file_count = await db.scalar(
        select(func.count(FileUserGroupPermission.id))
        .where(FileUserGroupPermission.user_group_id == group_id)
    )
    
    group_schema = UserGroupDetailSchema.model_validate(user_group)
    group_schema.member_count = len(members)
    group_schema.file_count = file_count or 0
    group_schema.members = members
    
    return group_schema


@router.post("/", response_model=UserGroupSchema, status_code=status.HTTP_201_CREATED)
async def create_user_group(
    group_data: UserGroupCreate,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """建立新的身分組"""
    # 檢查同處室是否已有相同名稱的身分組
    existing = await db.scalar(
        select(UserGroup).where(
            UserGroup.department_id == current_user.department_id,
            UserGroup.name == group_data.name
        )
    )
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="該處室已存在相同名稱的身分組"
        )
    
    # 建立新身分組
    new_group = UserGroup(
        department_id=current_user.department_id,
        **group_data.model_dump()
    )
    
    db.add(new_group)
    await db.commit()
    await db.refresh(new_group)
    
    # 記錄活動
    await activity_service.log_user_group_activity(
        db=db,
        user_id=current_user.id,
        department_id=current_user.department_id,
        action="create",
        user_group_id=new_group.id,
        details=f"建立身分組：{new_group.name}"
    )
    
    group_schema = UserGroupSchema.model_validate(new_group)
    group_schema.member_count = 0
    group_schema.file_count = 0
    
    return group_schema


@router.put("/{group_id}", response_model=UserGroupSchema)
async def update_user_group(
    group_id: int,
    group_data: UserGroupUpdate,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """更新身分組資訊"""
    # 查詢身分組
    user_group = await db.scalar(
        select(UserGroup).where(
            UserGroup.id == group_id,
            UserGroup.department_id == current_user.department_id
        )
    )
    
    if not user_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="身分組不存在或無權訪問"
        )
    
    # 如果要修改名稱，檢查是否重複
    if group_data.name and group_data.name != user_group.name:
        existing = await db.scalar(
            select(UserGroup).where(
                UserGroup.department_id == current_user.department_id,
                UserGroup.name == group_data.name,
                UserGroup.id != group_id
            )
        )
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="該處室已存在相同名稱的身分組"
            )
    
    # 更新欄位
    update_data = group_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user_group, field, value)
    
    await db.commit()
    await db.refresh(user_group)
    
    # 記錄活動
    await activity_service.log_user_group_activity(
        db=db,
        user_id=current_user.id,
        department_id=current_user.department_id,
        action="update",
        user_group_id=user_group.id,
        details=f"更新身分組：{user_group.name}"
    )
    
    # 查詢統計數據
    member_count = await db.scalar(
        select(func.count()).select_from(query_user_groups)
        .where(query_user_groups.c.user_group_id == group_id)
    )
    
    file_count = await db.scalar(
        select(func.count(FileUserGroupPermission.id))
        .where(FileUserGroupPermission.user_group_id == group_id)
    )
    
    group_schema = UserGroupSchema.model_validate(user_group)
    group_schema.member_count = member_count or 0
    group_schema.file_count = file_count or 0
    
    return group_schema


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_group(
    group_id: int,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """刪除身分組"""
    # 查詢身分組
    user_group = await db.scalar(
        select(UserGroup).where(
            UserGroup.id == group_id,
            UserGroup.department_id == current_user.department_id
        )
    )
    
    if not user_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="身分組不存在或無權訪問"
        )
    
    group_name = user_group.name
    
    # 刪除身分組
    await db.delete(user_group)
    await db.commit()
    
    # 記錄活動
    await activity_service.log_user_group_activity(
        db=db,
        user_id=current_user.id,
        department_id=current_user.department_id,
        action="delete",
        details=f"刪除身分組：{group_name}"
    )
    
    return None


@router.post("/{group_id}/members/{user_id}", status_code=status.HTTP_200_OK)
async def add_member_to_group(
    group_id: int,
    user_id: int,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """將查詢用戶加入身分組"""
    # 查詢身分組
    user_group = await db.scalar(
        select(UserGroup).where(
            UserGroup.id == group_id,
            UserGroup.department_id == current_user.department_id
        )
    )
    
    if not user_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="身分組不存在或無權訪問"
        )
    
    # 查詢查詢用戶
    query_user = await db.scalar(
        select(QueryUser).where(QueryUser.id == user_id)
    )
    
    if not query_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="查詢用戶不存在"
        )
    
    # 檢查是否已在該組
    existing = await db.scalar(
        select(func.count()).select_from(query_user_groups)
        .where(
            query_user_groups.c.query_user_id == user_id,
            query_user_groups.c.user_group_id == group_id
        )
    )
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="該用戶已在此身分組中"
        )
    
    # 加入身分組
    stmt = query_user_groups.insert().values(
        query_user_id=user_id,
        user_group_id=group_id
    )
    await db.execute(stmt)
    await db.commit()
    
    # 記錄活動
    await activity_service.log_user_group_activity(
        db=db,
        user_id=current_user.id,
        department_id=current_user.department_id,
        action="add_member",
        user_group_id=group_id,
        details=f"將用戶 {query_user.username} 加入身分組 {user_group.name}"
    )
    
    return {"message": "成功加入身分組"}


@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member_from_group(
    group_id: int,
    user_id: int,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """將查詢用戶從身分組移除"""
    # 查詢身分組
    user_group = await db.scalar(
        select(UserGroup).where(
            UserGroup.id == group_id,
            UserGroup.department_id == current_user.department_id
        )
    )
    
    if not user_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="身分組不存在或無權訪問"
        )
    
    # 查詢查詢用戶
    query_user = await db.scalar(
        select(QueryUser).where(QueryUser.id == user_id)
    )
    
    if not query_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="查詢用戶不存在"
        )
    
    # 移除身分組關聯
    stmt = delete(query_user_groups).where(
        query_user_groups.c.query_user_id == user_id,
        query_user_groups.c.user_group_id == group_id
    )
    result = await db.execute(stmt)
    await db.commit()
    
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="該用戶不在此身分組中"
        )
    
    # 記錄活動
    await activity_service.log_user_group_activity(
        db=db,
        user_id=current_user.id,
        department_id=current_user.department_id,
        action="remove_member",
        user_group_id=group_id,
        details=f"將用戶 {query_user.username} 從身分組 {user_group.name} 移除"
    )
    
    return None


@router.post("/files/permissions", status_code=status.HTTP_200_OK)
async def set_file_user_group_permissions(
    request: SetFileUserGroupPermissionsRequest,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """設定單個檔案的身分組權限
    
    - 會先清除該檔案的所有身分組權限，再設定新的權限
    - 只能設定自己處室的身分組
    """
    from app.models.file import File
    
    # 查詢檔案，確認權限
    file = await db.scalar(
        select(File).where(
            File.id == request.file_id,
            File.department_id == current_user.department_id
        )
    )
    
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="檔案不存在或無權訪問"
        )
    
    # 驗證所有身分組都屬於當前處室
    if request.user_group_ids:
        valid_groups = await db.scalars(
            select(UserGroup.id).where(
                UserGroup.id.in_(request.user_group_ids),
                UserGroup.department_id == current_user.department_id
            )
        )
        valid_group_ids = set(valid_groups.all())
        
        invalid_groups = set(request.user_group_ids) - valid_group_ids
        if invalid_groups:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"身分組 ID {invalid_groups} 不存在或無權訪問"
            )
    
    # 清除該檔案的所有身分組權限
    await db.execute(
        delete(FileUserGroupPermission).where(
            FileUserGroupPermission.file_id == request.file_id
        )
    )
    
    # 添加新的權限
    if request.user_group_ids:
        for group_id in request.user_group_ids:
            permission = FileUserGroupPermission(
                file_id=request.file_id,
                user_group_id=group_id
            )
            db.add(permission)
    
    await db.commit()
    
    return {
        "message": "檔案身分組權限設定成功",
        "fileId": request.file_id,
        "userGroupIds": request.user_group_ids
    }


@router.post("/files/permissions/batch", status_code=status.HTTP_200_OK)
async def batch_set_file_user_group_permissions(
    request: BatchSetFileUserGroupPermissionsRequest,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """批次設定多個檔案的身分組權限
    
    - 會先清除這些檔案的所有身分組權限，再設定新的權限
    - 只能設定自己處室的檔案和身分組
    """
    from app.models.file import File
    
    # 查詢所有檔案，確認權限
    files = await db.scalars(
        select(File).where(
            File.id.in_(request.file_ids),
            File.department_id == current_user.department_id
        )
    )
    file_ids = set(f.id for f in files.all())
    
    invalid_files = set(request.file_ids) - file_ids
    if invalid_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"檔案 ID {invalid_files} 不存在或無權訪問"
        )
    
    # 驗證所有身分組都屬於當前處室
    if request.user_group_ids:
        valid_groups = await db.scalars(
            select(UserGroup.id).where(
                UserGroup.id.in_(request.user_group_ids),
                UserGroup.department_id == current_user.department_id
            )
        )
        valid_group_ids = set(valid_groups.all())
        
        invalid_groups = set(request.user_group_ids) - valid_group_ids
        if invalid_groups:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"身分組 ID {invalid_groups} 不存在或無權訪問"
            )
    
    # 清除所有檔案的身分組權限
    await db.execute(
        delete(FileUserGroupPermission).where(
            FileUserGroupPermission.file_id.in_(request.file_ids)
        )
    )
    
    # 為每個檔案添加新的權限
    if request.user_group_ids:
        for file_id in request.file_ids:
            for group_id in request.user_group_ids:
                permission = FileUserGroupPermission(
                    file_id=file_id,
                    user_group_id=group_id
                )
                db.add(permission)
    
    await db.commit()
    
    return {
        "message": "批次設定檔案身分組權限成功",
        "fileCount": len(request.file_ids),
        "userGroupCount": len(request.user_group_ids)
    }


@router.get("/files/{file_id}/permissions", response_model=List[FileUserGroupPermissionSchema])
async def get_file_user_group_permissions(
    file_id: int,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """取得檔案的身分組權限列表"""
    from app.models.file import File
    
    # 確認檔案權限
    file = await db.scalar(
        select(File).where(
            File.id == file_id,
            File.department_id == current_user.department_id
        )
    )
    
    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="檔案不存在或無權訪問"
        )
    
    # 查詢權限
    permissions = await db.execute(
        select(FileUserGroupPermission, UserGroup.name)
        .join(UserGroup, FileUserGroupPermission.user_group_id == UserGroup.id)
        .where(FileUserGroupPermission.file_id == file_id)
    )
    
    result = []
    for perm, group_name in permissions:
        perm_schema = FileUserGroupPermissionSchema.model_validate(perm)
        perm_schema.user_group_name = group_name
        result.append(perm_schema)
    
    return result

