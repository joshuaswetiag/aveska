import { auth, login, logout } from "@/auth";
import { NextResponse } from "@/server/next-response";
import { requestContext } from "@/server/request-context";
import { handleView } from "@/server/views";

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;

type RouteModule = Record<string, Handler | undefined>;

type Route = {
  method: string;
  pattern: RegExp;
  keys: string[];
  load: () => Promise<RouteModule>;
};

const routes: Route[] = [
  { method: "POST", pattern: /^\/api\/settings\/mail\/test$/, keys: [], load: () => import("@/app/api/settings/mail/test/route") },
  { method: "POST", pattern: /^\/api\/settings\/mail$/, keys: [], load: () => import("@/app/api/settings/mail/route") },
  { method: "POST", pattern: /^\/api\/settings$/, keys: [], load: () => import("@/app/api/settings/route") },
  { method: "DELETE", pattern: /^\/api\/traffic$/, keys: [], load: () => import("@/app/api/traffic/route") },
  { method: "GET", pattern: /^\/api\/bootstrap$/, keys: [], load: () => import("@/app/api/bootstrap/route") },
  { method: "POST", pattern: /^\/api\/bootstrap$/, keys: [], load: () => import("@/app/api/bootstrap/route") },
  { method: "POST", pattern: /^\/api\/jobs\/([^/]+)\/process$/, keys: ["id"], load: () => import("@/app/api/jobs/[id]/process/route") },
  { method: "GET", pattern: /^\/api\/jobs\/([^/]+)$/, keys: ["id"], load: () => import("@/app/api/jobs/[id]/route") },
  { method: "POST", pattern: /^\/api\/jobs\/([^/]+)$/, keys: ["id"], load: () => import("@/app/api/jobs/[id]/route") },
  { method: "GET", pattern: /^\/api\/imports\/([^/]+)\/errors$/, keys: ["id"], load: () => import("@/app/api/imports/[id]/errors/route") },
  { method: "GET", pattern: /^\/api\/imports\/([^/]+)$/, keys: ["id"], load: () => import("@/app/api/imports/[id]/route") },
  { method: "POST", pattern: /^\/api\/imports\/([^/]+)$/, keys: ["id"], load: () => import("@/app/api/imports/[id]/route") },
  { method: "POST", pattern: /^\/api\/imports\/upload$/, keys: [], load: () => import("@/app/api/imports/upload/route") },
  { method: "GET", pattern: /^\/api\/campaigns\/([^/]+)\/send$/, keys: ["id"], load: () => import("@/app/api/campaigns/[id]/send/route") },
  { method: "POST", pattern: /^\/api\/campaigns\/([^/]+)\/send$/, keys: ["id"], load: () => import("@/app/api/campaigns/[id]/send/route") },
  { method: "GET", pattern: /^\/api\/campaigns\/([^/]+)\/export$/, keys: ["id"], load: () => import("@/app/api/campaigns/[id]/export/route") },
  { method: "POST", pattern: /^\/api\/campaigns\/([^/]+)\/([^/]+)$/, keys: ["id", "action"], load: () => import("@/app/api/campaigns/[id]/[action]/route") },
  { method: "POST", pattern: /^\/api\/campaigns\/generate$/, keys: [], load: () => import("@/app/api/campaigns/generate/route") },
  { method: "POST", pattern: /^\/api\/demo$/, keys: [], load: () => import("@/app/api/demo/route") },
  { method: "POST", pattern: /^\/api\/analyse$/, keys: [], load: () => import("@/app/api/analyse/route") },
  { method: "POST", pattern: /^\/api\/orders\/neto-sync$/, keys: [], load: () => import("@/app/api/orders/neto-sync/route") },
  { method: "GET", pattern: /^\/api\/orders\/report$/, keys: [], load: () => import("@/app/api/orders/report/route") },
  { method: "POST", pattern: /^\/api\/catalogue\/neto-sync$/, keys: [], load: () => import("@/app/api/catalogue/neto-sync/route") },
  { method: "POST", pattern: /^\/api\/recommendations\/([^/]+)\/feedback$/, keys: ["id"], load: () => import("@/app/api/recommendations/[id]/feedback/route") },
  { method: "GET", pattern: /^\/api\/search$/, keys: [], load: () => import("@/app/api/search/route") },
  { method: "GET", pattern: /^\/api\/vehicles\/aliases\/export$/, keys: [], load: () => import("@/app/api/vehicles/aliases/export/route") },
  { method: "POST", pattern: /^\/api\/vehicles\/aliases$/, keys: [], load: () => import("@/app/api/vehicles/aliases/route") },
  { method: "POST", pattern: /^\/api\/templates$/, keys: [], load: () => import("@/app/api/templates/route") },
  { method: "POST", pattern: /^\/api\/products\/([^/]+)\/overrides$/, keys: ["id"], load: () => import("@/app/api/products/[id]/overrides/route") },
  { method: "POST", pattern: /^\/api\/customers\/([^/]+)\/vehicles$/, keys: ["id"], load: () => import("@/app/api/customers/[id]/vehicles/route") },
  { method: "GET", pattern: /^\/t\/([^/]+)\/open$/, keys: ["recipientId"], load: () => import("@/app/t/[recipientId]/open/route") },
  { method: "GET", pattern: /^\/t\/([^/]+)$/, keys: ["recipientId"], load: () => import("@/app/t/[recipientId]/route") },
];

async function routeRequest(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === "/api/auth/login" && request.method === "POST") return login(request);
  if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout();
  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ user: session.user });
  }
  if (url.pathname.startsWith("/api/views/")) return handleView(url);

  for (const route of routes) {
    if (route.method !== request.method) continue;
    const match = url.pathname.match(route.pattern);
    if (!match) continue;
    const params = Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1] ?? "")]));
    const mod = await route.load();
    const handler = mod[request.method];
    if (!handler) return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
    return handler(request, { params: Promise.resolve(params) });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export function handleApi(request: Request) {
  return requestContext.run(request, () => routeRequest(request));
}
