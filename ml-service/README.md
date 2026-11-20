# ml-service — sepsis early-warning model (Stage 1)

The serving layer for the **Stage 1** sepsis models, run as its own process. The CarePulse backend is the only caller; browsers never reach it, and once deployed it must also prove who it is (see **Authentication**). Research prototype (PhysioNet/CinC 2019 ICU data) — **not a diagnostic tool, not clinically validated**.

**Inputs:** hourly HR, O2Sat, Temp, Resp (any may be `null`) plus the patient's **age** and **gender** (0 = female, 1 = male). Stage 2 (wearable-trained) models are not included.

- `sepsis_core.py` is hand-ported from the training project's `pipeline.py` (the source of truth for preprocessing and model shapes). Weights are in `models/`, preprocessing/thresholds in `artifacts/`, test metrics in `results/model_comparison.csv`.
- Alert levels use each model's own frozen thresholds from `artifacts/model_registry.json`: **HIGH** = raw score ≥ the F1-optimal threshold, **ELEVATED** = ≥ the utility-optimal threshold. Both were chosen on validation patients only.
- `sample_patients.json` (six held-out ICU stays) is replayed into CarePulse by `backend/scripts/replayVitals.ts`. Only the four Stage 1 vitals are used; the other fields in the file are ignored.

## Run

```bash
uv venv --python 3.11 .venv            # the models were trained on Python 3.11
uv pip install --python .venv/bin/python -r requirements.txt
./start.sh                             # http://127.0.0.1:8000, docs at /docs
```

## Authentication

Every route except `GET /health` requires the header `X-API-Key: <ML_API_KEY>`; a missing or wrong key is a `401`. The key is a shared secret between this service and the backend (`ML_API_KEY` in both environments) and is only ever set at run time, never in an image or in frontend code. The service refuses to start without it. For local development, `./start.sh` sets `ML_AUTH_DISABLED=true` when no key is given (it only listens on 127.0.0.1); with a key set, `/docs` is turned off as well.

```bash
export ML_API_KEY=$(openssl rand -hex 32)   # use the same value in backend/.env
```

## Test

```bash
uv pip install --python .venv/bin/python -r requirements-dev.txt
.venv/bin/python -m pytest tests
```

## Check

```bash
curl http://127.0.0.1:8000/health
curl -X POST http://127.0.0.1:8000/predict -H "X-API-Key: $ML_API_KEY" -H "Content-Type: application/json" \
  -d '{"age":67,"gender":1,"history":[{"hour":10,"HR":92,"O2Sat":96,"Temp":37.4,"Resp":20}]}'
```

Endpoints: `POST /predict` (one model, default `ssl_lstm`), `POST /predict_all` (every model, latest hour), `POST /predict_series` (every model, every hour), `GET /models` (thresholds), `GET /comparison` (test metrics).

## What the backend must send

- **The whole history so far**, not just the last 6 hours. Only the latest 6 go into the network, but older hours decide what a gap is filled with.
- **`hour` = whole hours since the first reading**, one row per hour. A duplicate hour is a 422; a missing hour is treated as unmeasured.
- Vitals exactly as recorded, `null` when not measured — the model does its own forward-fill and median imputation.
- **`age` and `gender` are required** (422 without them). No names, emails or ids.
