#!/bin/bash
# ==============================================================================
# 前端更新腳本
# 用於重新建置包含前端的 nginx 容器
# ==============================================================================

set -e

# 顏色輸出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  前端更新腳本${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "${YELLOW}重新建置 nginx 容器（包含前端）...${NC}"
docker compose build --no-cache nginx

echo -e "${YELLOW}重新啟動 nginx 服務...${NC}"
docker compose up -d nginx

# Docker 重建容器後 nftables DOCKER-BRIDGE 規則會遺失，需手動補回
echo -e "${YELLOW}修復 nftables 外部連線規則...${NC}"
NGINX_BRIDGE=$(docker inspect rag_nginx --format '{{range $k,$v := .NetworkSettings.Networks}}{{$v.NetworkID}}{{end}}' 2>/dev/null | cut -c1-12)
if [ -n "$NGINX_BRIDGE" ]; then
    BRIDGE_IF="br-${NGINX_BRIDGE}"
    # 若規則不存在才新增，避免重複
    if ! sudo nft list chain ip filter DOCKER-BRIDGE 2>/dev/null | grep -q "\"${BRIDGE_IF}\""; then
        sudo nft add rule ip filter DOCKER-BRIDGE "oifname \"${BRIDGE_IF}\" jump DOCKER"
        echo -e "${GREEN}nftables 規則已補回（${BRIDGE_IF}）${NC}"
    else
        echo -e "${GREEN}nftables 規則已存在，略過${NC}"
    fi
else
    echo -e "${RED}警告：找不到 nginx 橋接網路，請手動確認外部連線${NC}"
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  更新完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${YELLOW}提示：請使用 Ctrl+Shift+R 強制刷新瀏覽器${NC}"

