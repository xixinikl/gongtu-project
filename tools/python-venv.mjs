#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const rootDir = resolve(new URL("..", import.meta.url).pathname);
const windows = process.platform === "win32";
const venvPython = join(rootDir, "backend", "venv", windows ? "Scripts" : "bin", windows ? "python.exe" : "python");
const requirements = join(rootDir, "backend", "requirements.txt");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
  });
}

function parseVersion(text) {
  const match = String(text).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), raw: match[0] };
}

function isSupported(version) {
  if (!version) return false;
  return version.major > 3 || (version.major === 3 && version.minor >= 10);
}

function pythonVersion(command) {
  const result = run(command, ["--version"]);
  if (result.status !== 0) return null;
  return parseVersion(`${result.stdout}\n${result.stderr}`);
}

function findPython() {
  const candidates = windows
    ? [venvPython, "py", "python"]
    : [venvPython, "python3.12", "python3.11", "python3.10", "python3"];
  for (const candidate of candidates) {
    if (candidate.startsWith("/") && !existsSync(candidate)) continue;
    const version = pythonVersion(candidate);
    if (isSupported(version)) return { command: candidate, version };
  }
  return null;
}

if (process.argv.includes("--check")) {
  const selected = findPython();
  if (!selected) {
    console.error("No Python 3.10+ found.");
    process.exit(1);
  }
  console.log(JSON.stringify({ command: selected.command, version: selected.version.raw }));
  process.exit(0);
}

const existingVersion = existsSync(venvPython) ? pythonVersion(venvPython) : null;
if (isSupported(existingVersion)) {
  console.log(`backend/venv already uses Python ${existingVersion.raw}`);
} else {
  const selected = findPython();
  if (!selected) {
    console.error("No Python 3.10+ found. Install a user-level Python runtime first.");
    process.exit(1);
  }
  console.log(`creating backend/venv with ${selected.command} ${selected.version.raw}`);
  const createArgs = selected.command === "py" ? ["-3", "-m", "venv", "backend/venv"] : ["-m", "venv", "backend/venv"];
  const create = run(selected.command, createArgs, { stdio: "inherit" });
  if (create.status !== 0) process.exit(create.status || 1);
}

console.log("installing backend dependencies into backend/venv");
const install = run(venvPython, ["-m", "pip", "install", "-r", requirements], { stdio: "inherit" });
if (install.status !== 0) process.exit(install.status || 1);

const verify = run(venvPython, ["-c", "import fastapi, uvicorn; print('backend deps ok')"], { stdio: "inherit" });
if (verify.status !== 0) process.exit(verify.status || 1);
console.log("backend/venv is ready");
