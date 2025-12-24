# ==============================================================================
# Nginx Dockerfile - Multi-stage build
# ==============================================================================

FROM nginx:alpine

# 複製自訂配置
COPY nginx.conf /etc/nginx/nginx.conf

# 建立靜態檔案目錄（前端檔案將通過 volumes_from 或 COPY --from 掛載）
RUN mkdir -p /usr/share/nginx/html/admin \
    && mkdir -p /usr/share/nginx/html/query

# 暴露端口
EXPOSE 80

# Nginx 健康檢查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Nginx 會自動啟動
CMD ["nginx", "-g", "daemon off;"]
