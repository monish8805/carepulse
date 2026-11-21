# syntax=docker/dockerfile:1
FROM python:3.11-slim AS builder
WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
# CPU-only torch first: the default Linux wheel bundles CUDA (~2 GB) the service never uses.
# requirements.txt then sees torch already satisfied.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
# xgboost's Linux wheel declares nvidia-nccl-cu12 (a ~340 MB GPU library) as a
# dependency; this CPU-only service never uses it. Install everything else normally,
# then xgboost alone, with its pin still taken from requirements.txt.
RUN grep -v '^xgboost' requirements.txt > requirements.no-xgboost.txt \
    && pip install --no-cache-dir -r requirements.no-xgboost.txt \
    && pip install --no-cache-dir --no-deps "$(grep '^xgboost' requirements.txt)"

FROM python:3.11-slim
# xgboost's Linux wheel needs the OpenMP runtime. (start.sh's libomp workaround is macOS-only.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home appuser
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1
# One thread each for torch/xgboost. On a small CPU quota, many threads fight over it and a
# call took 6-10 s instead of ~0.1 s; one call is ~20 ms of work, so extra threads buy nothing.
ENV OMP_NUM_THREADS=1 MKL_NUM_THREADS=1
WORKDIR /app
COPY api.py auth.py sepsis_core.py sepsis_router.py ./
COPY artifacts ./artifacts
COPY models ./models
COPY results ./results
USER appuser
# Which commit this image is. Public, not a secret; /health reports it.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"
# ML_API_KEY is supplied at run time (never baked in); the service refuses to start without it.
# 0.0.0.0 is the container's own interface. /health is open, every other route needs the key.
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
