"""Start the FastAPI server with the active Python environment."""
import os
import subprocess
import sys

backend_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(backend_dir)
port = os.environ.get("API_PORT", "8888")
subprocess.run(
    [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", port],
    check=True,
)
