"""Start FastAPI server - run me from the backend/ directory"""
import subprocess
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
python = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'venv', 'Scripts', 'python.exe')
subprocess.run([python, '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8888'], check=True)
