#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = join(rootDir, ".codex-runtime");
const pidFile = join(runtimeDir, "http-8089.pid");
const logFile = join(runtimeDir, "http-8089.log");
const host = "127.0.0.1";
const port = 8089;

function ensureRuntimeDir() {
  mkdirSync(runtimeDir, { recursive: true });
}

function canSignal(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid() {
  if (!existsSync(pidFile)) return null;
  const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function removePidFile() {
  if (existsSync(pidFile)) {
    rmSync(pidFile, { force: true });
  }
}

function isPortOpen() {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once("error", (error) => {
      resolvePort(error.code === "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolvePort(false));
    });
    server.listen(port, host);
  });
}

async function status() {
  const pid = readPid();
  const open = await isPortOpen();
  return {
    open,
    pid,
    pidAlive: pid == null ? false : canSignal(pid),
  };
}

async function ensure() {
  ensureRuntimeDir();
  const current = await status();
  if (current.open) {
    if (!current.pidAlive) removePidFile();
    console.log(`dev server already listening at http://${host}:${port}`);
    return;
  }

  const logFd = openSync(logFile, "a");
  const child = spawn("python3", ["-m", "http.server", String(port), "--bind", host], {
    cwd: rootDir,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  writeFileSync(pidFile, `${child.pid}\n`);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isPortOpen()) {
      console.log(`dev server started at http://${host}:${port} pid=${child.pid}`);
      return;
    }
    await new Promise((resolveAttempt) => setTimeout(resolveAttempt, 100));
  }

  throw new Error(`dev server did not start; see ${logFile}`);
}

async function stop() {
  const pid = readPid();
  if (pid == null) {
    console.log("dev server pid file is missing");
    return;
  }
  if (!canSignal(pid)) {
    removePidFile();
    console.log("dev server pid was stale; cleaned pid file");
    return;
  }
  process.kill(pid, "TERM");
  removePidFile();
  console.log(`dev server stopped pid=${pid}`);
}

const command = process.argv[2] || "ensure";

if (command === "ensure" || command === "start") {
  await ensure();
} else if (command === "status") {
  const current = await status();
  console.log(JSON.stringify(current, null, 2));
} else if (command === "stop") {
  await stop();
} else {
  console.error("Usage: node tools/dev-server.mjs [ensure|start|status|stop]");
  process.exitCode = 1;
}
