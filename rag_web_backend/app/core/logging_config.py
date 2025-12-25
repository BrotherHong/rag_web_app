"""日誌配置"""

import logging
import logging.config
import sys
from pathlib import Path

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
            "format": LOG_FORMAT,
            "datefmt": DATE_FORMAT,
        },
        "access": {
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
        "access_console": {
            "class": "logging.StreamHandler",
            "formatter": "access",
            "stream": "ext://sys.stdout",
        },
    },
    "loggers": {
        "uvicorn": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "uvicorn.error": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "uvicorn.access": {
            "handlers": ["access_console"],
            "level": "INFO",
            "propagate": False,
        },
        # 應用程式日誌
        "app": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}


def setup_logging():
    """初始化日誌配置"""
    # 應用日誌配置
    logging.config.dictConfig(LOGGING_CONFIG)
    
    # 記錄初始化訊息
    logger = logging.getLogger("app")
    logger.info("=" * 80)
    logger.info("日誌系統已初始化（時區: Asia/Taipei）")
    logger.info("輸出: Console (由 Docker 收集到日誌文件)")
    logger.info("=" * 80)
    
    return logger
