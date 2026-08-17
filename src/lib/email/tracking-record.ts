import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";
import { isPublicTrackingOrigin, trackingLinkLabel } from "@/lib/email/tracking";

export {
  publicAppUrl,
  wrapEmailHtmlForTracking,
  isAllowedTrackingDestination,
  trackingLinkLabel,
  isPublicTrackingOrigin,
} from "@/lib/email/tracking";

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export function trackingPixelResponse() {
  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

type RecipientRow = {
  id: string;
  campaignId: string;
  customerId: string;
  opened: boolean;
  clicked: boolean;
};

export type TrafficEvent = {
  id: string;
  type: string;
  url: string | null;
  label: string | null;
  createdAt: Date;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  campaignId: string;
  campaignName: string;
};

function newId() {
  return `c${randomBytes(12).toString("hex")}`;
}

export async function loadTrackingUrl() {
  try {
    const rows = await prisma.$queryRaw<Array<{ trackingUrl: string | null }>>`
      SELECT "trackingUrl" FROM "Settings" WHERE id = 'default' LIMIT 1
    `;
    return rows[0]?.trackingUrl?.trim() || null;
  } catch {
    return null;
  }
}

export async function saveTrackingUrl(url: string | null) {
  await prisma.$executeRaw`
    UPDATE "Settings" SET "trackingUrl" = ${url}, "updatedAt" = NOW() WHERE id = 'default'
  `;
}

export async function resolveTrackingBaseUrl() {
  const stored = await loadTrackingUrl();
  const fallback =
    process.env.TRACKING_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "";
  const candidate = (stored || fallback).replace(/\/$/, "");
  return isPublicTrackingOrigin(candidate) ? candidate : null;
}

export async function recordCampaignTraffic(input: {
  recipientId: string;
  type: "CLICK" | "OPEN";
  url?: string | null;
}) {
  const rows = await prisma.$queryRaw<RecipientRow[]>`
    SELECT id, "campaignId", "customerId", opened, clicked
    FROM "CampaignRecipient"
    WHERE id = ${input.recipientId}
    LIMIT 1
  `;
  const recipient = rows[0];
  if (!recipient) return null;
  const label =
    input.type === "CLICK" && input.url ? trackingLinkLabel(input.url) : input.type === "OPEN" ? "Opened email" : null;
  await prisma.$executeRaw`
    INSERT INTO "CampaignTraffic" (id, "campaignId", "recipientId", "customerId", type, url, label, "createdAt")
    VALUES (${newId()}, ${recipient.campaignId}, ${recipient.id}, ${recipient.customerId}, ${input.type}, ${input.url ?? null}, ${label}, NOW())
  `;
  if (input.type === "CLICK") {
    await prisma.$executeRaw`
      UPDATE "CampaignRecipient"
      SET opened = true,
          clicked = true,
          "openedAt" = COALESCE("openedAt", NOW()),
          "clickedAt" = COALESCE("clickedAt", NOW()),
          "updatedAt" = NOW()
      WHERE id = ${recipient.id}
    `;
    await prisma.$executeRaw`
      UPDATE "Campaign"
      SET clicked = clicked + 1,
          opened = opened + ${recipient.opened ? 0 : 1},
          "updatedAt" = NOW()
      WHERE id = ${recipient.campaignId}
    `;
  } else if (!recipient.opened) {
    await prisma.$executeRaw`
      UPDATE "CampaignRecipient"
      SET opened = true,
          "openedAt" = COALESCE("openedAt", NOW()),
          "updatedAt" = NOW()
      WHERE id = ${recipient.id}
    `;
    await prisma.$executeRaw`
      UPDATE "Campaign"
      SET opened = opened + 1, "updatedAt" = NOW()
      WHERE id = ${recipient.campaignId}
    `;
  }
  return recipient;
}

export async function listCampaignTraffic(options?: { campaignId?: string; take?: number }) {
  const take = options?.take ?? 200;
  if (options?.campaignId) {
    return prisma.$queryRaw<TrafficEvent[]>`
      SELECT
        t.id,
        t.type,
        t.url,
        t.label,
        t."createdAt",
        t."customerId",
        c.name AS "customerName",
        c.email AS "customerEmail",
        t."campaignId",
        p.name AS "campaignName"
      FROM "CampaignTraffic" t
      JOIN "Customer" c ON c.id = t."customerId"
      JOIN "Campaign" p ON p.id = t."campaignId"
      WHERE t."campaignId" = ${options.campaignId}
      ORDER BY t."createdAt" DESC
      LIMIT ${take}
    `;
  }
  return prisma.$queryRaw<TrafficEvent[]>`
    SELECT
      t.id,
      t.type,
      t.url,
      t.label,
      t."createdAt",
      t."customerId",
      c.name AS "customerName",
      c.email AS "customerEmail",
      t."campaignId",
      p.name AS "campaignName"
    FROM "CampaignTraffic" t
    JOIN "Customer" c ON c.id = t."customerId"
    JOIN "Campaign" p ON p.id = t."campaignId"
    ORDER BY t."createdAt" DESC
    LIMIT ${take}
  `;
}

export async function trafficSummary(campaignId?: string) {
  if (campaignId) {
    const [clicks, opens, clickers] = await Promise.all([
      prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "CampaignTraffic" WHERE type = 'CLICK' AND "campaignId" = ${campaignId}`,
      prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "CampaignTraffic" WHERE type = 'OPEN' AND "campaignId" = ${campaignId}`,
      prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "CampaignRecipient" WHERE clicked = true AND "campaignId" = ${campaignId}`,
    ]);
    return {
      clicks: Number(clicks[0]?.count ?? 0),
      opens: Number(opens[0]?.count ?? 0),
      clickers: Number(clickers[0]?.count ?? 0),
    };
  }
  const [clicks, opens, clickers] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "CampaignTraffic" WHERE type = 'CLICK'`,
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "CampaignTraffic" WHERE type = 'OPEN'`,
    prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "CampaignRecipient" WHERE clicked = true`,
  ]);
  return {
    clicks: Number(clicks[0]?.count ?? 0),
    opens: Number(opens[0]?.count ?? 0),
    clickers: Number(clickers[0]?.count ?? 0),
  };
}
