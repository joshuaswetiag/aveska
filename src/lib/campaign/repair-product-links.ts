import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { renderEmailHtml } from "@/lib/email/provider";
import { withUtm } from "@/lib/utils";
import { isStoreHome, resolveProductLink } from "@/lib/catalogue/product-url";
import type { EmailCopy } from "@/types";

type StoredProduct = {
  id?: string;
  name: string;
  url: string;
  price?: string | null;
  imageUrl?: string | null;
};

type StoredCopy = Omit<EmailCopy, "html"> & {
  products?: StoredProduct[];
  html?: string;
};

export async function refreshCampaignProductLinks() {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  const shopUrl = settings?.shopUrl ?? null;
  const products = await prisma.product.findMany({
    where: { url: { not: null } },
    select: { id: true, url: true, sku: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const recipients = await prisma.campaignRecipient.findMany({
    where: { personalized: { not: Prisma.DbNull } },
    select: { id: true, campaignId: true, personalized: true, campaign: { select: { slug: true } } },
  });
  let updated = 0;
  const touchedCampaigns = new Set<string>();

  for (const row of recipients) {
    const stored = row.personalized as StoredCopy | null;
    if (!stored?.products?.length) continue;
    const nextProducts = stored.products.map((product) => {
      const match = product.id ? byId.get(product.id) : undefined;
      const resolved = resolveProductLink({ url: match?.url ?? product.url }, shopUrl);
      const tracked =
        settings?.utmEnabled && !isStoreHome(resolved, shopUrl)
          ? withUtm(resolved, {
              source: "email",
              medium: "email",
              campaign: row.campaign.slug,
              content: match?.sku ?? product.id,
            })
          : resolved;
      return { ...product, url: tracked };
    });
    const html = renderEmailHtml(stored, nextProducts, { logoUrl: settings?.logoUrl });
    await prisma.campaignRecipient.update({
      where: { id: row.id },
      data: {
        bodyHtml: html,
        personalized: { ...stored, products: nextProducts, html } as object,
      },
    });
    touchedCampaigns.add(row.campaignId);
    updated += 1;
  }

  for (const campaignId of touchedCampaigns) {
    const first = await prisma.campaignRecipient.findFirst({
      where: { campaignId },
      orderBy: { createdAt: "asc" },
    });
    if (!first?.bodyHtml) continue;
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { bodyHtml: first.bodyHtml },
    });
  }

  return { recipients: updated };
}
