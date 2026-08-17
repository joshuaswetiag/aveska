import { prisma } from "@/lib/db";
import { generatePersonalizedEmail } from "@/lib/ai/provider";
import { formatCurrency, slugify, withUtm, zonedDayRange, STORE_TIMEZONE } from "@/lib/utils";
import { loadStockProducts, matchStockForVehicle, vehicleCacheKey, vehicleFromOrderItem } from "@/lib/campaign/match-stock";
import { resolveProductLink, isStoreHome } from "@/lib/catalogue/product-url";
import type { CampaignType } from "@prisma/client";
import type { FitmentProfile } from "@/types";

export type CampaignGenerateInput = {
  name: string;
  type?: CampaignType;
  customerIds?: string[];
  vehicleId?: string;
  segmentId?: string;
  createdById?: string;
  from?: string;
  to?: string;
  syncOrders?: boolean;
};

export type CampaignGenerateStats = {
  from?: string;
  to?: string;
  synced?: { imported: number; created: number; updated: number };
  orders: number;
  customers: number;
  recipients: number;
  skippedNoEmail: number;
  skippedSuppressed: number;
  skippedNoVehicle: number;
  skippedNoStock: number;
};

export async function generateCampaign(
  input: CampaignGenerateInput,
  onProgress?: (done: number, total: number, message?: string) => Promise<void>,
) {
  if (input.from && input.to) {
    return generateFromOrderRange(input, onProgress);
  }
  if (input.vehicleId) {
    const to = new Intl.DateTimeFormat("en-CA", {
      timeZone: STORE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return generateFromOrderRange({ ...input, from: "2000-01-01", to, syncOrders: false }, onProgress);
  }
  return generateFromRecommendations(input, onProgress);
}

async function createCampaignRecord(input: CampaignGenerateInput, vehicleFilter?: string | null) {
  const settings = await prisma.settings.upsert({ where: { id: "default" }, update: {}, create: {} });
  const slugBase = slugify(input.name) || `campaign-${Date.now()}`;
  const existing = await prisma.campaign.findUnique({ where: { slug: slugBase } });
  const slug = existing ? `${slugBase}-${Date.now().toString().slice(-4)}` : slugBase;
  const campaign = await prisma.campaign.create({
    data: {
      name: input.name,
      slug,
      type: input.type ?? "CROSS_SELL",
      status: "GENERATED",
      targetSegmentId: input.segmentId,
      vehicleFilter: vehicleFilter ?? input.vehicleId ?? null,
      fromName: settings.fromName,
      replyTo: settings.replyTo,
      trackingEnabled: settings.utmEnabled,
      ctaLabel: "Shop the range",
      ctaUrl: settings.shopUrl,
    },
  });
  return { campaign, settings, slug };
}

async function generateFromOrderRange(
  input: CampaignGenerateInput,
  onProgress?: (done: number, total: number, message?: string) => Promise<void>,
) {
  const from = input.from!;
  const to = input.to!;
  let synced: CampaignGenerateStats["synced"];
  if (input.syncOrders !== false && process.env.NETO_API_KEY?.trim()) {
    await onProgress?.(0, 1, `Syncing Aveska orders ${from} to ${to}…`);
    const { syncNetoOrders } = await import("@/lib/catalogue/neto-orders");
    const syncResult = await syncNetoOrders(onProgress, { from, to });
    synced = { imported: syncResult.imported, created: syncResult.created, updated: syncResult.updated };
    await onProgress?.(syncResult.imported, Math.max(syncResult.imported, 1), `Synced ${syncResult.imported.toLocaleString()} orders. Building promotions…`);
  }

  const fromRange = zonedDayRange(from);
  const toRange = zonedDayRange(to);
  const { campaign, settings, slug } = await createCampaignRecord(input, `orders:${from}:${to}`);
  const filterVehicle = input.vehicleId
    ? await prisma.vehicle.findUnique({ where: { id: input.vehicleId } })
    : null;
  const suppressed = await prisma.suppression.findMany({ select: { emailNormalized: true } });
  const suppressedSet = new Set(suppressed.map((row) => row.emailNormalized));

  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        orderDate: { gte: fromRange.start, lt: toRange.end },
        externalId: { not: null },
        NOT: { externalId: { startsWith: "DEMO" } },
        customer: {
          isSuppressed: false,
          emailNormalized: { not: null },
          id: input.customerIds ? { in: input.customerIds } : undefined,
          segments: input.segmentId ? { some: { segmentId: input.segmentId } } : undefined,
        },
      },
    },
    include: {
      order: { include: { customer: true } },
      product: {
        include: {
          fitments: { include: { vehicle: true }, take: 3, orderBy: { confidence: "desc" } },
        },
      },
    },
    orderBy: { order: { orderDate: "desc" } },
  });

  type CustomerGroup = {
    customer: (typeof items)[number]["order"]["customer"];
    purchasedName: string;
    vehicle: { profile: FitmentProfile; label: string };
  };
  const byCustomer = new Map<string, CustomerGroup>();
  for (const item of items) {
    const customer = item.order.customer;
    if (!customer.emailNormalized || suppressedSet.has(customer.emailNormalized)) continue;
    if (byCustomer.has(customer.id)) continue;
    const vehicle = vehicleFromOrderItem(item);
    if (!vehicle) continue;
    if (
      filterVehicle &&
      (vehicle.profile.make?.toLowerCase() !== filterVehicle.make.toLowerCase() ||
        (filterVehicle.series.length > 0 &&
          !filterVehicle.series.some((code) => vehicle.profile.series.includes(code))))
    ) {
      continue;
    }
    byCustomer.set(customer.id, {
      customer,
      purchasedName: item.productName,
      vehicle,
    });
  }

  const orderCount = new Set(items.map((item) => item.order.id)).size;
  const uniqueCustomerIds = new Set(items.map((item) => item.order.customerId));
  let skippedNoEmail = 0;
  let skippedSuppressed = 0;
  let skippedNoVehicle = 0;
  let skippedNoStock = 0;
  for (const customerId of uniqueCustomerIds) {
    if (byCustomer.has(customerId)) continue;
    const sample = items.find((item) => item.order.customerId === customerId);
    const email = sample?.order.customer.emailNormalized;
    if (!email) skippedNoEmail += 1;
    else if (suppressedSet.has(email)) skippedSuppressed += 1;
    else skippedNoVehicle += 1;
  }

  const customerIds = [...byCustomer.keys()];
  const purchases = customerIds.length
    ? await prisma.orderItem.findMany({
        where: { order: { customerId: { in: customerIds } } },
        select: {
          sku: true,
          productId: true,
          category: true,
          order: { select: { customerId: true, orderDate: true } },
        },
      })
    : [];
  const purchasedByCustomer = new Map<string, { ids: Set<string>; skus: Array<{ sku: string; purchasedAt?: Date | null }>; types: string[] }>();
  for (const row of purchases) {
    const current = purchasedByCustomer.get(row.order.customerId) ?? { ids: new Set<string>(), skus: [], types: [] };
    if (row.productId) current.ids.add(row.productId);
    if (row.sku) current.skus.push({ sku: row.sku, purchasedAt: row.order.orderDate });
    if (row.category) current.types.push(row.category);
    purchasedByCustomer.set(row.order.customerId, current);
  }

  const stock = await loadStockProducts(settings.includeOutOfStock);
  const stockCache = new Map<string, ReturnType<typeof matchStockForVehicle>>();
  const cooldown = settings.cooldownDays === 0 ? ("never" as const) : settings.cooldownDays;
  let done = 0;
  const total = byCustomer.size;
  await onProgress?.(0, total, `Matching ${total.toLocaleString()} customers to in-stock parts`);

  for (const [customerId, group] of byCustomer) {
    const purchased = purchasedByCustomer.get(customerId) ?? { ids: new Set<string>(), skus: [], types: [] };
    const cacheKey = vehicleCacheKey(group.vehicle.profile);
    let ranked = stockCache.get(cacheKey);
    if (!ranked) {
      ranked = matchStockForVehicle(group.vehicle.profile, stock, {
        purchasedProductIds: new Set(),
        purchasedSkus: [],
        purchasedTypes: [],
        includeOutOfStock: settings.includeOutOfStock,
        reduceScoreSameFamily: settings.reduceScoreSameFamily,
        confidenceThreshold: Number(settings.confidenceThreshold),
        cooldownDays: cooldown,
        limit: 12,
      });
      stockCache.set(cacheKey, ranked);
    }
    const products = ranked
      .filter((product) => !purchased.ids.has(product.productId))
      .filter((product) => !purchased.skus.some((sku) => sku.sku.toLowerCase() === (product.sku ?? "").toLowerCase()))
      .slice(0, 3);
    if (!products.length) {
      skippedNoStock += 1;
      done += 1;
      if (done % 10 === 0) await onProgress?.(done, total, `Generated ${done.toLocaleString()} / ${total.toLocaleString()}`);
      continue;
    }

    const emailProducts = products.map((product) => {
      const url = resolveProductLink(product, settings.shopUrl);
      const tracked =
        settings.utmEnabled && !isStoreHome(url, settings.shopUrl)
          ? withUtm(url, {
              source: "email",
              medium: "email",
              campaign: slug,
              content: product.sku ?? product.productId,
            })
          : url;
      return {
        id: product.productId,
        name: product.name,
        url: tracked,
        price: product.price != null ? formatCurrency(product.price) : null,
        imageUrl: product.imageUrl,
      };
    });

    const copy = await generatePersonalizedEmail({
      customerName: group.customer.name,
      vehicle: group.vehicle.label,
      make: group.vehicle.profile.make ?? "",
      series: (group.vehicle.profile.series ?? []).join("/"),
      purchasedProduct: group.purchasedName,
      products: emailProducts,
      campaignType: input.type ?? "CROSS_SELL",
      shopUrl: settings.shopUrl,
      contactUrl: settings.contactUrl,
      logoUrl: settings.logoUrl,
    });

    await prisma.campaignRecipient.create({
      data: {
        campaignId: campaign.id,
        customerId,
        vehicleLabel: group.vehicle.label,
        purchasedProduct: group.purchasedName,
        subject: copy.subject,
        preheader: copy.preheader,
        bodyHtml: copy.html,
        personalized: { ...copy, products: emailProducts } as object,
      },
    });

    for (const [index, product] of emailProducts.entries()) {
      const existing = await prisma.campaignProduct.findFirst({
        where: { campaignId: campaign.id, productId: product.id },
      });
      if (existing) continue;
      await prisma.campaignProduct.create({
        data: { campaignId: campaign.id, productId: product.id, sortOrder: index },
      });
    }

    done += 1;
    if (done % 10 === 0 || done === total) {
      await onProgress?.(done, total, `Generated ${done.toLocaleString()} / ${total.toLocaleString()} promotions`);
    }
  }

  const first = await prisma.campaignRecipient.findFirst({ where: { campaignId: campaign.id } });
  if (first) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { subject: first.subject, preheader: first.preheader, bodyHtml: first.bodyHtml },
    });
  }

  const recipients = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } });
  await onProgress?.(
    recipients,
    Math.max(orderCount, recipients, 1),
    `Generated ${recipients.toLocaleString()} promotions from ${orderCount.toLocaleString()} orders`,
  );

  const record = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
    include: { products: { include: { product: true } } },
  });
  return Object.assign(record, {
    generateStats: {
      from,
      to,
      synced,
      orders: orderCount,
      customers: uniqueCustomerIds.size,
      recipients,
      skippedNoEmail,
      skippedSuppressed,
      skippedNoVehicle,
      skippedNoStock,
    } satisfies CampaignGenerateStats,
  });
}

async function generateFromRecommendations(
  input: CampaignGenerateInput,
  onProgress?: (done: number, total: number, message?: string) => Promise<void>,
) {
  const { campaign, settings, slug } = await createCampaignRecord(input);
  await onProgress?.(0, 1, "Loading recommendations");
  const recommendations = await prisma.recommendation.findMany({
    where: {
      status: { in: ["GENERATED", "APPROVED", "EXCELLENT_MATCH"] },
      customer: {
        isSuppressed: false,
        emailNormalized: { not: null },
        id: input.customerIds ? { in: input.customerIds } : undefined,
        segments: input.segmentId ? { some: { segmentId: input.segmentId } } : undefined,
      },
      vehicleId: input.vehicleId,
    },
    include: {
      customer: true,
      vehicle: true,
      product: true,
      reasons: true,
    },
    orderBy: { score: "desc" },
  });

  const suppressed = await prisma.suppression.findMany({ select: { emailNormalized: true } });
  const suppressedSet = new Set(suppressed.map((s) => s.emailNormalized));

  const byCustomer = new Map<string, typeof recommendations>();
  for (const rec of recommendations) {
    const email = rec.customer.emailNormalized;
    if (!email || suppressedSet.has(email)) continue;
    const list = byCustomer.get(rec.customerId) ?? [];
    if (list.length >= 3) continue;
    if (list.some((r) => r.productId === rec.productId)) continue;
    list.push(rec);
    byCustomer.set(rec.customerId, list);
  }

  for (const [customerId, recs] of byCustomer) {
    const customer = recs[0].customer;
    const vehicle = recs[0].vehicle;
    const lastItem = await prisma.orderItem.findFirst({
      where: { order: { customerId } },
      orderBy: { createdAt: "desc" },
    });
    const products = recs.map((rec) => {
      const url = resolveProductLink(rec.product, settings.shopUrl);
      const tracked =
        settings.utmEnabled && !isStoreHome(url, settings.shopUrl)
          ? withUtm(url, {
              source: "email",
              medium: "email",
              campaign: slug,
              content: rec.product.sku ?? rec.product.id,
            })
          : url;
      return {
        name: rec.product.name,
        url: tracked,
        price: rec.product.price ? formatCurrency(Number(rec.product.price)) : null,
        imageUrl: rec.product.imageUrl,
        id: rec.product.id,
        recommendationId: rec.id,
      };
    });

    const copy = await generatePersonalizedEmail({
      customerName: customer.name,
      vehicle: vehicle.canonicalName,
      make: vehicle.make,
      series: vehicle.series.join("/"),
      purchasedProduct: lastItem?.productName ?? "",
      products,
      campaignType: input.type ?? "CROSS_SELL",
      shopUrl: settings.shopUrl,
      contactUrl: settings.contactUrl,
      logoUrl: settings.logoUrl,
    });

    await prisma.campaignRecipient.create({
      data: {
        campaignId: campaign.id,
        customerId,
        vehicleLabel: vehicle.canonicalName,
        purchasedProduct: lastItem?.productName,
        subject: copy.subject,
        preheader: copy.preheader,
        bodyHtml: copy.html,
        personalized: copy as object,
      },
    });

    for (const [index, product] of products.entries()) {
      const existing = await prisma.campaignProduct.findFirst({
        where: { campaignId: campaign.id, productId: product.id },
      });
      if (existing) continue;
      await prisma.campaignProduct.create({
        data: {
          campaignId: campaign.id,
          productId: product.id,
          recommendationId: product.recommendationId,
          sortOrder: index,
        },
      });
    }
  }

  const first = await prisma.campaignRecipient.findFirst({ where: { campaignId: campaign.id } });
  if (first) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        subject: first.subject,
        preheader: first.preheader,
        bodyHtml: first.bodyHtml,
      },
    });
  }

  return prisma.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
    include: { products: { include: { product: true } } },
  });
}
