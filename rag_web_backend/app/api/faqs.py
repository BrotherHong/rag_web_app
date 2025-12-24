"""FAQ 管理 API 路由"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.faq import FAQ
from app.schemas.faq import FaqCreate, FaqUpdate, FaqToggle, FaqReorder


router = APIRouter(prefix="/faqs", tags=["FAQ 管理"])


# ===== API 端點 =====

@router.get("/")
async def get_faqs(
    category: str | None = Query(None, description="按分類過濾"),
    is_active: bool | None = Query(None, description="按啟用狀態過濾"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN))
):
    """
    獲取 FAQ 列表（需要管理員權限）
    
    - 普通管理員：只能看到自己處室的 FAQ
    - 系統管理員（代理模式）：只能看到代理處室的 FAQ
    - 系統管理員（非代理模式）：可以看到所有處室的 FAQ
    """
    # 構建查詢
    query = select(FAQ)
    
    # 如果有 department_id（普通管理員或代理中的系統管理員），只顯示該處室的 FAQ
    if current_user.department_id is not None:
        query = query.where(FAQ.department_id == current_user.department_id)
    
    # 分類過濾
    if category:
        query = query.where(FAQ.category == category)
    
    # 啟用狀態過濾
    if is_active is not None:
        query = query.where(FAQ.is_active == is_active)
    
    # 排序
    query = query.order_by(FAQ.order.asc(), FAQ.id.asc())
    
    # 執行查詢
    result = await db.execute(query)
    faqs = result.scalars().all()
    
    return {
        "success": True,
        "items": [faq.to_dict() for faq in faqs],
        "total": len(faqs)
    }


@router.post("/")
async def create_faq(
    faq_data: FaqCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN))
):
    """
    創建 FAQ（需要管理員權限）
    
    - 普通管理員：創建的 FAQ 歸屬於自己的處室
    - 系統管理員：需要有 department_id 才能創建（不支援全站通用 FAQ）
    """
    # 準備資料
    faq_dict = faq_data.model_dump()
    
    # 設定處室 ID - 必須有處室歸屬
    if current_user.department_id is None:
        raise HTTPException(
            status_code=400,
            detail="系統管理員需要切換到特定處室才能管理 FAQ"
        )
    
    # 所有管理員創建的 FAQ 都歸屬於當前處室
    faq_dict['department_id'] = current_user.department_id
    
    # 創建 FAQ
    faq = FAQ(**faq_dict)
    db.add(faq)
    await db.commit()
    await db.refresh(faq)
    
    return {
        "success": True,
        "message": "FAQ 創建成功",
        "data": faq.to_dict()
    }


@router.get("/{faq_id}")
async def get_faq(
    faq_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN))
):
    """獲取單個 FAQ 詳情"""
    faq = await db.get(FAQ, faq_id)
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ 不存在")
    
    # 權限檢查：只能訪問自己處室的 FAQ
    if current_user.role != UserRole.SUPER_ADMIN:
        if faq.department_id != current_user.department_id:
            raise HTTPException(status_code=403, detail="無權訪問此 FAQ")
    
    return {
        "success": True,
        "data": faq.to_dict()
    }


@router.put("/{faq_id}")
async def update_faq(
    faq_id: int,
    faq_data: FaqUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN))
):
    """更新 FAQ"""
    faq = await db.get(FAQ, faq_id)
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ 不存在")
    
    # 權限檢查：只能修改自己處室的 FAQ
    if current_user.role != UserRole.SUPER_ADMIN:
        if faq.department_id != current_user.department_id:
            raise HTTPException(status_code=403, detail="無權修改此 FAQ")
    
    # 更新欄位
    update_data = faq_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(faq, field, value)
    
    await db.commit()
    await db.refresh(faq)
    
    return {
        "success": True,
        "message": "FAQ 更新成功",
        "data": faq.to_dict()
    }


@router.delete("/{faq_id}")
async def delete_faq(
    faq_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN))
):
    """刪除 FAQ"""
    faq = await db.get(FAQ, faq_id)
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ 不存在")
    
    # 權限檢查：只能刪除自己處室的 FAQ
    if current_user.role != UserRole.SUPER_ADMIN:
        if faq.department_id != current_user.department_id:
            raise HTTPException(status_code=403, detail="無權刪除此 FAQ")
    
    await db.delete(faq)
    await db.commit()
    
    return {
        "success": True,
        "message": "FAQ 刪除成功"
    }


@router.patch("/{faq_id}/toggle")
async def toggle_faq_status(
    faq_id: int,
    toggle_data: FaqToggle,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN))
):
    """切換 FAQ 啟用狀態"""
    faq = await db.get(FAQ, faq_id)
    if not faq:
        raise HTTPException(status_code=404, detail="FAQ 不存在")
    
    # 權限檢查：只能修改自己處室的 FAQ
    if current_user.role != UserRole.SUPER_ADMIN:
        if faq.department_id != current_user.department_id:
            raise HTTPException(status_code=403, detail="無權修改此 FAQ")
    
    faq.is_active = toggle_data.is_active
    await db.commit()
    await db.refresh(faq)
    
    return {
        "success": True,
        "message": f"FAQ 已{'啟用' if toggle_data.is_active else '停用'}",
        "data": faq.to_dict()
    }


@router.post("/reorder")
async def reorder_faqs(
    reorder_data: FaqReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.SUPER_ADMIN))
):
    """重新排序 FAQ"""
    # 更新每個 FAQ 的 order 欄位
    for index, faq_id in enumerate(reorder_data.faq_ids):
        faq = await db.get(FAQ, faq_id)
        if faq:
            # 權限檢查：只能排序自己處室的 FAQ
            if current_user.role != UserRole.SUPER_ADMIN:
                if faq.department_id != current_user.department_id:
                    continue
            
            faq.order = index
    
    await db.commit()
    
    return {
        "success": True,
        "message": "FAQ 排序更新成功"
    }
