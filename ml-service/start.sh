#!/bin/sh
# Starts the sepsis model service on localhost only. It has no auth of its own,
# so it must never be reachable from a browser or the internet — only the
# CarePulse backend calls it (ML_SERVICE_URL in backend/.env).
cd "$(dirname "$0")"

# xgboost's macOS wheel links against libomp but doesn't ship it. torch does,
# so point the loader at torch's copy: installing a second libomp (Homebrew)
# would put two OpenMP runtimes in one process, which is a known crash.
export DYLD_FALLBACK_LIBRARY_PATH="$PWD/.venv/lib/python3.11/site-packages/torch/lib"

exec .venv/bin/uvicorn api:app --host 127.0.0.1 --port "${PORT:-8000}"
