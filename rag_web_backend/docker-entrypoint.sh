#!/bin/bash
# Docker 容器啟動腳本
# 負責執行資料庫遷移、初始化，然後啟動應用服務

set -e  # 遇到錯誤立即退出

echo "=================================="
echo "🐳 RAG Backend 容器啟動中..."
echo "=================================="
echo ""

# 等待 PostgreSQL 就緒
echo "⏳ 等待 PostgreSQL 資料庫就緒..."
until PGPASSWORD=$POSTGRES_PASSWORD psql -h "postgres" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\q' 2>/dev/null; do
  echo "   PostgreSQL 尚未就緒，等待中..."
  sleep 2
done
echo "✅ PostgreSQL 已就緒"
echo ""

# 執行資料庫遷移
echo "🔄 執行資料庫遷移..."
alembic upgrade head
echo "✅ 資料庫遷移完成"
echo ""

# 檢查是否需要執行初始化腳本
if [ "${INIT_DB:-true}" = "true" ]; then
    echo "🔄 執行資料庫初始化檢查..."
    python scripts/init_db.py
    echo ""
    
    if [ "${INIT_SYSTEM_SETTINGS:-true}" = "true" ]; then
        echo "🔄 執行系統設定初始化..."
        python scripts/init_system_settings.py
        echo ""
    fi
else
    echo "⏭️  跳過資料庫初始化（INIT_DB=false）"
    echo ""
fi

# 啟動應用服務
echo "=================================="
echo "🚀 啟動 FastAPI 應用服務..."
echo "   Workers: ${UVICORN_WORKERS:-4}（並發處理）"
echo "   時區: Asia/Taipei (${TZ})"
echo "=================================="
echo ""

# 使用 exec 替換當前 shell，確保信號正確傳遞
# 使用命令行方式啟動 uvicorn（支持多 workers）
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers ${UVICORN_WORKERS:-4}
