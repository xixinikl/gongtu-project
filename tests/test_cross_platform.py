"""
跨平台桌面壳 — 自动化验证测试
测试范围：package.json 结构 / main.js Python 检测逻辑 / .bat 启动脚本
"""
import json
import os
import sys
import re
import subprocess

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def test(msg):
    """测试装饰器"""
    def decorator(fn):
        def wrapper():
            try:
                fn()
                print(f"  PASS  {msg}")
                return True
            except AssertionError as e:
                print(f"  FAIL  {msg}: {e}")
                return False
            except Exception as e:
                print(f"  ERROR {msg}: {e}")
                return False
        return wrapper
    return decorator


# ═══════════════════════════════════════════════
# package.json 验证
# ═══════════════════════════════════════════════

@test("package.json 是合法 JSON")
def test_package_json_valid():
    with open(os.path.join(PROJECT_DIR, 'desktop', 'package.json')) as f:
        data = json.load(f)
    assert isinstance(data, dict), "应为 JSON 对象"

@test("package.json 包含 Windows 打包配置")
def test_package_has_win_target():
    with open(os.path.join(PROJECT_DIR, 'desktop', 'package.json')) as f:
        data = json.load(f)
    build = data.get('build', {})
    assert 'win' in build, "缺少 build.win"
    assert build['win']['target'] in [['nsis', 'portable'], ['nsis'], ['portable']], f"Windows target 异常: {build['win']['target']}"

@test("package.json 包含 macOS 打包配置")
def test_package_has_mac_target():
    with open(os.path.join(PROJECT_DIR, 'desktop', 'package.json')) as f:
        data = json.load(f)
    build = data.get('build', {})
    assert 'mac' in build, "缺少 build.mac"
    assert 'dmg' in build['mac']['target'], "macOS target 应包含 dmg"

@test("package.json scripts 包含 build:mac 和 build:win")
def test_package_scripts():
    with open(os.path.join(PROJECT_DIR, 'desktop', 'package.json')) as f:
        data = json.load(f)
    scripts = data.get('scripts', {})
    assert 'build:mac' in scripts, "缺少 build:mac"
    assert 'build:win' in scripts, "缺少 build:win"
    assert 'build:all' in scripts, "缺少 build:all"


# ═══════════════════════════════════════════════
# main.js 跨平台逻辑验证
# ═══════════════════════════════════════════════

@test("main.js 不再硬编码 macOS 用户路径")
def test_main_no_hardcoded_macos_path():
    with open(os.path.join(PROJECT_DIR, 'desktop', 'main.js')) as f:
        content = f.read()
    assert '/Users/xixi/Workbuddy' not in content, "仍包含硬编码的 /Users/xixi/Workbuddy 路径"

@test("main.js 包含跨平台 Python 检测逻辑")
def test_main_has_platform_detection():
    with open(os.path.join(PROJECT_DIR, 'desktop', 'main.js')) as f:
        content = f.read()
    assert 'process.platform' in content, "缺少 process.platform 检测"
    assert "win32" in content, "缺少 win32 分支"

@test("main.js 路径使用 path.join 而非硬编码分隔符")
def test_main_uses_path_join():
    with open(os.path.join(PROJECT_DIR, 'desktop', 'main.js')) as f:
        content = f.read()
    # 检查关键路径都用了 path.join
    assert "path.join(__dirname, '..')" in content, "PROJECT_DIR 应用 path.join"
    assert "path.join(BACKEND_DIR, 'venv'" in content, "venv 路径应用 path.join"

@test("main.js 启动后端命令跨平台（uvicorn 而非平台专属命令）")
def test_main_spawn_uvicorn():
    with open(os.path.join(PROJECT_DIR, 'desktop', 'main.js')) as f:
        content = f.read()
    assert "'-m'" in content or '"-m"' in content, "应使用 -m 参数"
    assert 'uvicorn' in content, "应使用 uvicorn"
    assert 'main:app' in content, "应指向 main:app"


# ═══════════════════════════════════════════════
# .bat 启动脚本验证
# ═══════════════════════════════════════════════

@test("公途启动.bat 存在")
def test_bat_exists():
    bat_path = os.path.join(PROJECT_DIR, '公途启动.bat')
    assert os.path.exists(bat_path), "公途启动.bat 不存在"

@test("公途启动.bat 使用 UTF-8 编码")
def test_bat_utf8():
    bat_path = os.path.join(PROJECT_DIR, '公途启动.bat')
    if not os.path.exists(bat_path):
        return
    with open(bat_path, 'r', encoding='utf-8') as f:
        content = f.read()
    assert 'chcp 65001' in content, "应设置 UTF-8 代码页"

@test("公途启动.bat 自动安装依赖")
def test_bat_installs_deps():
    bat_path = os.path.join(PROJECT_DIR, '公途启动.bat')
    if not os.path.exists(bat_path):
        return
    with open(bat_path, 'r', encoding='utf-8') as f:
        content = f.read()
    assert 'pip install' in content or 'requirements.txt' in content, "应包含依赖安装逻辑"

@test("公途启动.bat 调用 start_gontu.py")
def test_bat_calls_start_gontu():
    bat_path = os.path.join(PROJECT_DIR, '公途启动.bat')
    if not os.path.exists(bat_path):
        return
    with open(bat_path, 'r', encoding='utf-8') as f:
        content = f.read()
    assert 'start_gontu.py' in content, "应调用 start_gontu.py"


# ═══════════════════════════════════════════════
# 文件级验证
# ═══════════════════════════════════════════════

@test("desktop/ 目录结构完整")
def test_desktop_structure():
    required = ['main.js', 'package.json']
    for f in required:
        assert os.path.exists(os.path.join(PROJECT_DIR, 'desktop', f)), f"缺少 desktop/{f}"

@test(".gitignore 包含 Windows 系统文件")
def test_gitignore_has_windows():
    with open(os.path.join(PROJECT_DIR, '.gitignore')) as f:
        content = f.read()
    assert 'Thumbs.db' in content, "缺少 Thumbs.db"
    assert 'Desktop.ini' in content, "缺少 Desktop.ini"


# ═══════════════════════════════════════════════
# main 分支保护验证
# ═══════════════════════════════════════════════

@test("当前不在 main 分支")
def test_not_on_main():
    if os.environ.get("GONGTU_ALLOW_MAIN_DAILY_ACCEPTANCE") == "1":
        return
    result = subprocess.run(['git', 'branch', '--show-current'],
                            capture_output=True, text=True, cwd=PROJECT_DIR)
    assert result.stdout.strip() != 'main', "当前在 main 分支，不应直接修改 main！"

@test("本地 main 与 origin/main 同步")
def test_main_in_sync():
    result = subprocess.run(['git', 'rev-list', '--left-right', '--count',
                             'origin/main...main'],
                            capture_output=True, text=True, cwd=PROJECT_DIR)
    # 输出格式: "0\t0" 表示同步
    parts = result.stdout.strip().split('\t')
    if len(parts) == 2:
        ahead, behind = int(parts[0]), int(parts[1])
        assert ahead == 0 and behind == 0, f"main 与 origin/main 不同步 (ahead={ahead}, behind={behind})"


# ═══════════════════════════════════════════════
if __name__ == '__main__':
    print("=" * 60)
    print("  公途 Windows 桌面版 — 跨平台验证")
    print("=" * 60)
    print()

    tests = [
        # package.json
        test_package_json_valid,
        test_package_has_win_target,
        test_package_has_mac_target,
        test_package_scripts,
        # main.js
        test_main_no_hardcoded_macos_path,
        test_main_has_platform_detection,
        test_main_uses_path_join,
        test_main_spawn_uvicorn,
        # .bat
        test_bat_exists,
        test_bat_utf8,
        test_bat_installs_deps,
        test_bat_calls_start_gontu,
        # 文件结构
        test_desktop_structure,
        test_gitignore_has_windows,
        # main 分支保护
        test_not_on_main,
        test_main_in_sync,
    ]

    results = []
    for t in tests:
        results.append(t())

    print()
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    if passed == total:
        print(f"  全部通过 ({passed}/{total})")
        sys.exit(0)
    else:
        failed = total - passed
        print(f"  {passed} 通过, {failed} 失败")
        print()
        print("  修复以上问题后再提交 PR。")
        sys.exit(1)
