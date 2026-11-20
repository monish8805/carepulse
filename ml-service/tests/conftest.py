import os
import sys
from pathlib import Path

# api.py checks the key at import time, so it has to be set before the app is imported.
os.environ["ML_API_KEY"] = "test-key-for-pytest"
os.environ.pop("ML_AUTH_DISABLED", None)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
