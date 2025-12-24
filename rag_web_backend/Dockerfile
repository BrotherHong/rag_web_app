# ==============================================================================
# Backend Dockerfile - Multi-stage Build
# ==============================================================================

# Stage 1: Base Image
FROM python:3.12-slim AS base

# 設定工作目錄
WORKDIR /app

# 安裝系統依賴
RUN apt-get update && apt-get install -y \
    # PostgreSQL 客戶端工具（健康檢查）
    postgresql-client \
    curl \
    # LibreOffice（DOC 轉換）
    libreoffice-common \
    libreoffice-writer \
    # 中文字體支援
    fonts-noto \
    fonts-noto-cjk \
    # mineru PDF 處理依賴
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-chi-tra \
    tesseract-ocr-chi-sim \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Stage 2: Dependencies
FROM base AS dependencies

# 安裝 uv（快速的 Python 套件管理器）
RUN pip install --no-cache-dir uv

# 複製依賴定義檔案
COPY pyproject.toml ./
COPY requirements.txt ./

# 使用 uv 安裝依賴（更快速）
# BuildKit cache mount 會緩存 pip 下載的檔案，重建時不用重新下載
RUN --mount=type=cache,target=/root/.cache/pip \
    --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --link-mode=copy -r requirements.txt

# Stage 3: Application
FROM base AS application

# 從 dependencies stage 複製已安裝的套件
COPY --from=dependencies /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=dependencies /usr/local/bin /usr/local/bin

# 複製應用程式碼
COPY . .

# 複製啟動腳本並設定執行權限
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# 建立上傳和日誌目錄
RUN mkdir -p /app/uploads /app/logs

# 暴露端口
EXPOSE 8000

# 健康檢查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# 使用啟動腳本
ENTRYPOINT ["/docker-entrypoint.sh"]
