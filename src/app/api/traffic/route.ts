import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { clearAllTraffic, deleteTrafficEvent } from "@/lib/email/tracking-record";

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "1";
  const id = url.searchParams.get("id")?.trim();

  if (all) {
    await clearAllTraffic();
    return NextResponse.json({ ok: true, cleared: true });
  }
  if (!id) return NextResponse.json({ error: "Missing traffic id" }, { status: 400 });
  const deleted = await deleteTrafficEvent(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id });
}
