"""分類管理 API 路由"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import get_db
from app.core.security import get_current_user, get_current_active_admin
from app.models.user import User
from app.models.category import Category
from app.models.file import File
from app.schemas.category import (
    CategoryListResponse,
    CategorySchema,
    CategoryCreate,
    CategoryUpdate,
    CategoryStatsResponse,
    CategoryStatItem
)
from app.services.activity import activity_service

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("/query", response_model=CategoryListResponse)
async def get_categories_for_query(
    department_id: int = Query(..., description="處室 ID"),
    db: AsyncSession = Depends(get_db)
):
    """取得指定處室的分類列表（供查詢頁面使用）
    
    - 不需要登入即可使用
    - 回傳指定處室的所有分類
    - 不包含檔案數量統計
    """
    # 查詢分類
    query = select(Category).where(
        Category.department_id == department_id
    ).order_by(Category.name)
    
    result = await db.execute(query)
    categories = result.scalars().all()
    
    return CategoryListResponse(
        items=[CategorySchema.model_validate(c) for c in categories]
    )


@router.get("/", response_model=CategoryListResponse)
async def get_categories(
    include_count: bool = Query(True, description="是否包含檔案數量"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """取得分類列表
    
    - 自動過濾處室：只能看到自己處室的分類
    - 按名稱排序
    - 可選包含檔案數量統計
    """
    # 查詢分類（只查詢當前處室）
    query = select(Category).where(
        Category.department_id == current_user.department_id
    ).order_by(Category.name)
    
    result = await db.execute(query)
    categories = result.scalars().all()
    
    # 如果需要包含檔案數量
    if include_count:
        category_list = []
        for category in categories:
            # 查詢該分類的檔案數量
            file_count = await db.scalar(
                select(func.count(File.id))
                .where(File.category_id == category.id)
            )
            
            # 建立 schema 並設定 file_count
            cat_schema = CategorySchema.model_validate(category)
            cat_schema.file_count = file_count
            category_list.append(cat_schema)
        
        return CategoryListResponse(items=category_list)
    else:
        return CategoryListResponse(
            items=[CategorySchema.model_validate(c) for c in categories]
        )


@router.get("/stats", response_model=CategoryStatsResponse)
async def get_category_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """取得分類統計資料
    
    - 各分類的檔案數量
    - 各分類的總大小
    - 佔比百分比
    """
    # 查詢各分類的統計
    query = await db.execute(
        select(
            Category.id,
            Category.name,
            Category.color,
            func.count(File.id).label('file_count'),
            func.coalesce(func.sum(File.file_size), 0).label('total_size')
        )
        .outerjoin(File, File.category_id == Category.id)
        .where(Category.department_id == current_user.department_id)
        .group_by(Category.id, Category.name, Category.color)
        .order_by(desc('file_count'))
    )
    
    results = query.all()
    
    # 計算總大小（用於計算百分比）
    total_size = sum(row.total_size for row in results)
    
    # 組織結果
    stats = []
    for row in results:
        percentage = (row.total_size / total_size * 100) if total_size > 0 else 0
        stats.append(CategoryStatItem(
            id=row.id,
            name=row.name,
            color=row.color,
            file_count=row.file_count,
            total_size=row.total_size,
            percentage=round(percentage, 1)
        ))
    
    return CategoryStatsResponse(stats=stats)


@router.post("/", response_model=CategorySchema, status_code=status.HTTP_201_CREATED)
async def create_category(
    category_data: CategoryCreate,
    current_user: User = Depends(get_current_active_admin),  # 需要管理員權限
    db: AsyncSession = Depends(get_db)
):
    """新增分類
    
    - 需要管理員權限
    - 檢查分類名稱是否重複（同處室內）
    - 自動關聯到當前使用者的處室
    """
    # 檢查分類名稱是否重複（同處室內）
    existing = await db.execute(
        select(Category).where(
            Category.name == category_data.name,
            Category.department_id == current_user.department_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="分類名稱已存在")
    
    # 建立分類
    category = Category(
        name=category_data.name,
        color=category_data.color,
        department_id=current_user.department_id
    )
    
    db.add(category)
    await db.commit()
    await db.refresh(category)
    
    # 記錄活動 (包含處室 ID)
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="CREATE_CATEGORY",
        description=f"建立分類: {category.name}",
        department_id=current_user.department_id
    )
    await db.commit()  # 提交活動記錄
    
    cat_schema = CategorySchema.model_validate(category)
    cat_schema.file_count = 0
    
    return cat_schema


@router.delete("/{category_id}")
async def delete_category(
    category_id: int,
    current_user: User = Depends(get_current_active_admin),  # 需要管理員權限
    db: AsyncSession = Depends(get_db)
):
    """刪除分類
    
    - 需要管理員權限
    - 檢查是否有檔案使用此分類
    - 如果有檔案，無法刪除
    """
    # 取得分類
    category = await db.get(Category, category_id)
    
    if not category:
        raise HTTPException(status_code=404, detail="分類不存在")
    
    # 權限檢查
    if category.department_id != current_user.department_id:
        raise HTTPException(status_code=403, detail="無權限刪除此分類")
    
    # 檢查是否有檔案使用此分類
    file_count = await db.scalar(
        select(func.count(File.id)).where(File.category_id == category_id)
    )
    
    if file_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"此分類下還有 {file_count} 個檔案，無法刪除"
        )
    
    # 記錄分類名稱（刪除前）
    category_name = category.name
    
    # 先記錄活動（在刪除前,包含處室 ID）
    await activity_service.log_activity(
        db=db,
        user_id=current_user.id,
        activity_type="DELETE_CATEGORY",
        description=f"刪除分類: {category_name}",
        department_id=current_user.department_id
    )
    await db.commit()  # 提交活動記錄
    
    # 刪除分類
    await db.delete(category)
    await db.commit()
    
    return {"message": "分類已刪除"}

