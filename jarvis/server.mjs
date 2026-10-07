// Servidor mínimo de JARVIS: sirve index.html y reenvía /api/chat a la API de Claude.
// Uso: ANTHROPIC_API_KEY=... node jarvis/server.mjs   (sin dependencias, Node 18+)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.JARVIS_MODEL || "claude-sonnet-5-5";
const SYSTEM =
  "Eres JARVIS, un asistente de voz sereno, preciso y con un toque de ingenio. " +
  "Responde en el idioma del usuario, en una o dos frases cortas aptas para ser dichas en voz alta, sin markdown.";
const dir = dirname(fileURLToPath(import.meta.url));

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 1_000_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error("payload too large");
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString();
}

async function chat(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(res, 500, { error: "falta ANTHROPIC_API_KEY en el servidor" });
  let messages;
  try {
    ({ messages } = JSON.parse(await readBody(req)));
    if (!Array.isArray(messages) || !messages.length) throw new Error();
  } catch {
    return json(res, 400, { error: "solicitud inválida" });
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 400, system: SYSTEM, messages }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return json(res, 502, { error: data?.error?.message || `API ${r.status}` });
  json(res, 200, { reply: (data.content || []).filter(b => b.type === "text").map(b => b.text).join("") });
}

createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/chat") return await chat(req, res);
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(await readFile(join(dir, "index.html")));
    }
    res.writeHead(404).end();
  } catch (e) {
    json(res, 500, { error: e.message });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`JARVIS en http://localhost:${PORT}`));
