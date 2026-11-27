"""Settings from environment variables (and an optional .env file). Never commit .env."""
import os
from decimal import Decimal
from pathlib import Path


def _load_dotenv(path: Path = Path(".env")) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///fbt_bot.db")
BIG_TX_THRESHOLD = Decimal(os.environ.get("BIG_TX_THRESHOLD", "50000"))
LOW_BALANCE_THRESHOLD = Decimal(os.environ.get("LOW_BALANCE_THRESHOLD", "10000"))
CHECK_INTERVAL_SECONDS = int(os.environ.get("CHECK_INTERVAL_SECONDS", "60"))
LINK_CODE_MINUTES = 15
# Read-only bridge for the website (bot/web.py). The key is a demo-grade shared secret.
BOT_API_KEY = os.environ.get("BOT_API_KEY", "")
WEB_ORIGINS = [o.strip() for o in os.environ.get(
    "WEB_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]


def bot_token() -> str:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        raise SystemExit("TELEGRAM_BOT_TOKEN is not set (see bot/README.md)")
    return token
