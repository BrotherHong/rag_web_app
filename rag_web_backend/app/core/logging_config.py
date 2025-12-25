"""日誌配置"""

import logging
import logging.config
import sys
import time
from pathlib import Path

# 設置台灣時區
class TaiwanFormatter(logging.Formatter):
    """使用台灣時間的格式化器"""
    converter = lambda *args: time.localtime(time.time() + 8*3600)  # UTC+8

# 日誌目錄
LOG_DIR = Path("/app/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

# 日誌檔案路徑
LOG_FILE = LOG_DIR / "app.log"

# 日誌格式：包含時間戳（台灣時間）
LOG_FORMAT = "%(asctime)s - %(levelname)s - %(name)s - %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# Uvicorn 日誌配置
LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "()": TaiwanFormatter,
            "format": LOG_FORMAT,
            "datefmt": DATE_FORMAT,
        },
        "access": {
            "()": TaiwanFormatter,
            "format": "%(asctime)s - %(levelname)s - %(message)s",
            "datefmt": DATE_FORMAT,
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
            "stream": "ext://sys.stdout",
        },
        "file": {
            "class": "logging.FileHandler",
            "formatter": "default",
            "filename": str(LOG_FILE),
            "mode": "a",  # 'a' = 追加模式（啟動時手動清空）
            "encoding": "utf-8",
        },
        "access_console": {
            "class": "logging.StreamHandler",
            "formatter": "access",
            "stream": "ext://sys.stdout",
        },
        "access_file": {
            "class": "logging.FileHandler",
            "formatter": "access",
            "filename": str(LOG_FILE),
            "mode": "a",
            "encoding": "utf-8",
        },
    },
    "loggers": {
        "uvicorn": {
            "handlers": ["console", "file"],
            "level": "INFO",
            "propagate": False,
        },
        "uvicorn.error": {
            "handlers": ["console", "file"],
            "level": "INFO",
            "propagate": False,
        },
        "uvicorn.access": {
            "handlers": ["access_console", "access_file"],
            "level": "INFO",
            "propagate": False,
        },
        # 應用程式日誌
        "app": {
            "handlers": ["console", "file"],
            "level": "INFO",
            "propagate": False,
        },
    },
    "root": {
        "handlers": ["console", "file"],
        "level": "INFO",
    },
}


def setup_logging():
    """初始化日誌配置（使用台灣時間）"""
    # 清空舊日誌檔案（每次啟動重置）
    if LOG_FILE.exists():
        LOG_FILE.unlink()
    
    # 應用日誌配置
    logging.config.dictConfig(LOGGING_CONFIG)
    
    # 記錄初始化訊息
    logger = logging.getLogger("app")
    logger.info("=" * 80)
    logger.info("日誌系統已初始化（台灣時區 UTC+8）")
    logger.info(f"日誌檔案: {LOG_FILE}")
    logger.info(f"模式: 每次重啟清空，包含完整時間戳")
    logger.info("=" * 80)
    
    return logger
