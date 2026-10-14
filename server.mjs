import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listCustomers, llmInfo, runAgent } from "./billing-agent.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers,
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let file = url.pathname === "/" ? "/index.html" : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC)) {
    send(res, 403, { error: "forbidden" });
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      send(res, 404, { error: "not found" });
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
    res.end(data);
  });
}

// The handler is async: anything it throws becomes an unhandled rejection,
// which kills the whole Node process. Catch it and answer the request instead.
const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(`[server] ${req.method} ${req.url} failed:`, e);
    if (!res.headersSent) send(res, 500, { error: "internal server error" });
    else if (!res.writableEnded) res.end(JSON.stringify({ type: "error", error: e.message }) + "\n");
  });
});

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && url.pathname === "/api/customers") {
    send(res, 200, { customers: listCustomers() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      send(res, 400, { error: "invalid JSON" });
      return;
    }
    const message = String(payload.message || "").trim();
    const customerId = String(payload.customerId || "c100");
    if (!message) {
      send(res, 400, { error: "message is required" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    });
    const write = (obj) => {
      if (!res.writableEnded && !res.destroyed) res.write(JSON.stringify(obj) + "\n");
    };
    // The model can take a while between tool calls; keep the stream alive.
    const heartbeat = setInterval(() => write({ type: "ping" }), 15000);
    try {
      const { text, ctx } = await runAgent(customerId, message, {
        onTool: (event) => write({ type: "tool", ...event }),
      });
      write({
        type: "done",
        text,
        toolsCalled: ctx.toolsCalled,
        creditIssued: ctx.creditIssued,
        tickets: ctx.tickets,
      });
    } catch (e) {
      console.error("[agent] failed:", e);
      write({ type: "error", error: e.message });
    } finally {
      clearInterval(heartbeat);
    }
    res.end();
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  send(res, 405, { error: "method not allowed" });
}

// Log anything that slips through instead of dying silently mid-request.
process.on("unhandledRejection", (e) => console.error("[server] unhandled rejection:", e));
process.on("uncaughtException", (e) => console.error("[server] uncaught exception:", e));

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use - another server is running. Stop it or set PORT.`);
    process.exit(1);
  }
  console.error("[server]", e);
});

server.listen(PORT, () => {
  const { provider, model, hasKey } = llmInfo();
  console.log(`Billing desk: http://localhost:${PORT}  (LLM: ${provider} / ${model}${hasKey ? "" : " - NO API KEY, see .env.example"})`);
});
