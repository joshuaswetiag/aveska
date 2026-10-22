import "./env";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { handleApi } from "@/server/dispatch";

const prod = process.argv.includes("--prod") || process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 3000);
const dist = path.resolve("dist");

function contentType(file: string) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

async function toWebRequest(req: IncomingMessage) {
  const host = req.headers.host ?? `localhost:${port}`;
  const method = req.method ?? "GET";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else headers.set(key, value);
  }
  const chunks: Buffer[] = [];
  if (method !== "GET" && method !== "HEAD") {
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
  }
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(`http://${host}${req.url ?? "/"}`, { method, headers, body });
}

async function writeResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    res.setHeader(key, value);
  });
  if (cookies.length) res.setHeader("set-cookie", cookies);
  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(res);
}

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const requested = path.normalize(path.join(dist, decodeURIComponent(url.pathname)));
  let file = requested.startsWith(dist) && existsSync(requested) && statSync(requested).isFile() ? requested : path.join(dist, "index.html");
  if (!existsSync(file)) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  res.setHeader("content-type", contentType(file));
  createReadStream(file).pipe(res);
}

async function boot() {
  const { ensureJobTypeEnum } = await import("@/lib/ensure-job-types");
  const { ensureAdminUser } = await import("@/lib/ensure-admin");
  const { startJobWorker } = await import("@/lib/jobs/worker");
  const { ensureFullSyncQueued } = await import("@/lib/catalogue/full-sync");
  try {
    await ensureJobTypeEnum();
  } catch (error) {
    console.error("Could not ensure job types", error);
  }
  try {
    await ensureAdminUser();
  } catch (error) {
    console.error("Could not ensure admin user", error);
  }
  startJobWorker();
  try {
    await ensureFullSyncQueued();
  } catch (error) {
    console.error("Could not queue full Aveska sync", error);
  }

  let vite: ViteDevServer | null = null;
  if (!prod) {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
  }

  const server = createServer(async (req, res) => {
    try {
      const url = req.url ?? "/";
      if (url.startsWith("/api/") || url.startsWith("/t/")) {
        const request = await toWebRequest(req);
        const response = await handleApi(request);
        await writeResponse(res, response);
        return;
      }
      if (vite) {
        vite.middlewares(req, res, () => {
          res.statusCode = 404;
          res.end();
        });
        return;
      }
      serveStatic(req, res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.statusCode = 500;
      res.end("Server error");
    }
  });

  server.listen(port, () => {
    console.log(`Aveska running at http://localhost:${port}`);
  });
}

boot().catch((error) => {
  console.error(error);
  process.exit(1);
});
