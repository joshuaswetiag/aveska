import { auth } from "@/auth";
import { handleApi } from "@/server/dispatch";
import { requestContext } from "@/server/request-context";
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
  const state = globalThis as { aveskaAdminChecked?: boolean; aveskaAdminPromise?: Promise<void> };
  if (!state.aveskaAdminChecked && !state.aveskaAdminPromise) {
    state.aveskaAdminPromise = import("@/lib/ensure-admin")
      .then(({ ensureFirstAdmin }) => ensureFirstAdmin())
      .then(() => {
        state.aveskaAdminChecked = true;
      })
      .catch((error) => {
        state.aveskaAdminPromise = undefined;
        console.error("Could not create the first admin", error);
      });
  }
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
  await (globalThis as { aveskaAdminPromise?: Promise<void> }).aveskaAdminPromise;
  const url = new URL(request.url);

  // Job processing can take many seconds — run in waitUntil so the browser never hangs
  // waiting for a response (which Cloudflare cancels, causing HTML "invalid response").
  if (request.method === "POST" && /^\/api\/jobs\/[^/]+\/process$/.test(url.pathname)) {
    const session = await requestContext.run(request, () => auth());
    if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role === "READONLY") return Response.json({ error: "Forbidden" }, { status: 403 });
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
      const message = error instanceof Error ? error.message : "";
      const errorText = message.includes("row write limit")
        ? "Cloudflare D1 free daily write limit is used up. Login and sending will work again after midnight UTC."
        : "Internal error";
      return Response.json({ error: errorText }, { status: 500 });
    }
  }

  const assetResponse = await env.ASSETS.fetch(request);
  if (assetResponse.status !== 404) return assetResponse;
  return env.ASSETS.fetch(new URL("/index.html", request.url));
}

const worker = {
  async fetch(request: Request, env: Env, ctx: WorkerExecutionContext) {
    return handleFetch(request, env, ctx);
  },

  async scheduled(_controller: WorkerScheduledController, env: Env, ctx: WorkerExecutionContext) {
    applyEnv(env);
    await (globalThis as { aveskaAdminPromise?: Promise<void> }).aveskaAdminPromise;
    ctx.waitUntil(
      (async () => {
        for (let i = 0; i < 4; i += 1) {
          try {
            const id = await processNextJob();
            if (!id) break;
          } catch (error) {
            console.error("scheduled job failed", error);
          }
        }
      })(),
    );
  },
};

export default worker;
