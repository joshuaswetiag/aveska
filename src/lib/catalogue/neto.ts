import { prisma } from "@/lib/db";
import { toCents } from "@/lib/money";
import { asStringArray } from "@/lib/json-array";
import { extractVehicle } from "@/lib/vehicle/extract";
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

export type CatalogueSyncOptions = {
  extractVehicles?: boolean;
  startPage?: number;
  maxPages?: number;
  timeBudgetMs?: number;
  importedSoFar?: number;
  pageSize?: number;
  /** Called after each Neto page is saved, so a killed Worker can resume. */
  onPage?: (info: { nextPage: number; imported: number; total: number }) => Promise<void>;
};

export async function syncNetoCatalogue(
  onProgress?: (done: number, total: number, message?: string) => Promise<void>,
  options?: CatalogueSyncOptions,
) {
  const extractVehicles = options?.extractVehicles !== false;
  // Neto often returns TotalRecords=0; only an empty page means the catalogue is finished.
  // Keep pages modest so a Worker can finish and checkpoint before it is cancelled.
  const pageSize = options?.pageSize || Number(process.env.NETO_PRODUCT_PAGE_SIZE ?? 80) || 80;
  const maxPages = options?.maxPages ?? Number.POSITIVE_INFINITY;
  const deadline = options?.timeBudgetMs ? Date.now() + options.timeBudgetMs : Number.POSITIVE_INFINITY;
  let page = options?.startPage ?? 0;
  let imported = options?.importedSoFar ?? 0;
  let created = 0;
  let updated = 0;
  let total = 0;
  let pagesRun = 0;
  let done = false;

  while (pagesRun < maxPages && Date.now() < deadline) {
    const { items, totalRecords } = await fetchNetoProductPage(page, pageSize);
    // Neto frequently omits TotalRecords (0). Keep a rising estimate for progress UI.
    if (totalRecords > total) total = totalRecords;
    if (!total) total = Math.max(imported + items.length, page * pageSize + items.length);
    if (!items.length) {
      done = true;
      break;
    }

    const skuKeys = items
      .map((item) => (item.SKU?.trim() ? normalizeKey(item.SKU.trim()) : ""))
      .filter(Boolean);
    const existingRows = skuKeys.length
      ? await prisma.product.findMany({
          where: { skuNormalized: { in: skuKeys } },
          select: {
            id: true,
            skuNormalized: true,
            make: true,
            model: true,
            vehicleFamily: true,
            series: true,
            bodyType: true,
            yearFrom: true,
            yearTo: true,
          },
        })
      : [];
    const bySku = new Map(
      existingRows.filter((row) => row.skuNormalized).map((row) => [row.skuNormalized as string, row]),
    );

    for (const item of items) {
      const sku = item.SKU?.trim();
      const name = normalizeWhitespace(item.Name ?? sku ?? "");
      if (!sku || !name) continue;
      const skuNormalized = normalizeKey(sku);
      if (!skuNormalized) continue;
      const category = categoryName(item);
      const qty = stockQty(item);
      const url = productUrl(item);
      const description = item.Description ? String(item.Description).slice(0, 1500) : null;
      const brand = item.Brand ? String(item.Brand) : null;
      const modelHint = item.Model && String(item.Model).split(" ").length <= 3 ? String(item.Model) : null;
      const fitment = item.Model ? String(item.Model) : null;
      const searchableText = [name, sku, item.Brand, item.Model, category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .slice(0, 500);

      const existing = bySku.get(skuNormalized);
      const existingSeries = asStringArray(existing?.series);
      const extraction = extractVehicle({
        name,
        description,
        sku,
        category,
        fitment,
        make: existing?.make,
        model: modelHint ?? existing?.model,
        series: existingSeries,
        bodyType: existing?.bodyType,
      });
      const keepModel =
        typeof existing?.model === "string" &&
        !looksLikeProductTitle(existing.model) &&
        existing.model.trim().split(/\s+/).length <= 3;
      const keepFamily =
        typeof existing?.vehicleFamily === "string" &&
        !looksLikeProductTitle(existing.vehicleFamily) &&
        existing.vehicleFamily.trim().split(/\s+/).length <= 3;

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
        brand,
        model: keepModel ? existing!.model : modelHint ?? extraction.model,
        vehicleFamily: keepFamily ? existing!.vehicleFamily : extraction.vehicleFamily,
        fitment,
        make: existing?.make ?? extraction.make,
        series: existingSeries.length ? existingSeries : extraction.series,
        bodyType: existing?.bodyType ?? extraction.bodyType,
        yearFrom: existing?.yearFrom ?? extraction.yearFrom,
        yearTo: existing?.yearTo ?? extraction.yearTo,
        price: toCents(item.DefaultPrice) ?? toCents(item.PromotionPrice),
        stock: qty,
        stockStatus: stockStatus(item),
        searchableText,
      };

      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await prisma.product.create({ data });
        created += 1;
      }
      imported += 1;
    }

    pagesRun += 1;
    page += 1;
    const progressTotal = Math.max(total || imported, imported + pageSize, 12_000);
    if (onProgress) {
      await onProgress(imported, progressTotal, `Imported ${imported.toLocaleString()} live products`);
    }
    await options?.onPage?.({ nextPage: page, imported, total: progressTotal });
    // Only an empty page means we are finished. A short page is not the end.
    if (page > 500) {
      done = true;
      break;
    }
    if (Date.now() >= deadline) break;
  }

  if (done && extractVehicles) {
    if (onProgress) await onProgress(imported, total || imported, "Matching vehicles from products…");
    const { extractCatalogueFitments } = await import("@/lib/vehicle/persist");
    await extractCatalogueFitments(async (doneFit, fitTotal) => {
      await onProgress?.(
        imported,
        total || imported,
        `Matching vehicles ${doneFit.toLocaleString()} / ${fitTotal.toLocaleString()}`,
      );
    });
  }

  return {
    imported,
    created,
    updated,
    pages: pagesRun,
    nextPage: page,
    done,
    total: total || imported,
  };
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
      if (!skuNormalized) continue;
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
