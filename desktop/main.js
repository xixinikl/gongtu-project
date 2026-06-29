const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

// 项目根目录（desktop 的上一级）
const PROJECT_DIR = path.join(__dirname, '..');
const BACKEND_DIR = path.join(PROJECT_DIR, 'backend');
const PORT = 8888;
const URL = `http://127.0.0.1:${PORT}`;

let backendProcess = null;

// ── 启动 Python 后端 ──
function startBackend() {
  const pythonCmd = '/Users/xixi/Workbuddy/2026-06-28-19-13-40/venv/bin/python';

  backendProcess = spawn(pythonCmd, ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(PORT)], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      GONTU_DB_PATH: path.join(BACKEND_DIR, 'data.db'),
      GONTU_LOG_DIR: path.join(BACKEND_DIR, 'logs'),
    },
    stdio: 'pipe',
  });

  backendProcess.stdout.on('data', (data) => console.log(`[后端] ${data}`));
  backendProcess.stderr.on('data', (data) => console.error(`[后端] ${data}`));
  backendProcess.on('close', (code) => console.log(`[后端] 进程退出，退出码: ${code}`));
}

// ── 等待后端就绪 ──
function waitForBackend(retries = 30) {
  return new Promise((resolve, reject) => {
    const check = (attempt) => {
      http.get(`${URL}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempt < retries) {
          setTimeout(() => check(attempt + 1), 500);
        } else {
          reject(new Error('后端启动超时'));
        }
      }).on('error', () => {
        if (attempt < retries) {
          setTimeout(() => check(attempt + 1), 500);
        } else {
          reject(new Error('后端启动超时'));
        }
      });
    };
    check(0);
  });
}

// ── 创建主窗口 ──
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: '公途',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(URL);
  win.on('closed', () => app.quit());
}

// ── 应用启动 ──
app.whenReady().then(async () => {
  startBackend();
  try {
    await waitForBackend();
    console.log('后端已就绪，打开窗口...');
    createWindow();
  } catch (err) {
    console.error(err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill();
});
