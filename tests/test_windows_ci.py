"""
Windows CI 集成测试
在 GitHub Actions windows-latest 上运行，验证：
1. 所有后端模块可正确导入
2. requirements.txt 依赖完整
3. 服务能启动并响应 /api/health
"""
import os
import sys
import json
import time
import signal
import subprocess
import urllib.request
import urllib.error

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_DIR, "backend")
EXIT_OK = 0
EXIT_FAIL = 1


def fail(msg):
    print(f"  FAIL  {msg}")
    return False


def ok(msg=""):
    if msg:
        print(f"  PASS  {msg}")
    return True


# ── 测试 1: 依赖导入 ──────────────────────────
def test_imports():
    """验证所有核心模块能成功导入"""
    modules = [
        ("fastapi", "FastAPI 框架"),
        ("uvicorn", "Uvicorn 服务器"),
        ("main", "主应用模块"),
        ("database", "数据库模块"),
        ("auth", "认证模块"),
        ("models", "数据模型"),
        ("mindmap", "思维导图"),
        ("shenlun", "申论模块"),
    ]
    sys.path.insert(0, BACKEND_DIR)
    all_ok = True
    for mod_name, desc in modules:
        try:
            __import__(mod_name)
            print(f"  PASS  import {mod_name} ({desc})")
        except ImportError as e:
            print(f"  FAIL  import {mod_name} ({desc}): {e}")
            all_ok = False
    return all_ok


# ── 测试 2: requirements.txt 完整性 ───────────
def test_requirements_complete():
    """所有 requirements.txt 中的包都可安装"""
    req_file = os.path.join(BACKEND_DIR, "requirements.txt")
    if not os.path.exists(req_file):
        return fail("requirements.txt 不存在")
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", req_file, "--quiet"],
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
        print("  PASS  pip install -r requirements.txt")
        return True
    except subprocess.CalledProcessError as e:
        print(f"  FAIL  pip install: {e.stderr[-300:]}")
        return False


# ── 测试 3: 服务启动与健康检查 ─────────────────
def test_server_health():
    """启动服务，等待就绪，请求 /api/health，然后关闭"""
    server_process = None
    try:
        # 在 backend 目录启动，方便 sqlite 数据库文件创建
        server_process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app",
             "--host", "127.0.0.1", "--port", "8888"],
            cwd=BACKEND_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print(f"  INFO  服务进程 PID={server_process.pid}，等待就绪...")

        # 轮询等待服务就绪（最多 30 秒）
        url = "http://127.0.0.1:8888/api/health"
        deadline = time.time() + 30
        last_error = ""
        while time.time() < deadline:
            try:
                resp = urllib.request.urlopen(url, timeout=2)
                data = json.loads(resp.read().decode())
                if data.get("status") == "ok":
                    print(f"  PASS  服务响应 /api/health: status=ok")
                    return True
                else:
                    last_error = f"status={data.get('status')}"
            except (urllib.error.URLError, ConnectionRefusedError, OSError) as e:
                last_error = str(e)
            except json.JSONDecodeError:
                last_error = "非 JSON 响应"
            time.sleep(1)

        return fail(f"服务未在 30s 内就绪: {last_error}")

    finally:
        # 优雅关闭
        if server_process is not None:
            try:
                server_process.terminate()
                server_process.wait(timeout=5)
                print("  INFO  服务已关闭")
            except subprocess.TimeoutExpired:
                server_process.kill()
                print("  INFO  服务被强制终止")


# ── 测试 4: 跨平台启动脚本语法 ─────────────────
def test_start_gontu_syntax():
    """确保 start_gontu.py 能被 Python 解析（语法检查）"""
    script = os.path.join(PROJECT_DIR, "start_gontu.py")
    result = subprocess.run(
        [sys.executable, "-m", "py_compile", script],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        print("  PASS  start_gontu.py 语法正确")
        return True
    return fail(f"语法错误: {result.stderr[-200:]}")


# ── 主入口 ─────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  公途 Windows CI 集成测试")
    print("=" * 60)
    print()

    tests = [
        ("依赖导入检查", test_imports),
        ("requirements.txt 安装", test_requirements_complete),
        ("start_gontu.py 语法", test_start_gontu_syntax),
        ("服务启动 & 健康检查", test_server_health),
    ]

    results = []
    for name, fn in tests:
        print(f"── {name} ──")
        results.append(fn())
        print()

    print("=" * 60)
    passed = sum(results)
    total = len(results)
    if passed == total:
        print(f"  全部通过 ({passed}/{total})")
        sys.exit(EXIT_OK)
    else:
        print(f"  {passed} 通过, {total - passed} 失败")
        sys.exit(EXIT_FAIL)
