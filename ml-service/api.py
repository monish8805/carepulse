"""FastAPI service for the sepsis early-warning prototype.
Run:  uvicorn api:app --port 8000
The routes live in sepsis_router.py so an existing backend can include them; this file only adds /health and the API-key check."""
from fastapi import Depends, FastAPI

from auth import auth_enabled, check_auth_configured, require_api_key
from sepsis_router import get_hub, router
from sepsis_core import DISCLAIMER

check_auth_configured()
hub = get_hub()

# With a key set, the service may be public, so the interactive docs (which list every route) go away too.
no_docs = {"docs_url": None, "redoc_url": None, "openapi_url": None} if auth_enabled() else {}
app = FastAPI(title="Sepsis early-warning score (research prototype)", version=hub.cfg.get("version", "1.0"), description=DISCLAIMER, **no_docs)
app.include_router(router, dependencies=[Depends(require_api_key)])


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": hub is not None}
