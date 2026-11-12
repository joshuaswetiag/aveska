import { prisma } from "@/lib/db";
import { isEphemeralTrackingOrigin, isStableTrackingOrigin, pickTrackingBaseUrl, railwayPublicOrigin, trackingLinkLabel } from "@/lib/email/tracking";
import { readEnv } from "@/lib/read-env";

export {
  publicAppUrl,
  wrapEmailHtmlForTracking,
  isAllowedTrackingDestination,
  trackingLinkLabel,
  isPublicTrackingOrigin,
  isStableTrackingOrigin,
  pickTrackingBaseUrl,
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

export async function loadTrackingUrl() {
  try {
    const row = await prisma.settings.findUnique({
      where: { id: "default" },
      select: { trackingUrl: true },
    });
    return row?.trackingUrl?.trim() || null;
  } catch {
    return null;
  }
}

export async function saveTrackingUrl(url: string | null) {
  await prisma.settings.update({
    where: { id: "default" },
    data: { trackingUrl: url },
  });
}

export async function resolveTrackingBaseUrl() {
  const stored = await loadTrackingUrl();
  const picked = pickTrackingBaseUrl({
    stored,
    trackingUrl: readEnv("TRACKING_URL"),
    railwayPublicDomain: readEnv("RAILWAY_PUBLIC_DOMAIN"),
    railwayStaticUrl: readEnv("RAILWAY_STATIC_URL"),
    authUrl: readEnv("AUTH_URL"),
    nextAuthUrl: readEnv("NEXTAUTH_URL"),
    production: readEnv("NODE_ENV") === "production" || readEnv("AVESKA_RUNTIME") === "worker",
  });
  if (picked && isStableTrackingOrigin(picked) && isEphemeralTrackingOrigin(stored)) {
    await saveTrackingUrl(picked).catch(() => null);
  }
  return picked;
}

export async function ensureRailwayTrackingUrl() {
  const railway = railwayPublicOrigin();
  if (!isStableTrackingOrigin(railway)) return resolveTrackingBaseUrl();
  const stored = await loadTrackingUrl();
  if (!isStableTrackingOrigin(stored) && railway) {
    await saveTrackingUrl(railway).catch((error) => {
      console.warn("Could not save Railway tracking URL", error);
    });
  }
  return resolveTrackingBaseUrl();
}

const recipientSelect = { id: true, campaignId: true, customerId: true, opened: true, clicked: true } as const;

async function recipientForTestSend() {
  const job = await prisma.job.findFirst({
    where: { type: "SEND_CAMPAIGN", status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: { payload: true },
  });
  const payload = (job?.payload ?? {}) as { campaignId?: string; recipientId?: string };
  if (payload.recipientId) {
    const chosen = await prisma.campaignRecipient.findUnique({
      where: { id: payload.recipientId },
      select: recipientSelect,
    });
    if (chosen) return chosen;
  }
  if (payload.campaignId) {
    const chosen = await prisma.campaignRecipient.findFirst({
      where: { campaignId: payload.campaignId },
      orderBy: { createdAt: "asc" },
      select: recipientSelect,
    });
    if (chosen) return chosen;
  }
  return prisma.campaignRecipient.findFirst({ orderBy: { createdAt: "asc" }, select: recipientSelect });
}

export async function recordCampaignTraffic(input: {
  recipientId: string;
  type: "CLICK" | "OPEN";
  url?: string | null;
}) {
  const isTest = input.recipientId === "test";
  const recipient = isTest
    ? await recipientForTestSend()
    : await prisma.campaignRecipient.findUnique({
        where: { id: input.recipientId },
        select: recipientSelect,
      });
  if (!recipient) {
    console.warn("Traffic not recorded: campaign recipient not found", input.recipientId, input.type);
    return null;
  }
  const now = new Date();
  const baseLabel =
    input.type === "CLICK" && input.url ? trackingLinkLabel(input.url) : input.type === "OPEN" ? "Opened email" : null;
  const label = isTest && baseLabel ? `Test · ${baseLabel}` : baseLabel;
  await prisma.campaignTraffic.create({
    data: {
      campaignId: recipient.campaignId,
      recipientId: recipient.id,
      customerId: recipient.customerId,
      type: input.type,
      url: input.url ?? null,
      label,
    },
  });
  const opened = await prisma.campaignRecipient.updateMany({
    where: { id: recipient.id, opened: false },
    data: { opened: true, openedAt: now },
  });
  const clicked =
    input.type === "CLICK"
      ? await prisma.campaignRecipient.updateMany({
          where: { id: recipient.id, clicked: false },
          data: { clicked: true, clickedAt: now },
        })
      : { count: 0 };
  if (opened.count || clicked.count) {
    await prisma.campaign.update({
      where: { id: recipient.campaignId },
      data: {
        ...(opened.count ? { opened: { increment: 1 } } : {}),
        ...(clicked.count ? { clicked: { increment: 1 } } : {}),
      },
    });
  }
  return recipient;
}

export async function listCampaignTraffic(options?: { campaignId?: string; take?: number }) {
  const take = options?.take ?? 200;
  const rows = await prisma.campaignTraffic.findMany({
    where: options?.campaignId ? { campaignId: options.campaignId } : undefined,
    include: {
      customer: { select: { name: true, email: true } },
      campaign: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map(
    (row): TrafficEvent => ({
      id: row.id,
      type: row.type,
      url: row.url,
      label: row.label,
      createdAt: row.createdAt,
      customerId: row.customerId,
      customerName: row.customer.name,
      customerEmail: row.customer.email,
      campaignId: row.campaignId,
      campaignName: row.campaign.name,
    }),
  );
}

export async function trafficSummary(campaignId?: string) {
  const where = campaignId ? { campaignId } : {};
  const [clicks, opens, clickers] = await Promise.all([
    prisma.campaignTraffic.count({ where: { ...where, type: "CLICK" } }),
    prisma.campaignTraffic.count({ where: { ...where, type: "OPEN" } }),
    prisma.campaignRecipient.count({ where: { ...where, clicked: true } }),
  ]);
  return { clicks, opens, clickers };
}

export async function deleteTrafficEvent(id: string) {
  const row = await prisma.campaignTraffic.findUnique({ where: { id } });
  if (!row) return false;
  await prisma.campaignTraffic.delete({ where: { id } });
  const remaining = await prisma.campaignTraffic.findMany({
    where: { recipientId: row.recipientId },
    select: { type: true },
  });
  const stillClicked = remaining.some((event) => event.type === "CLICK");
  const stillOpened = remaining.some((event) => event.type === "OPEN" || event.type === "CLICK");
  await prisma.campaignRecipient.update({
    where: { id: row.recipientId },
    data: {
      clicked: stillClicked,
      opened: stillOpened,
      clickedAt: stillClicked ? undefined : null,
      openedAt: stillOpened ? undefined : null,
    },
  });
  return true;
}

export async function clearAllTraffic() {
  await prisma.campaignTraffic.deleteMany();
  await prisma.campaignRecipient.updateMany({
    data: { opened: false, clicked: false, openedAt: null, clickedAt: null },
  });
  await prisma.campaign.updateMany({ data: { opened: 0, clicked: 0 } });
}
