"""Read-only bridge for the website: what the Telegram bot did.

Run:  uvicorn bot.web:app --port 8001
The website's "Telegram" page calls GET /api/telegram/activity?family_id=N and shows the list.

SECURITY: the website has no real login yet (it runs on a demo API in the browser), so this
endpoint is protected only by a shared key (BOT_API_KEY) that the website sends in a header.
A key inside browser code is visible to anyone who opens the site, so this is demo-grade.
Replace it with the real session / role check (NFR-02, NFR-03) when the backend login exists.
"""
import hmac
from datetime import timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from bot import config
from bot.activity import list_activity
from bot.db import make_session_factory

app = FastAPI(title="FBT Telegram bridge", docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=config.WEB_ORIGINS, allow_methods=["GET"], allow_headers=["X-API-Key"])
_session_factory = None


def get_db():
    global _session_factory
    if _session_factory is None:  # created on first request, not at import
        _session_factory = make_session_factory(config.DATABASE_URL)
    with _session_factory() as db:
        yield db


def require_key(x_api_key: str = Header(default="")) -> None:
    if not config.BOT_API_KEY:
        raise HTTPException(status_code=503, detail="BOT_API_KEY is not set on the server")
    if not hmac.compare_digest(x_api_key.encode(), config.BOT_API_KEY.encode()):
        raise HTTPException(status_code=401, detail="Invalid API key")


@app.get("/api/telegram/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/telegram/activity", dependencies=[Depends(require_key)])
def activity(family_id: int, limit: int = Query(50, ge=1, le=200), db=Depends(get_db)) -> list[dict]:
    rows = list_activity(db, family_id, limit)  # always scoped to one family (NFR-03)
    return [
        {
            "id": r.id,
            "createdAt": (r.created_at if r.created_at.tzinfo else r.created_at.replace(tzinfo=timezone.utc)).isoformat(),
            "actorName": r.actor_name,
            "role": r.role,
            "kind": r.kind,
            "summary": r.summary,
            "transactionId": r.transaction_id,
        }
        for r in rows
    ]
