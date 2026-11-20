#!/bin/sh
# Starts the sepsis model service on localhost only for development. Only the
# CarePulse backend calls it (ML_SERVICE_URL in backend/.env). Without ML_API_KEY it
# runs with no auth, so never expose this script's port.
cd "$(dirname "$0")"

# xgboost's macOS wheel links against libomp but doesn't ship it. torch does,
# so point the loader at torch's copy: installing a second libomp (Homebrew)
# would put two OpenMP runtimes in one process, which is a known crash.
export DYLD_FALLBACK_LIBRARY_PATH="$PWD/.venv/lib/python3.11/site-packages/torch/lib"

# api.py refuses to start without ML_API_KEY. This script only listens on 127.0.0.1,
# so for local development the key may be left out.
[ -z "$ML_API_KEY" ] && export ML_AUTH_DISABLED=true

exec .venv/bin/uvicorn api:app --host 127.0.0.1 --port "${PORT:-8000}"
