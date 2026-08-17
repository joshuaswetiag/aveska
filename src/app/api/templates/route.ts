import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const slug = slugify(body.name || "template");
  const data = {
    name: body.name || "Template",
    slug,
    type: "CROSS_SELL" as const,
    subject: body.subject,
    preheader: body.preheader,
    bodyHtml: body.bodyHtml,
    ctaLabel: body.ctaLabel,
    ctaUrl: body.ctaUrl,
  };
  const template = body.id
    ? await prisma.emailTemplate.update({ where: { id: body.id }, data })
    : await prisma.emailTemplate.upsert({ where: { slug }, update: data, create: data });
  return NextResponse.json(template);
}
