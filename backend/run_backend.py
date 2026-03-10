"""Run Flask backend from project root. Usage: python run_backend.py"""
import os
import sys

os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("FLASK_APP", "backend.app")

from app import app

# Standard hosting port configuration
port = int(os.environ.get("PORT", 5000))

app.run(host="0.0.0.0", port=port, debug=False)
