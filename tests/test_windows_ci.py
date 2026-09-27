"""
Windows CI integration test
Runs on GitHub Actions windows-latest, verifying:
1. requirements.txt dependencies are complete
2. All backend modules import correctly
3. start_gontu.py syntax is valid
4. Server starts and responds to /api/health
"""
import os
import sys
import io
import json
import time
import subprocess
import urllib.request
import urllib.error
import tempfile

# Force UTF-8 output on Windows (cp1252 can't encode CJK)
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_DIR, "backend")
EXIT_OK = 0
EXIT_FAIL = 1


def fail(msg):
    print(f"  FAIL  {msg}")
    return False


# ── 测试 1: requirements.txt 完整性 ───────────
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


# ── 测试 2: 依赖导入 ──────────────────────────
def test_imports():
    """验证所有核心模块能成功导入（依赖须已安装）"""
    modules = [
        ("fastapi", "FastAPI"),
        ("uvicorn", "Uvicorn"),
        ("main", "main"),
        ("database", "database"),
        ("auth", "auth"),
        ("models", "models"),
        ("mindmap", "mindmap"),
        ("shenlun", "shenlun"),
    ]
    sys.path.insert(0, BACKEND_DIR)
    all_ok = True
    for mod_name, _desc in modules:
        try:
            __import__(mod_name)
            print(f"  PASS  import {mod_name}")
        except ImportError as e:
            print(f"  FAIL  import {mod_name}: {e}")
            all_ok = False
    return all_ok


# ── 测试 3: 跨平台启动脚本语法 ─────────────────
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


# ── 测试 4: 服务启动与健康检查 ─────────────────
def test_server_health():
    """启动服务，等待就绪，请求 /api/health，然后关闭"""
    server_process = None
    stderr_log = None
    try:
        stderr_log = tempfile.NamedTemporaryFile(
            mode="w", suffix=".log", delete=False, encoding="utf-8"
        )
        server_process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app",
             "--host", "127.0.0.1", "--port", "8888"],
            cwd=BACKEND_DIR,
            stdout=subprocess.DEVNULL,
            stderr=stderr_log,
        )
        stderr_log.close()
        print(f"  INFO  服务进程 PID={server_process.pid}，等待就绪...")

        # 轮询等待服务就绪（最多 30 秒）
        url = "http://127.0.0.1:8888/api/health"
        deadline = time.time() + 30
        last_error = ""
        while time.time() < deadline:
            # 检查进程是否还活着
            if server_process.poll() is not None:
                # 进程已退出，读取 stderr 日志
                with open(stderr_log.name, "r", encoding="utf-8") as f:
                    stderr_content = f.read()
                return fail(f"服务进程异常退出 (code={server_process.returncode}): {stderr_content[-500:]}")

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

        # 超时：检查进程是否还活着
        if server_process.poll() is not None:
            with open(stderr_log.name, "r", encoding="utf-8") as f:
                stderr_content = f.read()
            return fail(f"服务进程退出: {stderr_content[-500:]}")
        return fail(f"服务未在 30s 内就绪: {last_error}")

    finally:
        if server_process is not None and server_process.poll() is None:
            try:
                server_process.terminate()
                server_process.wait(timeout=5)
                print("  INFO  服务已关闭")
            except subprocess.TimeoutExpired:
                server_process.kill()
                print("  INFO  服务被强制终止")
        if stderr_log is not None and os.path.exists(stderr_log.name):
            os.unlink(stderr_log.name)


# ── 主入口 ─────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  Gongtu Windows CI Integration Test")
    print("=" * 60)
    print()

    tests = [
        ("requirements.txt 安装", test_requirements_complete),
        ("依赖导入检查", test_imports),
        ("start_gontu.py 语法", test_start_gontu_syntax),
        ("服务启动 & 健康检查", test_server_health),
    ]

    results = []
    for name, fn in tests:
        print(f"-- {name} --")
        results.append(fn())
        print()

    print("=" * 60)
    passed = sum(results)
    total = len(results)
    if passed == total:
        print(f"  ALL PASS ({passed}/{total})")
        sys.exit(EXIT_OK)
    else:
        print(f"  {passed} passed, {total - passed} failed")
        sys.exit(EXIT_FAIL)
