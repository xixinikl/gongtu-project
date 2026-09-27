#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { join, resolve } from "node:path";

const rootDir = resolve(new URL("..", import.meta.url).pathname);

const results = [];

function add(level, title, detail = "") {
  results.push({ level, title, detail });
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    encoding: "utf8",
    timeout: options.timeout || 8000,
  });
}

function parseVersion(text) {
  const match = String(text).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: match[0],
  };
}

function gte(version, major, minor) {
  if (!version) return false;
  if (version.major !== major) return version.major > major;
  return version.minor >= minor;
}

function checkCommandVersion(command, args, minMajor, minMinor, label) {
  const result = run(command, args);
  if (result.error || result.status !== 0) {
    add("fail", `${label} unavailable`, result.error?.message || result.stderr.trim());
    return null;
  }
  const version = parseVersion(`${result.stdout}\n${result.stderr}`);
  if (!gte(version, minMajor, minMinor)) {
    add("fail", `${label} version too old`, `found ${version?.raw || "unknown"}, need ${minMajor}.${minMinor}+`);
    return version;
  }
  add("pass", `${label} version`, version.raw);
  return version;
}

function checkPython() {
  const candidates = [
    join(rootDir, "backend", "venv", "bin", "python"),
    join(rootDir, "backend", "venv", "bin", "python3"),
    "python3",
    "python",
  ];

  let selected = null;
  let selectedVersion = null;
  for (const candidate of candidates) {
    if (candidate.startsWith("/") && !existsSync(candidate)) continue;
    const result = run(candidate, ["--version"]);
    if (result.error || result.status !== 0) continue;
    const version = parseVersion(`${result.stdout}\n${result.stderr}`);
    selected = candidate;
    selectedVersion = version;
    break;
  }

  if (!selected) {
    add("fail", "Python unavailable", "install Python 3.10+ or create backend/venv");
    return;
  }

  if (!gte(selectedVersion, 3, 10)) {
    add("fail", "Python version too old", `${selected} is ${selectedVersion?.raw || "unknown"}; need 3.10+`);
    return;
  }

  add("pass", "Python version", `${selected} ${selectedVersion.raw}`);

  const imports = run(selected, ["-c", "import fastapi, uvicorn; print('ok')"], {
    cwd: join(rootDir, "backend"),
  });
  if (imports.status === 0) {
    add("pass", "Backend Python deps", "fastapi and uvicorn import successfully");
  } else {
    add("warn", "Backend Python deps missing", "run: python3 -m pip install -r backend/requirements.txt");
  }
}

function checkFiles() {
  const required = ["package.json", "package-lock.json", "backend/requirements.txt", "backend/main.py"];
  for (const file of required) {
    add(existsSync(join(rootDir, file)) ? "pass" : "fail", `Required file: ${file}`);
  }

  add(existsSync(join(rootDir, "node_modules")) ? "pass" : "warn", "Node dependencies", existsSync(join(rootDir, "node_modules")) ? "node_modules exists" : "run: npm ci");

  const dbPath = process.env.GONTU_DB_PATH || join(rootDir, "backend", "data.db");
  add(existsSync(dbPath) ? "pass" : "warn", "SQLite database", existsSync(dbPath) ? dbPath : `not found at ${dbPath}; first backend start will initialize schema`);
}

function checkGit() {
  const branch = run("git", ["branch", "--show-current"]);
  if (branch.status === 0) add("pass", "Git branch", branch.stdout.trim() || "(detached)");
  const status = run("git", ["status", "--short"]);
  if (status.status !== 0) {
    add("warn", "Git status unavailable", status.stderr.trim());
    return;
  }
  const lines = status.stdout.trim().split("\n").filter(Boolean);
  if (lines.length === 0) {
    add("pass", "Git worktree", "clean");
  } else {
    add("warn", "Git worktree has changes", `${lines.length} changed/untracked paths`);
  }
}

function checkPort(port, label) {
  return new Promise((resolvePort) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(800);
    socket.once("connect", () => {
      socket.destroy();
      add("pass", `${label} port ${port}`, "listening");
      resolvePort();
    });
    socket.once("timeout", () => {
      socket.destroy();
      add("warn", `${label} port ${port}`, "not listening");
      resolvePort();
    });
    socket.once("error", () => {
      add("warn", `${label} port ${port}`, "not listening");
      resolvePort();
    });
  });
}

function checkPackageManager() {
  checkCommandVersion("node", ["--version"], 20, 0, "Node.js");
  const npm = run("npm", ["--version"]);
  if (npm.status === 0) add("pass", "npm version", npm.stdout.trim());
  else add("fail", "npm unavailable", npm.error?.message || npm.stderr.trim());

  const pkgPath = join(rootDir, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    add("pass", "Package manager", pkg.packageManager || "not declared");
  }
}

checkPackageManager();
checkPython();
checkFiles();
checkGit();
await checkPort(8089, "Static dev server");
await checkPort(8888, "FastAPI backend");

const icons = {
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
};

for (const item of results) {
  const suffix = item.detail ? ` - ${item.detail}` : "";
  console.log(`${icons[item.level]} ${item.title}${suffix}`);
}

const failCount = results.filter((item) => item.level === "fail").length;
const warnCount = results.filter((item) => item.level === "warn").length;

console.log("");
console.log(`doctor summary: ${failCount} fail, ${warnCount} warn`);

if (failCount > 0) {
  process.exitCode = 1;
}
