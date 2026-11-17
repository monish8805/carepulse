"""Drop-in FastAPI router for the sepsis models.

In an existing FastAPI backend:
    from sepsis_router import router
    app.include_router(router, prefix="/sepsis")      # prefix is optional

Endpoints: POST /predict, POST /predict_all, POST /predict_series, GET /models, GET /comparison.
Weights are read from SEPSIS_MODELS_DIR / SEPSIS_ARTIFACTS_DIR (defaults: ./models and ./artifacts next to this file).
"""
import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from sepsis_core import DISCLAIMER, ModelHub

HERE = Path(__file__).resolve().parent
router = APIRouter(tags=["sepsis"])


@lru_cache(maxsize=1)
def get_hub() -> ModelHub:
    return ModelHub(os.environ.get("SEPSIS_MODELS_DIR", HERE / "models"), os.environ.get("SEPSIS_ARTIFACTS_DIR", HERE / "artifacts"))


class PredictRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    patient_id: Optional[str] = None
    history: list[dict]
    age: Optional[float] = None          # years; both age and gender are model inputs (Stage 1)
    gender: Optional[int] = None         # 0 = female, 1 = male, as in the training data
    model: Optional[str] = None          # registry key, e.g. "xgboost"; default is the final model


def _run(fn, *a):
    try:
        return fn(*a)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/predict")
def predict(req: PredictRequest):
    hub = get_hub(); key = req.model or hub.primary
    if key not in hub.info:
        raise HTTPException(status_code=422, detail="unknown model '%s'; choose one of %s" % (key, sorted(hub.info)))
    out = _run(hub.predict_all, req.history, req.age, req.gender)
    m = out["models"][key]
    # model / model_version added for CarePulse, which stores both on every prediction so a retrain is traceable.
    return dict(sepsis_probability=m["sepsis_probability"], risk_level=m["risk_level"], history_hours=out["history_hours"],
                warning=" ".join(out["warnings"]) or None, model=key, model_version=hub.cfg.get("version"))


@router.post("/predict_all")
def predict_all(req: PredictRequest):
    """One probability and alert level from every model, for the latest hour of the same history."""
    return _run(get_hub().predict_all, req.history, req.age, req.gender)


@router.post("/predict_series")
def predict_series(req: PredictRequest):
    """Every model's score for every hour of the history, in one call."""
    out = _run(get_hub().predict_series, req.history, req.age, req.gender)
    out["model_version"] = get_hub().cfg.get("version")
    return out


@router.get("/models")
def models():
    hub = get_hub()
    return dict(primary=hub.primary, models=[{k: v for k, v in m.items() if k in ("key", "name", "kind")} for m in hub.reg["models"]],
                thresholds={m["key"]: dict(elevated_raw=m["elevated_raw_threshold"], high_raw=m["high_raw_threshold"], **hub.alert_levels(m["key"]))
                            for m in hub.reg["models"]},
                disclaimer=DISCLAIMER)


@router.get("/comparison")
def comparison():
    """Held-out test comparison written by the notebook (results/model_comparison.csv)."""
    return dict(rows=get_hub().comparison())
