import { auth } from "@/auth";
import { getCrossSellOpportunities } from "@/lib/campaign/opportunities";
import { getDataQuality } from "@/lib/data-quality";
import { prisma } from "@/lib/db";
import { formatFromHeader, getMailConfig, runningOnRailway } from "@/lib/email/config";
import { loadMailSettings } from "@/lib/email/settings-store";
import { listCampaignTraffic, loadTrackingUrl, resolveTrackingBaseUrl, trafficSummary } from "@/lib/email/tracking-record";
import {
  fetchOrderReportPage,
  orderShippingAmount,
  orderStatusLabel,
  parseOrderReportFilters,
  vehicleLabelForOrderItem,
} from "@/lib/orders/report";
import { formatCurrency, zonedDayRange } from "@/lib/utils";
import { NextResponse } from "@/server/next-response";

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

async function dashboard() {
  const [customers, orders, products, vehicles, recs, campaigns, approved, revenue, eligible, monthly, vehicleGroups, potential] =
    await Promise.all([
      prisma.customer.count(),
      prisma.order.count(),
      prisma.product.count(),
      prisma.vehicle.count(),
      prisma.recommendation.count(),
      prisma.campaign.count(),
      prisma.campaign.count({ where: { status: "APPROVED" } }),
      prisma.order.aggregate({ _sum: { orderTotal: true } }),
      prisma.customer.count({
        where: { isSuppressed: false, recommendations: { some: { status: { in: ["GENERATED", "APPROVED"] } } } },
      }),
      prisma.order.findMany({ where: { orderDate: { not: null } }, select: { orderDate: true } }),
      prisma.vehicle.findMany({
        include: { _count: { select: { customerVehicles: true } } },
        orderBy: { customerVehicles: { _count: "desc" } },
        take: 8,
      }),
      prisma.recommendation.aggregate({ where: { status: { in: ["GENERATED", "APPROVED"] } }, _count: true }),
    ]);

  const byMonth: Record<string, number> = {};
  for (const order of monthly) {
    if (!order.orderDate) continue;
    const key = `${order.orderDate.getFullYear()}-${String(order.orderDate.getMonth() + 1).padStart(2, "0")}`;
    byMonth[key] = (byMonth[key] ?? 0) + 1;
  }

  return {
    stats: [
      { label: "Customers", value: customers },
      { label: "Orders", value: orders },
      { label: "Revenue", value: formatCurrency(Number(revenue._sum.orderTotal ?? 0)) },
      { label: "Unique vehicles", value: vehicles },
      { label: "Catalogue products", value: products },
      { label: "Eligible for cross-sell", value: eligible },
      { label: "Recommendations", value: recs },
      { label: "Campaigns / approved", value: `${campaigns} / ${approved}` },
    ],
    ordersByMonth: Object.entries(byMonth).map(([month, count]) => ({ month, count })),
    vehicles: vehicleGroups.map((vehicle) => ({ name: vehicle.canonicalName, customers: vehicle._count.customerVehicles })),
    potential: potential._count,
  };
}

async function customers(url: URL) {
  const q = url.searchParams.get("q")?.trim() || "";
  const rows = await prisma.customer.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
      : undefined,
    include: { vehicles: { include: { vehicle: true } }, segments: { include: { segment: true } } },
    orderBy: { lastPurchaseAt: "desc" },
    take: 100,
  });
  return { q, customers: rows };
}

async function customer(id: string) {
  const row = await prisma.customer.findUnique({
    where: { id },
    include: {
      vehicles: { include: { vehicle: true } },
      orders: { include: { items: true }, orderBy: { orderDate: "desc" } },
      recommendations: { include: { product: true, vehicle: true, reasons: true }, orderBy: { score: "desc" } },
      segments: { include: { segment: true } },
      campaignRecipients: { include: { campaign: true } },
    },
  });
  return row;
}

async function products(url: URL) {
  const q = url.searchParams.get("q")?.trim() || "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = 50;
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { sku: { contains: q, mode: "insensitive" as const } },
          { series: { has: q.toUpperCase() } },
          { make: { contains: q, mode: "insensitive" as const } },
          { vehicleFamily: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : undefined;
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: {
        fitments: { include: { vehicle: true }, take: 1, orderBy: { confidence: "desc" } },
        _count: { select: { recommendations: true, orderItems: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { q, page, pageSize, total, products: rows };
}

async function product(id: string) {
  const row = await prisma.product.findUnique({
    where: { id },
    include: {
      fitments: { include: { vehicle: true } },
      overrides: true,
      orderItems: { include: { order: { include: { customer: true } } }, take: 50 },
      recommendations: true,
    },
  });
  if (!row) return null;
  const customers = new Map<string, string>();
  for (const item of row.orderItems) customers.set(item.order.customerId, item.order.customer.name);
  return {
    product: row,
    customers: [...customers.entries()].map(([id, name]) => ({ id, name })),
    eligible: row.recommendations.filter((rec) => rec.status === "GENERATED" || rec.status === "APPROVED").length,
  };
}

async function vehicles() {
  return prisma.vehicle.findMany({
    include: { _count: { select: { customerVehicles: true, fitments: true, recommendations: true } } },
    orderBy: { canonicalName: "asc" },
  });
}

async function vehicle(id: string) {
  const row = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      aliases: true,
      customerVehicles: { include: { customer: true } },
      fitments: { include: { product: { select: { id: true, name: true, url: true } } } },
      recommendations: true,
    },
  });
  if (!row) return null;
  const customerIds = row.customerVehicles.map((item) => item.customerId);
  const orders = await prisma.order.findMany({
    where: { customerId: { in: customerIds } },
    select: {
      orderTotal: true,
      items: { select: { productName: true, productId: true, product: { select: { url: true } } } },
    },
  });
  const revenue = orders.reduce((sum, order) => sum + Number(order.orderTotal ?? 0), 0);
  const purchased = new Map<string, { name: string; url: string | null; count: number }>();
  const purchasedIds = new Set<string>();
  for (const order of orders) {
    for (const item of order.items) {
      if (item.productId) purchasedIds.add(item.productId);
      const key = item.productId ?? item.productName;
      const current = purchased.get(key);
      if (current) {
        current.count += 1;
        if (!current.url && item.product?.url) current.url = item.product.url;
      } else purchased.set(key, { name: item.productName, url: item.product?.url ?? null, count: 1 });
    }
  }
  return {
    vehicle: row,
    orders: orders.length,
    revenue,
    popular: [...purchased.values()].sort((a, b) => b.count - a.count).slice(0, 12),
    available: row.fitments
      .filter((fitment) => !purchasedIds.has(fitment.productId) && !fitment.isNegative)
      .map((fitment) => ({ id: fitment.id, name: fitment.product.name, url: fitment.product.url })),
  };
}

async function aliases() {
  const rows = await prisma.vehicle.findMany({ include: { aliases: true }, orderBy: { canonicalName: "asc" } });
  return rows.map((vehicle) => ({
    id: vehicle.id,
    canonicalName: vehicle.canonicalName,
    aliases: vehicle.aliases.map((alias) => ({ id: alias.id, alias: alias.alias })),
  }));
}

async function recommendations(url: URL) {
  const status = url.searchParams.get("status")?.trim() || "";
  const recs = await prisma.recommendation.findMany({
    where: status ? { status: status as never } : undefined,
    include: { customer: true, product: true, vehicle: true, reasons: true },
    orderBy: { score: "desc" },
    take: 200,
  });
  return { status, recs };
}

async function campaigns() {
  const [rows, segments, vehicleRows] = await Promise.all([
    prisma.campaign.findMany({ include: { _count: { select: { recipients: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.segment.findMany({ orderBy: { name: "asc" } }),
    prisma.vehicle.findMany({ orderBy: { canonicalName: "asc" }, select: { id: true, canonicalName: true } }),
  ]);
  return {
    campaigns: rows,
    segments: segments.map((segment) => ({ id: segment.id, name: segment.name })),
    vehicles: vehicleRows.map((vehicle) => ({ id: vehicle.id, name: vehicle.canonicalName })),
  };
}

async function campaign(id: string) {
  const row = await prisma.campaign.findUnique({
    where: { id },
    include: {
      recipients: { include: { customer: true }, take: 200, orderBy: { createdAt: "asc" } },
      products: { include: { product: true } },
      _count: { select: { recipients: true } },
    },
  });
  if (!row) return null;
  const traffic = await listCampaignTraffic({ campaignId: id, take: 50 });
  const orderRange = row.vehicleFilter?.startsWith("orders:") ? row.vehicleFilter.replace("orders:", "").split(":") : null;
  const dateRange = orderRange?.length === 2 ? `${orderRange[0]} to ${orderRange[1]}` : null;
  const ordersInRange =
    orderRange?.length === 2
      ? await prisma.order.count({
          where: {
            orderDate: { gte: zonedDayRange(orderRange[0]).start, lt: zonedDayRange(orderRange[1]).end },
            externalId: { not: null },
            NOT: { externalId: { startsWith: "DEMO" } },
          },
        })
      : null;
  return { campaign: row, traffic, dateRange, ordersInRange };
}

async function orders(url: URL) {
  const filters = parseOrderReportFilters({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
  });
  const report = await fetchOrderReportPage(filters);
  return {
    filters,
    totalLines: report.totalLines,
    orderCount: report.orderCount,
    quantity: report.quantity,
    revenue: report.revenue,
    orderRevenue: report.orderRevenue,
    items: report.items.map((item) => ({
      id: item.id,
      orderDate: item.order.orderDate,
      externalId: item.order.externalId ?? item.order.id.slice(0, 8),
      status: orderStatusLabel(item.order) || "—",
      customerId: item.order.customerId,
      customerName: item.order.customer.name,
      email: item.order.customer.email,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      vehicle: vehicleLabelForOrderItem(item) || "—",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      shipping: orderShippingAmount(item.order),
      orderTotal: item.order.orderTotal,
    })),
  };
}

async function settings() {
  const session = await auth();
  const stored = await prisma.settings.upsert({ where: { id: "default" }, update: {}, create: {} });
  const mailSettings = await loadMailSettings();
  const trackingUrl = (await loadTrackingUrl()) ?? "";
  const mail = getMailConfig(mailSettings);
  return {
    canEdit: session?.user.role === "ADMIN",
    hostedOnRailway: runningOnRailway(),
    mail: {
      configured: mail.configured,
      provider: mail.provider,
      from: formatFromHeader(mail),
      hostLabel: mail.provider === "resend" ? "Resend HTTPS" : mail.host ? `${mail.host}:${mail.port}` : null,
      emailProvider: mail.provider,
      fromName: mailSettings?.fromName || stored.fromName || "Aveska",
      fromEmail: mailSettings?.fromEmail ?? "",
      replyTo: mailSettings?.replyTo ?? "",
      smtpHost: mailSettings?.smtpHost ?? "",
      smtpPort: mailSettings?.smtpPort ?? mail.port,
      smtpSecure: Boolean(mailSettings?.smtpSecure),
      smtpUser: mailSettings?.smtpUser ?? "",
      smtpPasswordSet: mail.smtpPasswordSet,
      emailSendDelayMs: mailSettings?.emailSendDelayMs ?? 200,
      maropostAccountId: mailSettings?.maropostAccountId ?? "",
      maropostApiKeySet: mail.maropostApiKeySet,
      maropostCampaignName: mailSettings?.maropostCampaignName ?? "aveska-intelligence",
    },
    settings: {
      cooldownDays: stored.cooldownDays,
      confidenceThreshold: Number(stored.confidenceThreshold),
      includeOutOfStock: stored.includeOutOfStock,
      utmEnabled: stored.utmEnabled,
      shopUrl: stored.shopUrl ?? "",
      contactUrl: stored.contactUrl ?? "",
      companyName: stored.companyName,
      trackingUrl,
      reduceScoreSameFamily: stored.reduceScoreSameFamily,
    },
  };
}

async function templates() {
  const rows = await prisma.emailTemplate.findMany({ orderBy: { name: "asc" } });
  return (
    rows[0] ?? {
      id: "new",
      name: "Cross-sell",
      subject: "Selected parts for your {{vehicle}}",
      preheader: "Hand-selected {{series}} parts from Aveska, chosen to suit your vehicle.",
      bodyHtml:
        "<p>Hi {{first_name}},</p><p>Thank you for choosing Aveska for your {{vehicle}}.</p><p>We've selected a short list of {{series}} parts that restorers typically look for as the project moves forward.</p>",
      ctaLabel: "View {{series}} parts",
      ctaUrl: "{{shop_url}}",
    }
  );
}

export async function handleView(url: URL) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parts = url.pathname.replace(/^\/api\/views\/?/, "").split("/").filter(Boolean);
  const [name, id, extra] = parts;

  if (name === "dashboard" && !id) return NextResponse.json(await dashboard());
  if (name === "customers" && !id) return NextResponse.json(await customers(url));
  if (name === "customers" && id && !extra) {
    const row = await customer(id);
    return row ? NextResponse.json(row) : notFound();
  }
  if (name === "products" && !id) return NextResponse.json(await products(url));
  if (name === "products" && id && !extra) {
    const row = await product(id);
    return row ? NextResponse.json(row) : notFound();
  }
  if (name === "vehicles" && id === "aliases") return NextResponse.json(await aliases());
  if (name === "vehicles" && !id) return NextResponse.json(await vehicles());
  if (name === "vehicles" && id && !extra) {
    const row = await vehicle(id);
    return row ? NextResponse.json(row) : notFound();
  }
  if (name === "recommendations" && !id) return NextResponse.json(await recommendations(url));
  if (name === "opportunities" && !id) return NextResponse.json(await getCrossSellOpportunities());
  if (name === "campaigns" && !id) return NextResponse.json(await campaigns());
  if (name === "campaigns" && id && !extra) {
    const row = await campaign(id);
    return row ? NextResponse.json(row) : notFound();
  }
  if (name === "imports" && !id) {
    return NextResponse.json(await prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 30 }));
  }
  if (name === "imports" && id && !extra) {
    const row = await prisma.importJob.findUnique({ where: { id }, include: { errors: { take: 100 } } });
    return row ? NextResponse.json(row) : notFound();
  }
  if (name === "jobs" && id && !extra) {
    const row = await prisma.job.findUnique({ where: { id } });
    return row ? NextResponse.json(row) : notFound();
  }
  if (name === "orders" && !id) return NextResponse.json(await orders(url));
  if (name === "traffic" && !id) {
    const [events, summary, trackingBase] = await Promise.all([
      listCampaignTraffic({ take: 200 }),
      trafficSummary(),
      resolveTrackingBaseUrl(),
    ]);
    return NextResponse.json({ events, summary, trackingBase });
  }
  if (name === "data-quality" && !id) return NextResponse.json(await getDataQuality());
  if (name === "settings" && id === "templates") return NextResponse.json(await templates());
  if (name === "settings" && !id) return NextResponse.json(await settings());
  return notFound();
}
