#!/usr/bin/env python3
"""
公途 · 跨平台启动脚本
Windows / macOS / Linux 通用

用法：
    python3 start_gontu.py        # 前台运行
    python3 start_gontu.py --bg   # 后台运行（仅 Unix-like）
    python3 start_gontu.py --open # 启动后自动打开浏览器

要求：
    1. Python 3.10+
    2. 在 backend/ 同级目录执行（或自动进入）
    3. 依赖已通过 pip install -r backend/requirements.txt 安装
"""

import os
import sys
import subprocess
import platform
import time
import argparse

MIN_PYTHON = (3, 10)


def find_backend_dir():
    """自动定位 backend 目录"""
    # 当前脚本所在目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # 如果脚本在 backend/ 内，则父目录为项目根；如果在根目录，backend/ 就是子目录
    if os.path.basename(script_dir) == "backend":
        return script_dir
    backend = os.path.join(script_dir, "backend")
    if os.path.isdir(backend):
        return backend
    raise FileNotFoundError("找不到 backend 目录，请将本脚本放在项目根目录或 backend/ 内")


def get_python_cmd(backend_dir):
    """获取可用的 Python 命令，优先使用虚拟环境"""
    system = platform.system()
    venv_names = ["venv", ".venv", "venv_mac", "env"]
    
    # 1. 尝试虚拟环境
    for venv in venv_names:
        if system == "Windows":
            python_path = os.path.join(backend_dir, venv, "Scripts", "python.exe")
        else:
            python_path = os.path.join(backend_dir, venv, "bin", "python3")
        if os.path.isfile(python_path):
            return python_path
    
    # 2. 尝试系统 Python（检查 fastapi 是否可用）
    for cmd in ["python3", "python"]:
        try:
            result = subprocess.run([cmd, "-c", "import fastapi; import uvicorn; print('ok')"],
                                   capture_output=True, text=True, check=False, timeout=5)
            if result.returncode == 0:
                return cmd
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
    
    return None


def check_python_version(python_cmd):
    """Ensure the selected Python runtime matches the project syntax baseline."""
    result = subprocess.run(
        [
            python_cmd,
            "-c",
            "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')",
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=5,
    )
    if result.returncode != 0:
        print("❌ 错误：无法读取 Python 版本")
        sys.exit(1)

    raw = result.stdout.strip()
    try:
        major, minor, *_ = [int(part) for part in raw.split(".")]
    except ValueError:
        print(f"❌ 错误：无法解析 Python 版本：{raw}")
        sys.exit(1)

    if (major, minor) < MIN_PYTHON:
        need = ".".join(str(part) for part in MIN_PYTHON)
        print(f"❌ 错误：当前 Python 是 {raw}，本项目需要 Python {need}+")
        print("   建议：创建 Python 3.10+ 虚拟环境后再启动。")
        sys.exit(1)

    return raw


def install_deps(python_cmd, backend_dir):
    """安装依赖"""
    req_file = os.path.join(backend_dir, "requirements.txt")
    if not os.path.isfile(req_file):
        print(f"⚠️  未找到 {req_file}，跳过依赖安装")
        return
    
    print(f"📦 安装依赖中...")
    result = subprocess.run(
        [python_cmd, "-m", "pip", "install", "-r", req_file],
        cwd=backend_dir,
        check=False
    )
    if result.returncode != 0:
        print("⚠️  依赖安装可能失败，请检查 pip 是否可用")
    else:
        print("✅ 依赖安装完成")


def create_venv_if_needed(backend_dir):
    """如果没有虚拟环境，提示用户创建"""
    system = platform.system()
    venv_dir = os.path.join(backend_dir, "venv")
    
    if system != "Windows":
        # macOS/Linux：检查 bin/python3 是否存在
        mac_venv = os.path.join(backend_dir, "venv_mac")
        if os.path.isdir(mac_venv) and os.path.isfile(os.path.join(mac_venv, "bin", "python3")):
            return  # 已有 mac venv
        if os.path.isdir(venv_dir) and os.path.isfile(os.path.join(venv_dir, "bin", "python3")):
            return  # 已有通用 venv
    else:
        if os.path.isdir(venv_dir) and os.path.isfile(os.path.join(venv_dir, "Scripts", "python.exe")):
            return  # 已有 Windows venv
    
    print("⚠️  未检测到虚拟环境，但系统 Python 可用")


def open_browser(url):
    """用系统默认浏览器打开 URL"""
    system = platform.system()
    if system == "Windows":
        subprocess.Popen(["start", "", url], shell=True)
    elif system == "Darwin":  # macOS
        subprocess.Popen(["open", url])
    else:  # Linux
        subprocess.Popen(["xdg-open", url])


def main():
    parser = argparse.ArgumentParser(description="启动公途后端服务")
    parser.add_argument("--bg", action="store_true", help="后台运行（Unix-like）")
    parser.add_argument("--open", action="store_true", help="启动后打开浏览器")
    parser.add_argument("--port", default="8888", help="端口号（默认8888）")
    parser.add_argument("--install", action="store_true", help="强制安装依赖")
    args = parser.parse_args()

    print("🚀 公途 · 启动脚本")
    print("-" * 40)

    # 1. 定位 backend
    backend_dir = find_backend_dir()
    print(f"📁 backend 目录: {backend_dir}")

    # 2. 获取 Python 命令
    python_cmd = get_python_cmd(backend_dir)
    if python_cmd is None:
        print("❌ 错误：找不到可用的 Python 环境，请确保已安装 Python 3.10+")
        sys.exit(1)
    python_version = check_python_version(python_cmd)
    print(f"🐍 Python: {python_cmd} ({python_version})")

    # 3. 检查/安装依赖
    if args.install:
        install_deps(python_cmd, backend_dir)
    else:
        try:
            result = subprocess.run(
                [python_cmd, "-c", "import fastapi; import uvicorn; print('ok')"],
                capture_output=True, text=True, timeout=5, check=False
            )
            if result.returncode != 0:
                print("⚠️  依赖未安装，正在自动安装...")
                install_deps(python_cmd, backend_dir)
        except Exception:
            pass

    # 4. 启动服务
    host = "127.0.0.1"
    port = args.port
    cmd = [python_cmd, "-m", "uvicorn", "main:app", "--host", host, "--port", port]

    print(f"🌐 启动服务: http://{host}:{port}")
    print("-" * 40)

    if args.open:
        time.sleep(1)
        open_browser(f"http://{host}:{port}")

    # 执行
    try:
        if args.bg and platform.system() != "Windows":
            # 后台运行
            process = subprocess.Popen(cmd, cwd=backend_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f"✅ 服务已在后台启动 (PID: {process.pid})")
            print(f"   访问: http://{host}:{port}")
            print("   停止: kill", process.pid)
        else:
            subprocess.run(cmd, cwd=backend_dir, check=True)
    except KeyboardInterrupt:
        print("\n👋 服务已停止")
    except subprocess.CalledProcessError as e:
        print(f"\n❌ 服务异常退出: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
