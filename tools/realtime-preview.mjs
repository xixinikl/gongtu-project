#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync, watch } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const backendDir = resolve(rootDir, "backend");
const host = "127.0.0.1";
const webPort = readPort("PORT", 8089);
const apiPort = readPort("API_PORT", 8888);
const python = process.env.XDS_PYTHON || "python3";
const reloadClients = new Set();
let shuttingDown = false;

if (webPort === apiPort) {
  throw new Error("PORT and API_PORT must be different");
}

const blockedSegments = new Set([
  ".git",
  ".github",
  ".xds",
  ".codex-runtime",
  "backend",
  "node_modules",
  "output",
  "tests",
  "tools",
]);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function readPort(name, fallback) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a valid TCP port`);
  }
  return value;
}

function safeStaticPath(requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const segments = relativePath.split("/").filter(Boolean);
  if (segments.some((part) => part === ".." || blockedSegments.has(part) || part.startsWith(".env"))) {
    return null;
  }
  const filePath = resolve(rootDir, relativePath);
  if (!filePath.startsWith(`${rootDir}${sep}`) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return null;
  }
  return filePath;
}

function isBlockedRequestPath(requestPath) {
  try {
    const segments = decodeURIComponent(requestPath).split("/").filter(Boolean);
    return segments.some((part) => part === ".." || blockedSegments.has(part) || part.startsWith(".env"));
  } catch {
    return true;
  }
}

function liveReloadScript() {
  return `<script data-xds-live-reload>(function(){var e=new EventSource('/__xds_reload');e.onmessage=function(m){if(m.data==='reload')location.reload();};})();</script>`;
}

async function serveStatic(request, response, filePath) {
  const extension = extname(filePath).toLowerCase();
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  response.setHeader("Content-Type", mimeTypes[extension] || "application/octet-stream");
  if (extension !== ".html") {
    createReadStream(filePath).pipe(response);
    return;
  }
  const html = await import("node:fs/promises").then(({ readFile }) => readFile(filePath, "utf8"));
  const injected = html.includes("</body>")
    ? html.replace("</body>", `${liveReloadScript()}</body>`)
    : `${html}${liveReloadScript()}`;
  response.end(injected);
}

function proxyToBackend(request, response) {
  const proxyRequest = httpRequest(
    {
      hostname: host,
      port: apiPort,
      path: request.url,
      method: request.method,
      headers: { ...request.headers, host: `${host}:${apiPort}` },
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    },
  );
  proxyRequest.on("error", (error) => {
    if (!response.headersSent) response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "backend_unavailable", detail: error.message }));
  });
  request.pipe(proxyRequest);
}

function backendIsReady() {
  return new Promise((resolveReady) => {
    const healthRequest = httpRequest(
      { hostname: host, port: apiPort, path: "/api/health", method: "GET" },
      (healthResponse) => {
        healthResponse.resume();
        resolveReady(healthResponse.statusCode === 200);
      },
    );
    healthRequest.setTimeout(500, () => healthRequest.destroy());
    healthRequest.on("error", () => resolveReady(false));
    healthRequest.end();
  });
}

async function waitForBackend() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await backendIsReady()) return;
    if (backend.exitCode != null) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`Gongtu backend did not become healthy on ${host}:${apiPort}`);
}

const backend = spawn(
  python,
  ["-m", "uvicorn", "main:app", "--host", host, "--port", String(apiPort), "--reload"],
  { cwd: backendDir, env: process.env, stdio: "inherit" },
);

backend.on("exit", (code, signal) => {
  if (!shuttingDown) {
    console.error(`Gongtu backend stopped unexpectedly (code=${code}, signal=${signal})`);
    shutdown(1);
  }
});

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || host}`);
  if (url.pathname === "/__xds_reload") {
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    });
    response.write("retry: 500\n\n");
    reloadClients.add(response);
    request.on("close", () => reloadClients.delete(response));
    return;
  }
  if (isBlockedRequestPath(url.pathname)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const filePath = safeStaticPath(url.pathname);
  if (filePath && (request.method === "GET" || request.method === "HEAD")) {
    if (request.method === "HEAD") {
      response.writeHead(200, {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      });
      response.end();
      return;
    }
    await serveStatic(request, response, filePath);
    return;
  }
  proxyToBackend(request, response);
});

const watcher = watch(rootDir, { recursive: true }, (_eventType, filename) => {
  if (!filename) return;
  const segments = filename.split(/[\\/]/);
  if (segments.some((part) => blockedSegments.has(part))) return;
  if (![".css", ".html", ".js", ".mjs"].includes(extname(filename).toLowerCase())) return;
  for (const client of reloadClients) client.write("data: reload\n\n");
});

await waitForBackend();
server.listen(webPort, host, () => {
  console.log(`Gongtu live preview: http://${host}:${webPort}`);
  console.log(`Gongtu API: http://${host}:${apiPort}`);
});

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  watcher.close();
  for (const client of reloadClients) client.end();
  server.close();
  if (backend.exitCode == null) backend.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 500).unref();
}

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
