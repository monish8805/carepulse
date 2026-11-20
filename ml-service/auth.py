"""Shared-secret check for the model service. The service holds no patient data, but it is
reachable from the internet when deployed, so every route except /health requires the key."""
import hmac
import os
from typing import Optional

from fastapi import Header, HTTPException


def auth_enabled() -> bool:
    return bool(os.environ.get("ML_API_KEY"))


def auth_explicitly_disabled() -> bool:
    return os.environ.get("ML_AUTH_DISABLED") == "true"


def check_auth_configured() -> None:
    if not auth_enabled() and not auth_explicitly_disabled():
        raise RuntimeError(
            "ML_API_KEY must be set. To run without a key on localhost only (start.sh does this), set ML_AUTH_DISABLED=true."
        )


def require_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    expected = os.environ.get("ML_API_KEY")
    if not expected:
        if auth_explicitly_disabled():
            return
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")
    # Both operands are encoded: compare_digest raises on a non-ASCII str, which would turn a bad header into a 500.
    if x_api_key is None or not hmac.compare_digest(x_api_key.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid or missing API key.", headers={"WWW-Authenticate": "ApiKey"})
