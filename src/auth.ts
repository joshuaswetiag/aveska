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
  return process.env.AUTH_SECRET || "dev-only-change-this-to-a-long-random-string";
}

function encode(user: SessionUser) {
  const body = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function decode(token: string): SessionUser | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionUser & { exp: number };
  if (!payload.exp || payload.exp < Date.now()) return null;
  return { id: payload.id, email: payload.email, name: payload.name, role: payload.role };
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
  const user = token ? decode(token) : null;
  if (!user) return null;
  return { user };
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

export async function login(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.headers.append("set-cookie", cookie(encode({ id: user.id, email: user.email, name: user.name, role: user.role }), MAX_AGE));
  return response;
}

export function logout() {
  const response = NextResponse.json({ ok: true });
  response.headers.append("set-cookie", cookie("", 0));
  return response;
}
