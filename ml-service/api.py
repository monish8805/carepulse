"""FastAPI service for the sepsis early-warning prototype.
Run:  uvicorn api:app --port 8000
The routes live in sepsis_router.py so an existing backend can include them; this file only adds /health and /model_info."""
from fastapi import FastAPI

from sepsis_router import get_hub, router
from sepsis_core import DISCLAIMER

hub = get_hub()
app = FastAPI(title="Sepsis early-warning score (research prototype)", version=hub.base.cfg.get("version", "1.0"), description=DISCLAIMER)
app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": hub is not None}


@app.get("/model_info")
def model_info():
    m, cal = hub.base, hub.base.cal
    return {"model": m.cfg["model"], "sequence_length": m.W, "vitals": m.vitals, "base_rate": m.base,
            "thresholds": {"elevated": cal["elevated_calibrated"], "high": cal["high_calibrated"]}, "disclaimer": DISCLAIMER}
