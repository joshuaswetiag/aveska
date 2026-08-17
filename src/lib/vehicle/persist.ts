import { prisma } from "@/lib/db";
import type { LearnedVehicleKnowledge, VehicleExtraction } from "@/types";
import { extractVehicle, canonicalVehicleName, vehicleSearchText, isIdentifiedVehicle } from "@/lib/vehicle/extract";
import { looksLikeProductTitle } from "@/lib/vehicle/dictionary";
import { normalizeKey, unique } from "@/lib/utils";

export async function loadLearnedKnowledge(): Promise<LearnedVehicleKnowledge> {
  const [products, aliases, vehicles] = await Promise.all([
    prisma.product.findMany({
      where: { OR: [{ make: { not: null } }, { series: { isEmpty: false } }] },
      select: { make: true, model: true, vehicleFamily: true, series: true },
      take: 20000,
    }),
    prisma.vehicleAlias.findMany({ include: { vehicle: true }, take: 20000 }),
    prisma.vehicle.findMany({ take: 20000 }),
  ]);

  const makes = unique(products.map((p) => p.make).filter(Boolean) as string[]);
  const families = unique(
    products
      .filter((p) => p.make && (p.vehicleFamily || p.model))
      .filter((p) => {
        const family = p.vehicleFamily ?? p.model;
        if (!family || looksLikeProductTitle(family)) return false;
        return family.trim().split(/\s+/).length <= 3;
      })
      .map((p) => `${p.make}||${p.vehicleFamily ?? p.model}`),
  ).map((key) => {
    const [make, family] = key.split("||");
    return { make, family, aliases: [family.toLowerCase()] };
  });

  const series = [
    ...products.flatMap((p) => {
      const family = p.vehicleFamily ?? p.model ?? undefined;
      if (family && (looksLikeProductTitle(family) || family.trim().split(/\s+/).length > 3)) return [];
      return p.series.map((code) => ({ make: p.make ?? undefined, family, code }));
    }),
    ...vehicles.flatMap((v) => {
      const family = v.vehicleFamily ?? v.model ?? undefined;
      if (family && (looksLikeProductTitle(family) || family.trim().split(/\s+/).length > 3)) return [];
      if (looksLikeProductTitle(v.canonicalName)) return [];
      return v.series.map((code) => ({ make: v.make, family, code }));
    }),
  ];

  return {
    makes,
    families,
    series,
    aliases: aliases.map((a) => ({
      alias: a.alias,
      make: a.vehicle.make,
      family: a.vehicle.vehicleFamily ?? a.vehicle.model ?? undefined,
      series: a.vehicle.series,
    })),
  };
}

export async function upsertVehicleFromExtraction(extraction: VehicleExtraction) {
  const canonicalName = canonicalVehicleName(extraction);
  if (!canonicalName || looksLikeProductTitle(canonicalName)) return null;
  if (!extraction.make && extraction.series.length === 0) return null;

  const searchableText = vehicleSearchText({
    ...extraction,
    aliases: extraction.vehicleAliases,
  });

  const existing = await prisma.vehicle.findUnique({ where: { canonicalName } });
  const vehicle =
    existing ??
    (await prisma.vehicle.create({
      data: {
        make: extraction.make ?? "Unknown",
        model: extraction.model,
        vehicleFamily: extraction.vehicleFamily,
        series: extraction.series,
        bodyType: extraction.bodyType,
        yearFrom: extraction.yearFrom,
        yearTo: extraction.yearTo,
        engine: extraction.engine,
        engineCode: extraction.engineCode,
        variant: extraction.variant,
        driveType: extraction.driveType,
        application: extraction.application,
        canonicalName,
        searchableText,
      },
    }));

  for (const alias of extraction.vehicleAliases) {
    const aliasNormalized = normalizeKey(alias);
    if (!aliasNormalized) continue;
    await prisma.vehicleAlias.upsert({
      where: { aliasNormalized },
      update: { vehicleId: vehicle.id, alias },
      create: { vehicleId: vehicle.id, alias, aliasNormalized },
    });
  }
  return vehicle;
}

export async function linkCustomerVehicleFromExtraction(
  customerId: string,
  extraction: VehicleExtraction,
  confidence = extraction.confidence,
) {
  if (!isIdentifiedVehicle(extraction) || confidence < 0.5) return null;
  const vehicle = await upsertVehicleFromExtraction(extraction);
  if (!vehicle) return null;
  const existing = await prisma.customerVehicle.findUnique({
    where: { customerId_vehicleId: { customerId, vehicleId: vehicle.id } },
  });
  if (existing) {
    if (confidence > Number(existing.confidence)) {
      await prisma.customerVehicle.update({
        where: { id: existing.id },
        data: { confidence },
      });
    }
    return vehicle;
  }
  await prisma.customerVehicle.create({
    data: {
      customerId,
      vehicleId: vehicle.id,
      confidence,
      source: "order_extraction",
    },
  });
  return vehicle;
}

export async function backfillCustomerVehiclesFromOrders(
  onProgress?: (done: number, total: number, message?: string) => Promise<void>,
) {
  const total = await prisma.orderItem.count({ where: { extractionConfidence: { gte: 0.5 } } });
  await onProgress?.(0, Math.max(total, 1), `Linking vehicles from ${total.toLocaleString()} order lines`);
  const vehicleIds = new Map<string, string>();
  const links = new Map<string, { customerId: string; vehicleId: string; confidence: number }>();
  let done = 0;
  let cursor: string | undefined;

  for (;;) {
    const items = await prisma.orderItem.findMany({
      where: { extractionConfidence: { gte: 0.5 } },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        extractionConfidence: true,
        extractedVehicle: true,
        order: { select: { customerId: true } },
      },
    });
    if (!items.length) break;
    cursor = items[items.length - 1].id;

    for (const item of items) {
      const extraction = item.extractedVehicle as VehicleExtraction | null;
      if (!extraction || !isIdentifiedVehicle(extraction)) {
        done += 1;
        continue;
      }
      const canonicalName = canonicalVehicleName(extraction);
      if (!canonicalName || looksLikeProductTitle(canonicalName)) {
        done += 1;
        continue;
      }
      let vehicleId = vehicleIds.get(canonicalName);
      if (!vehicleId) {
        const vehicle = await upsertVehicleFromExtraction(extraction);
        if (!vehicle) {
          done += 1;
          continue;
        }
        vehicleId = vehicle.id;
        vehicleIds.set(canonicalName, vehicleId);
      }
      const confidence = Number(item.extractionConfidence ?? extraction.confidence ?? 0);
      const key = `${item.order.customerId}:${vehicleId}`;
      const existing = links.get(key);
      if (!existing || confidence > existing.confidence) {
        links.set(key, { customerId: item.order.customerId, vehicleId, confidence });
      }
      done += 1;
    }
    if (onProgress) {
      await onProgress(done, Math.max(total, 1), `Prepared ${done.toLocaleString()} / ${total.toLocaleString()} order lines`);
    }
  }

  const rows = [...links.values()];
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    await prisma.customerVehicle.createMany({
      data: chunk.map((row) => ({
        customerId: row.customerId,
        vehicleId: row.vehicleId,
        confidence: row.confidence,
        source: "order_extraction",
      })),
      skipDuplicates: true,
    });
    if (onProgress) {
      await onProgress(
        Math.min(index + chunk.length, rows.length),
        rows.length,
        `Saved ${Math.min(index + chunk.length, rows.length).toLocaleString()} customer vehicles`,
      );
    }
  }

  await prisma.$executeRaw`
    UPDATE "Customer" AS c
    SET "vehicleCount" = COALESCE(cv.count, 0)
    FROM (
      SELECT "customerId", COUNT(*)::int AS count
      FROM "CustomerVehicle"
      GROUP BY "customerId"
    ) AS cv
    WHERE c.id = cv."customerId"
  `;

  return { items: total, vehicles: vehicleIds.size, links: rows.length };
}

export async function extractCatalogueFitments(onProgress?: (done: number, total: number) => Promise<void>) {
  const learned = await loadLearnedKnowledge();
  const products = await prisma.product.findMany();
  const total = Math.max(products.length, 1);
  await onProgress?.(0, total);

  const vehiclesByName = new Map<
    string,
    {
      make: string;
      model: string | null;
      vehicleFamily: string | null;
      series: string[];
      bodyType: string | null;
      yearFrom: number | null;
      yearTo: number | null;
      engine: string | null;
      engineCode: string | null;
      variant: string | null;
      driveType: string | null;
      application: string | null;
      canonicalName: string;
      searchableText: string;
    }
  >();
  const productRows: Array<{
    id: string;
    data: {
      make: string | null;
      model: string | null;
      vehicleFamily: string | null;
      series: string[];
      bodyType: string | null;
      yearFrom: number | null;
      yearTo: number | null;
      searchableText: string;
    };
    canonicalName: string | null;
    confidence: number;
    matchLevel: "EXACT" | "SAME_FAMILY";
  }> = [];

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    const extraction = extractVehicle(
      {
        name: product.name,
        description: product.description,
        sku: product.sku,
        category: product.category,
        fitment: product.fitment,
        make: product.make,
        model: product.model,
        series: product.series.length ? product.series : [],
        bodyType: product.bodyType,
      },
      learned,
    );
    const productModel = product.model;
    const productFamily = product.vehicleFamily;
    const keepModel =
      typeof productModel === "string" &&
      !looksLikeProductTitle(productModel) &&
      productModel.trim().split(/\s+/).length <= 3;
    const keepFamily =
      typeof productFamily === "string" &&
      !looksLikeProductTitle(productFamily) &&
      productFamily.trim().split(/\s+/).length <= 3;
    const canonicalName = canonicalVehicleName(extraction);
    const usable =
      typeof canonicalName === "string" &&
      !looksLikeProductTitle(canonicalName) &&
      Boolean(extraction.make || extraction.series.length);

    if (usable && canonicalName && !vehiclesByName.has(canonicalName)) {
      vehiclesByName.set(canonicalName, {
        make: extraction.make ?? "Unknown",
        model: extraction.model,
        vehicleFamily: extraction.vehicleFamily,
        series: extraction.series,
        bodyType: extraction.bodyType,
        yearFrom: extraction.yearFrom,
        yearTo: extraction.yearTo,
        engine: extraction.engine,
        engineCode: extraction.engineCode,
        variant: extraction.variant,
        driveType: extraction.driveType,
        application: extraction.application,
        canonicalName,
        searchableText: vehicleSearchText({ ...extraction, aliases: extraction.vehicleAliases }),
      });
    }

    productRows.push({
      id: product.id,
      data: {
        make: product.make ?? extraction.make,
        model: keepModel ? product.model : extraction.model,
        vehicleFamily: keepFamily ? product.vehicleFamily : extraction.vehicleFamily,
        series: extraction.series.length ? extraction.series : product.series,
        bodyType: product.bodyType ?? extraction.bodyType,
        yearFrom: product.yearFrom ?? extraction.yearFrom,
        yearTo: product.yearTo ?? extraction.yearTo,
        searchableText: [product.searchableText, extraction.application, extraction.vehicleAliases.join(" ")]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      },
      canonicalName: usable ? canonicalName : null,
      confidence: extraction.confidence,
      matchLevel: extraction.series.length ? "EXACT" : "SAME_FAMILY",
    });

    if (onProgress && index % 200 === 0) await onProgress(index, total);
  }

  const vehicleList = [...vehiclesByName.values()];
  for (let index = 0; index < vehicleList.length; index += 200) {
    await prisma.vehicle.createMany({
      data: vehicleList.slice(index, index + 200),
      skipDuplicates: true,
    });
  }

  const savedVehicles = await prisma.vehicle.findMany({
    where: { canonicalName: { in: [...vehiclesByName.keys()] } },
    select: { id: true, canonicalName: true },
  });
  const vehicleIdByName = new Map(savedVehicles.map((row) => [row.canonicalName, row.id]));

  for (let index = 0; index < productRows.length; index += 50) {
    const chunk = productRows.slice(index, index + 50);
    await prisma.$transaction(chunk.map((row) => prisma.product.update({ where: { id: row.id }, data: row.data })));
    if (onProgress) await onProgress(Math.min(index + chunk.length, total), total);
  }

  const fitments = productRows.flatMap((row) => {
    if (!row.canonicalName || row.confidence < 0.5) return [];
    const vehicleId = vehicleIdByName.get(row.canonicalName);
    if (!vehicleId) return [];
    return [
      {
        productId: row.id,
        vehicleId,
        source: "extraction",
        confidence: row.confidence,
        matchLevel: row.matchLevel,
        isNegative: false,
      },
    ];
  });
  for (let index = 0; index < fitments.length; index += 200) {
    await prisma.productFitment.createMany({
      data: fitments.slice(index, index + 200),
      skipDuplicates: true,
    });
  }

  await pruneProductTitleVehicles();
}

export async function extractOrderVehicles(onProgress?: (done: number, total: number, message?: string) => Promise<void>) {
  const learned = await loadLearnedKnowledge();
  const total = await prisma.orderItem.count();
  await onProgress?.(0, Math.max(total, 1), `Re-reading vehicles from ${total.toLocaleString()} order lines`);
  let done = 0;
  let cursor: string | undefined;

  for (;;) {
    const items = await prisma.orderItem.findMany({
      take: 200,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      include: { product: true },
    });
    if (!items.length) break;
    cursor = items[items.length - 1].id;

    for (const item of items) {
      const extraction = extractVehicle(
        {
          name: item.productName,
          sku: item.sku,
          category: item.category,
          make: item.product?.make,
          model: item.product?.model,
          series: item.product?.series,
          fitment: item.product?.fitment,
          bodyType: item.product?.bodyType,
        },
        learned,
      );
      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          extractedVehicle: extraction as object,
          extractionConfidence: extraction.confidence,
        },
      });
      done += 1;
    }
    await onProgress?.(done, Math.max(total, 1), `Re-read ${done.toLocaleString()} / ${total.toLocaleString()} order lines`);
  }

  const links = await backfillCustomerVehiclesFromOrders(onProgress);
  await pruneProductTitleVehicles();
  return links;
}

export async function pruneProductTitleVehicles() {
  const vehicles = await prisma.vehicle.findMany({ select: { id: true, canonicalName: true } });
  const badIds = vehicles.filter((vehicle) => looksLikeProductTitle(vehicle.canonicalName)).map((vehicle) => vehicle.id);
  if (!badIds.length) return { deleted: 0 };

  await prisma.recommendation.deleteMany({ where: { vehicleId: { in: badIds } } });
  await prisma.customerVehicle.deleteMany({ where: { vehicleId: { in: badIds } } });
  await prisma.productFitment.deleteMany({ where: { vehicleId: { in: badIds } } });
  await prisma.customer.updateMany({
    where: { mainVehicleId: { in: badIds } },
    data: { mainVehicleId: null },
  });
  await prisma.vehicle.deleteMany({ where: { id: { in: badIds } } });
  return { deleted: badIds.length };
}

export async function pruneOrphanVehicles() {
  const orphans = await prisma.vehicle.findMany({
    where: { fitments: { none: {} }, customerVehicles: { none: {} } },
    select: { id: true },
  });
  const ids = orphans.map((vehicle) => vehicle.id);
  if (!ids.length) return { deleted: 0 };
  await prisma.recommendation.deleteMany({ where: { vehicleId: { in: ids } } });
  await prisma.customer.updateMany({
    where: { mainVehicleId: { in: ids } },
    data: { mainVehicleId: null },
  });
  await prisma.vehicle.deleteMany({ where: { id: { in: ids } } });
  return { deleted: ids.length };
}

export async function refreshCustomerStats() {
  const customers = await prisma.customer.findMany({
    include: {
      orders: { include: { items: true } },
      vehicles: { include: { vehicle: true } },
    },
  });
  for (const customer of customers) {
    const totals = customer.orders.reduce((sum, order) => sum + Number(order.orderTotal ?? 0), 0);
    const dates = customer.orders.map((o) => o.orderDate).filter(Boolean) as Date[];
    const productCount = customer.orders.reduce((sum, o) => sum + o.items.length, 0);
    const primary = customer.vehicles.sort((a, b) => Number(b.confidence) - Number(a.confidence))[0];
    const categories = customer.orders.flatMap((o) => o.items.map((i) => i.category).filter(Boolean)) as string[];
    const mainCategory = categories.sort(
      (a, b) => categories.filter((c) => c === b).length - categories.filter((c) => c === a).length,
    )[0];
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        totalOrders: customer.orders.length,
        totalSpend: totals,
        averageOrderValue: customer.orders.length ? totals / customer.orders.length : 0,
        firstPurchaseAt: dates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
        lastPurchaseAt: dates.sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
        productCount,
        vehicleCount: customer.vehicles.length,
        mainVehicleId: primary?.vehicleId,
        mainCategory: mainCategory ?? null,
      },
    });
    if (primary) {
      await prisma.customerVehicle.update({
        where: { id: primary.id },
        data: { isPrimary: true },
      });
    }
  }
}
