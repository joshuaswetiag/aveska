import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { globalSearch } from "@/lib/search";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const results = await globalSearch(q);
  return NextResponse.json(results);
}
