import { createHmac, timingSafeEqual } from "node:crypto";
import { compare } from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requestContext } from "@/server/request-context";
import { NextResponse } from "@/server/next-response";

const COOKIE = "aveska_session";
const MAX_AGE = 60 * 60 * 24 * 14;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

function secret() {
  const value = process.env.AUTH_SECRET?.trim();
  const production = process.env.NODE_ENV === "production" || process.env.AVESKA_RUNTIME === "worker";
  if (value && value !== "dev-only-change-this-to-a-long-random-string") {
    if (production && value.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
    return value;
  }
  if (production) {
    throw new Error("AUTH_SECRET is not set");
  }
  return "dev-only-change-this-to-a-long-random-string";
}

type TokenUser = SessionUser & { sid: string };

function encode(user: TokenUser) {
  const body = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function decode(token: string): TokenUser | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenUser & { exp: number };
    if (!payload.exp || payload.exp < Date.now() || !payload.sid || !payload.id) return null;
    return { id: payload.id, email: payload.email, name: payload.name, role: payload.role, sid: payload.sid };
  } catch {
    return null;
  }
}

function readCookie(header: string, name: string) {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function cookie(value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function auth() {
  const request = requestContext.getStore();
  if (!request) return null;
  const token = readCookie(request.headers.get("cookie") ?? "", COOKIE);
  const payload = token ? decode(token) : null;
  if (!payload) return null;
  const session = await prisma.session.findUnique({ where: { id: payload.sid }, include: { user: true } });
  if (!session || session.expiresAt.getTime() < Date.now() || session.userId !== payload.id) return null;
  const user = session.user;
  return { user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

export async function requireRole(roles: Role[]) {
  const session = await requireSession();
  if (!roles.includes(session.user.role)) throw new Error("Forbidden");
  return session;
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function loginKey(email: string, request: Request) {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local";
  return `login:${email}|${ip}`.slice(0, 180);
}

async function readLoginAttempt(key: string) {
  const memory = loginAttempts.get(key) ?? null;
  try {
    const rows = await prisma.$queryRaw<Array<{ value: string }>>`SELECT "value" FROM "_aveska_meta" WHERE "key" = ${key}`;
    const stored = rows[0]?.value;
    if (!stored) return memory;
    const [count, resetAt] = stored.split("|");
    const parsed = { count: Number(count) || 0, resetAt: Number(resetAt) || 0 };
    if (!memory || parsed.count >= memory.count) return parsed;
    return memory;
  } catch {
    return memory;
  }
}

async function writeLoginAttempt(key: string, count: number, resetAt: number) {
  loginAttempts.set(key, { count, resetAt });
  try {
    const value = `${count}|${resetAt}`;
    await prisma.$executeRaw`
      INSERT INTO "_aveska_meta" ("key", "value") VALUES (${key}, ${value})
      ON CONFLICT("key") DO UPDATE SET "value" = ${value}
    `;
  } catch {
    // The bookkeeping table appears when migration 0002 has been applied.
  }
}

async function clearLoginAttempt(key: string) {
  loginAttempts.delete(key);
  try {
    await prisma.$executeRaw`DELETE FROM "_aveska_meta" WHERE "key" = ${key}`;
  } catch {
    // ignored when the table is not there yet
  }
}

export async function login(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  const now = Date.now();
  const key = loginKey(email, request);
  const attempt = await readLoginAttempt(key);
  if (attempt && attempt.resetAt > now && attempt.count >= 8) {
    return NextResponse.json({ error: "Too many login attempts. Try again in a few minutes." }, { status: 429 });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await compare(password, user.passwordHash))) {
    const resetAt = attempt && attempt.resetAt > now ? attempt.resetAt : now + 10 * 60 * 1000;
    const count = attempt && attempt.resetAt > now ? attempt.count + 1 : 1;
    await writeLoginAttempt(key, count, resetAt);
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  await clearLoginAttempt(key);
  const created = await prisma.session.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + MAX_AGE * 1000) },
  });
  const response = NextResponse.json({ ok: true });
  response.headers.append(
    "set-cookie",
    cookie(encode({ id: user.id, email: user.email, name: user.name, role: user.role, sid: created.id }), MAX_AGE),
  );
  return response;
}

export async function logout() {
  const request = requestContext.getStore();
  const token = request ? readCookie(request.headers.get("cookie") ?? "", COOKIE) : "";
  const payload = token ? decode(token) : null;
  if (payload?.sid) {
    const row = await prisma.session.findUnique({ where: { id: payload.sid }, select: { userId: true } });
    if (row) await prisma.session.deleteMany({ where: { userId: row.userId } });
  }
  const response = NextResponse.json({ ok: true });
  response.headers.append("set-cookie", cookie("", 0));
  return response;
}
