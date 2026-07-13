@echo off
chcp 65001 >nul
setlocal
title 公途学习平台

cd /d "%~dp0"

echo ========================================
echo   公途学习平台
echo ========================================
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.10 或更高版本。
    echo https://www.python.org/downloads/
    pause
    exit /b 1
)

for /f "tokens=2" %%V in ('python --version 2^>^&1') do set "PY_VERSION=%%V"
echo [检查] Python %PY_VERSION%

python -c "import fastapi, uvicorn" >nul 2>&1
if errorlevel 1 (
    echo [安装] 正在安装后端依赖...
    python -m pip install -r backend\requirements.txt
    if errorlevel 1 (
        echo [错误] 依赖安装失败。
        pause
        exit /b 1
    )
)

echo [启动] http://127.0.0.1:8888
python start_gontu.py --open
if errorlevel 1 (
    echo [错误] 公途启动失败，请查看上方日志。
    pause
    exit /b 1
)

endlocal
