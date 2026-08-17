import { prisma } from "@/lib/db";
import { extractVehicle } from "@/lib/vehicle/extract";
import { upsertVehicleFromExtraction, pruneProductTitleVehicles, pruneOrphanVehicles } from "@/lib/vehicle/persist";
import { looksLikeProductTitle } from "@/lib/vehicle/dictionary";
import { normalizeKey, normalizeWhitespace, parseNumber } from "@/lib/utils";
import { productPageUrl } from "@/lib/catalogue/product-url";
import type { StockStatus } from "@prisma/client";

type NetoResponse<T> = {
  Ack?: string;
  CurrentRecords?: number | string;
  TotalRecords?: number | string;
  Item?: T[] | T;
  Order?: T[] | T;
  Messages?: unknown;
};

export type NetoItem = {
  SKU?: string;
  ID?: string;
  Name?: string;
  Description?: string;
  ShortDescription?: string;
  Brand?: string;
  Model?: string;
  DefaultPrice?: string | number;
  PromotionPrice?: string | number;
  Approved?: string | boolean;
  IsActive?: string | boolean;
  Visible?: string | boolean;
  URL?: string;
  ItemURL?: string;
  ProductURL?: string;
  ImageURL?: string;
  Images?: unknown;
  AvailableSellQty?: string | number;
  WarehouseQuantity?: unknown;
  Categories?: unknown;
  ParentSKU?: string;
};

const PRODUCT_SELECTORS = [
  "SKU",
  "ID",
  "Name",
  "Description",
  "Brand",
  "Model",
  "DefaultPrice",
  "Approved",
  "IsActive",
  "Visible",
  "URL",
  "ItemURL",
  "Images",
  "AvailableSellQty",
  "WarehouseQuantity",
  "Categories",
  "ParentSKU",
];

function isTrue(value: unknown): boolean {
  return value === true || value === "True" || value === "true" || value === 1 || value === "1";
}

export function asItems<T>(value: T[] | T | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstImage(item: NetoItem): string | null {
  if (typeof item.ImageURL === "string" && item.ImageURL.trim()) return item.ImageURL.trim();
  const images = item.Images as
    | Array<{ URL?: string; ThumbURL?: string }>
    | { Image?: Array<{ URL?: string }> | { URL?: string } }
    | undefined;
  if (Array.isArray(images)) {
    return images[0]?.URL || images[0]?.ThumbURL || null;
  }
  if (images && typeof images === "object") {
    const nested = asItems((images as { Image?: Array<{ URL?: string }> | { URL?: string } }).Image);
    return nested[0]?.URL || null;
  }
  return null;
}

function categoryName(item: NetoItem): string | null {
  const categories = item.Categories as
    | Array<{ CategoryName?: string; Name?: string }>
    | { Category?: Array<{ CategoryName?: string }> | { CategoryName?: string } }
    | undefined;
  if (Array.isArray(categories)) {
    return categories[0]?.CategoryName || categories[0]?.Name || null;
  }
  if (categories && typeof categories === "object") {
    const nested = asItems((categories as { Category?: Array<{ CategoryName?: string }> | { CategoryName?: string } }).Category);
    return nested[0]?.CategoryName || null;
  }
  return null;
}

function stockQty(item: NetoItem): number {
  const available = parseNumber(item.AvailableSellQty);
  if (available !== null) return available;
  const warehouses = asItems(item.WarehouseQuantity as Array<{ Quantity?: string | number }> | { Quantity?: string | number } | undefined);
  return warehouses.reduce((sum, row) => sum + (parseNumber(row?.Quantity) ?? 0), 0);
}

function productUrl(item: NetoItem): string | null {
  return productPageUrl(item);
}

function stockStatus(item: NetoItem): StockStatus {
  if (!isTrue(item.IsActive) || !isTrue(item.Approved)) return "DISCONTINUED";
  const qty = stockQty(item);
  if (qty > 0) return "IN_STOCK";
  if (qty === 0) return "OUT_OF_STOCK";
  return "UNKNOWN";
}

export async function netoRequest<T>(action: string, body: object): Promise<NetoResponse<T>> {
  const url = process.env.NETO_API_URL || "https://www.aveska.com.au/do/WS/NetoAPI";
  const key = process.env.NETO_API_KEY?.trim();
  if (!key) throw new Error("NETO_API_KEY is not set in .env");

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    NETOAPI_ACTION: action,
    NETOAPI_KEY: key,
  };
  if (process.env.NETO_API_USERNAME?.trim()) {
    headers.NETOAPI_USERNAME = process.env.NETO_API_USERNAME.trim();
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: NetoResponse<T> & { Error?: unknown };
  try {
    json = JSON.parse(text) as NetoResponse<T>;
  } catch {
    throw new Error(`Neto returned non-JSON (${response.status})`);
  }
  if (!response.ok || json.Ack === "Error") {
    const message = JSON.stringify(json.Messages ?? json.Error ?? json.Ack ?? response.status);
    throw new Error(`Neto ${action} failed: ${message}`);
  }
  return json;
}

export async function fetchNetoProductPage(page: number, pageSize = 100) {
  const result = await netoRequest<NetoItem>("GetItem", {
    Filter: {
      IsNetoUtility: false,
      Limit: pageSize,
      Page: page,
      OutputSelector: PRODUCT_SELECTORS,
    },
  });
  return {
    items: asItems(result.Item),
    totalRecords: Number(result.TotalRecords ?? 0),
  };
}

export async function syncNetoCatalogue(onProgress?: (done: number, total: number, message?: string) => Promise<void>) {
  const pageSize = 100;
  let page = 0;
  let imported = 0;
  let created = 0;
  let updated = 0;
  let total = 0;

  for (;;) {
    const { items, totalRecords } = await fetchNetoProductPage(page, pageSize);
    if (totalRecords > total) total = totalRecords;
    if (!items.length) break;

    for (const item of items) {
      const sku = item.SKU?.trim();
      const name = normalizeWhitespace(item.Name ?? sku ?? "");
      if (!sku || !name) continue;
      const skuNormalized = normalizeKey(sku);
      const category = categoryName(item);
      const qty = stockQty(item);
      const url = productUrl(item);
      const description = item.Description ? String(item.Description) : null;
      const searchableText = [name, sku, item.Brand, item.Model, description, category].filter(Boolean).join(" ").toLowerCase();
      const data = {
        sku,
        skuNormalized,
        externalId: item.ID ? String(item.ID) : sku,
        name,
        nameRaw: item.Name ?? name,
        description,
        descriptionRaw: description,
        url,
        imageUrl: firstImage(item),
        category,
        brand: item.Brand ? String(item.Brand) : null,
        model: item.Model && String(item.Model).split(" ").length <= 3 ? String(item.Model) : null,
        vehicleFamily: null,
        fitment: item.Model ? String(item.Model) : null,
        price: parseNumber(item.DefaultPrice) ?? parseNumber(item.PromotionPrice),
        stock: qty,
        stockStatus: stockStatus(item),
        searchableText,
        originalData: item as object,
      };

      const existing = await prisma.product.findFirst({ where: { skuNormalized } });
      const product = existing
        ? await prisma.product.update({ where: { id: existing.id }, data })
        : await prisma.product.create({ data });
      if (existing) updated += 1;
      else created += 1;

      const extraction = extractVehicle({
        name: product.name,
        description: product.description,
        sku: product.sku,
        category: product.category,
        fitment: product.fitment,
        make: product.make,
        model: product.model,
        series: product.series,
        bodyType: product.bodyType,
      });
      if (extraction.make || extraction.vehicleFamily || extraction.series.length) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            make: extraction.make ?? product.make,
            model: looksLikeProductTitle(product.model) ? extraction.model : product.model ?? extraction.model,
            vehicleFamily: looksLikeProductTitle(product.vehicleFamily)
              ? extraction.vehicleFamily
              : product.vehicleFamily ?? extraction.vehicleFamily,
            series: product.series.length ? product.series : extraction.series,
            bodyType: product.bodyType ?? extraction.bodyType,
            yearFrom: product.yearFrom ?? extraction.yearFrom,
            yearTo: product.yearTo ?? extraction.yearTo,
          },
        });
      }
      const vehicle = await upsertVehicleFromExtraction(extraction);
      if (vehicle && extraction.confidence >= 0.5) {
        await prisma.productFitment.upsert({
          where: {
            productId_vehicleId_isNegative: { productId: product.id, vehicleId: vehicle.id, isNegative: false },
          },
          update: { confidence: extraction.confidence, source: "neto" },
          create: {
            productId: product.id,
            vehicleId: vehicle.id,
            source: "neto",
            confidence: extraction.confidence,
            matchLevel: extraction.series.length ? "EXACT" : "SAME_FAMILY",
          },
        });
      }

      imported += 1;
    }

    if (onProgress) {
      await onProgress(imported, total || imported, `Imported ${imported.toLocaleString()} live products`);
    }
    if (items.length < pageSize) break;
    page += 1;
    if (page > 500) break;
  }

  await pruneProductTitleVehicles();
  await pruneOrphanVehicles();

  return { imported, created, updated, pages: page + 1 };
}

export async function syncNetoProductUrls(onProgress?: (done: number, total: number, message?: string) => Promise<void>) {
  const pageSize = 100;
  let page = 0;
  let updated = 0;
  let scanned = 0;
  let total = 0;

  for (;;) {
    const result = await netoRequest<NetoItem>("GetItem", {
      Filter: {
        IsNetoUtility: false,
        Limit: pageSize,
        Page: page,
        OutputSelector: ["SKU", "ItemURL", "URL", "ProductURL"],
      },
    });
    const items = asItems(result.Item);
    const totalRecords = Number(result.TotalRecords ?? 0);
    if (totalRecords > total) total = totalRecords;
    if (!items.length) break;

    for (const item of items) {
      const sku = item.SKU?.trim();
      if (!sku) continue;
      scanned += 1;
      const url = productPageUrl(item);
      if (!url) continue;
      const skuNormalized = normalizeKey(sku);
      const resultUpdate = await prisma.product.updateMany({
        where: { skuNormalized },
        data: { url },
      });
      updated += resultUpdate.count;
    }

    if (onProgress) {
      await onProgress(scanned, total || scanned, `Updated ${updated.toLocaleString()} product URLs`);
    }
    if (items.length < pageSize) break;
    page += 1;
    if (page > 500) break;
  }

  return { scanned, updated, pages: page + 1 };
}
