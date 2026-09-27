#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { platform } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = join(rootDir, ".codex-runtime");
const host = "127.0.0.1";
const port = Number.parseInt(process.env.GONTU_STATIC_PORT || "8089", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("GONTU_STATIC_PORT must be an integer between 1 and 65535");
}
const pidFile = join(runtimeDir, `http-${port}.pid`);
const logFile = join(runtimeDir, `http-${port}.log`);

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
    const server = createNetServer();
    server.once("error", (error) => {
      resolvePort(error.code === "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolvePort(false));
    });
    server.listen(port, host);
  });
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

function serveStatic() {
  const server = createHttpServer((request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
      const pathname = decodeURIComponent(requestUrl.pathname);
      const requestedPath = pathname === "/" ? "/index.html" : pathname;
      const filePath = resolve(rootDir, `.${requestedPath}`);
      if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${sep}`)) {
        response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Forbidden");
        return;
      }
      if (!existsSync(filePath)) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      const body = readFileSync(filePath);
      response.writeHead(200, {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Content-Type": contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
        Expires: "0",
        Pragma: "no-cache",
      });
      if (request.method === "HEAD") response.end();
      else response.end(body);
    } catch {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Server error");
    }
  });
  server.listen(port, host, () => {
    console.log(`no-cache dev server listening at http://${host}:${port}`);
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
    if (current.pidAlive) {
      console.log(`dev server already listening at http://${host}:${port}`);
      return;
    }
    removePidFile();
    throw new Error(`port ${port} belongs to another process; set GONTU_STATIC_PORT to a free port`);
  }

  const logFd = openSync(logFile, "a");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "serve"], {
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

function buildUrl(pathArg = "/") {
  if (/^https?:\/\//i.test(pathArg)) return pathArg;
  const pathname = pathArg.startsWith("/") ? pathArg : `/${pathArg}`;
  return `http://${host}:${port}${pathname}`;
}

function openBrowser(url) {
  if (process.env.GONTU_NO_OPEN === "1") return;
  const currentPlatform = platform();
  const command = currentPlatform === "darwin" ? "open" : currentPlatform === "win32" ? "cmd" : "xdg-open";
  const args = currentPlatform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

async function openPage(pathArg) {
  await ensure();
  const url = buildUrl(pathArg || "/");
  openBrowser(url);
  console.log(`opened ${url}`);
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
  process.kill(pid, "SIGTERM");
  removePidFile();
  console.log(`dev server stopped pid=${pid}`);
}

const command = process.argv[2] || "ensure";

if (command === "ensure" || command === "start") {
  await ensure();
} else if (command === "serve") {
  serveStatic();
} else if (command === "open") {
  await openPage(process.argv[3]);
} else if (command === "status") {
  const current = await status();
  console.log(JSON.stringify(current, null, 2));
} else if (command === "stop") {
  await stop();
} else {
  console.error("Usage: node tools/dev-server.mjs [ensure|start|serve|open|status|stop] [path]");
  process.exitCode = 1;
}
