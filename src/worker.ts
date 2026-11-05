import { handleApi } from "@/server/dispatch";
import { bindWorkerDb, type WorkerBindings } from "@/lib/db";
import { bindWorkerUploads } from "@/lib/storage";
import { processNextJob } from "@/lib/jobs/queue";
import type {
  WorkerAssetFetcher,
  WorkerExecutionContext,
  WorkerScheduledController,
} from "@/types/cloudflare-bindings";

type Env = WorkerBindings & {
  ASSETS: WorkerAssetFetcher;
} & Record<string, string | undefined>;

const STRING_ENV_KEYS = [
  "AUTH_SECRET",
  "AUTH_URL",
  "TRACKING_URL",
  "EMAIL_PROVIDER",
  "RESEND_API_KEY",
  "SMTP_FROM",
  "SMTP_FROM_NAME",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "NETO_API_URL",
  "NETO_API_KEY",
  "NETO_API_USERNAME",
  "AVESKA_RUNTIME",
  "NEXT_PUBLIC_APP_NAME",
  "NEXT_PUBLIC_COMPANY_NAME",
  "MAX_UPLOAD_MB",
  "NETO_ORDERS_FROM",
  "NETO_PRODUCT_PAGE_SIZE",
  "NETO_ORDER_PAGE_SIZE",
] as const;

function applyEnv(env: Env) {
  bindWorkerDb(env);
  bindWorkerUploads(env.UPLOADS);
  // Object.entries(env) can omit secrets — copy known string bindings explicitly.
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") process.env[key] = value;
  }
  for (const key of STRING_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value.length) process.env[key] = value;
  }
}

async function handleFetch(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
  applyEnv(env);
  const url = new URL(request.url);

  // Job processing can take many seconds — run in waitUntil so the browser never hangs
  // waiting for a response (which Cloudflare cancels, causing HTML "invalid response").
  if (request.method === "POST" && /^\/api\/jobs\/[^/]+\/process$/.test(url.pathname)) {
    ctx.waitUntil(
      handleApi(request).catch((error) => {
        console.error("background job process failed", error);
      }),
    );
    return Response.json({ accepted: true }, { status: 202 });
  }

  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/t/")) {
    try {
      return await handleApi(request);
    } catch (error) {
      console.error("API error", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "Internal error" },
        { status: 500 },
      );
    }
  }

  const assetResponse = await env.ASSETS.fetch(request);
  if (assetResponse.status !== 404) return assetResponse;
  return env.ASSETS.fetch(new URL("/index.html", request.url));
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerExecutionContext) {
    return handleFetch(request, env, ctx);
  },

  async scheduled(_controller: WorkerScheduledController, env: Env, ctx: WorkerExecutionContext) {
    applyEnv(env);
    ctx.waitUntil(
      (async () => {
        for (let i = 0; i < 4; i += 1) {
          const id = await processNextJob();
          if (!id) break;
        }
      })(),
    );
  },
};
