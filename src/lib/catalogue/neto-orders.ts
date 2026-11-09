import { prisma } from "@/lib/db";
import { toCents } from "@/lib/money";
import { asItems, netoRequest } from "@/lib/catalogue/neto";
import { asStringArray } from "@/lib/json-array";
import { extractVehicle } from "@/lib/vehicle/extract";
import { backfillCustomerVehiclesFromOrders } from "@/lib/vehicle/persist";
import {
  firstNameFrom,
  normalizeEmail,
  normalizeKey,
  normalizeWhitespace,
  parseInteger,
  parseNumber,
  parseNetoDateTime,
  toNetoUtcStamp,
  zonedDayRange,
} from "@/lib/utils";

export type NetoOrderLine = {
  OrderLineID?: string;
  SKU?: string;
  ProductName?: string;
  Quantity?: string | number;
  UnitPrice?: string | number;
};

export type NetoOrder = {
  OrderID?: string;
  Username?: string;
  Email?: string;
  OrderStatus?: string;
  DatePlaced?: string;
  DatePaid?: string;
  DateUpdated?: string;
  GrandTotal?: string | number;
  ShippingTotal?: string | number;
  ShippingMethod?: string;
  BillFirstName?: string;
  BillLastName?: string;
  BillCompany?: string;
  BillPhone?: string;
  ShipFirstName?: string;
  ShipLastName?: string;
  ShipPhone?: string;
  OrderLine?: NetoOrderLine[] | NetoOrderLine;
};

const ORDER_SELECTORS = [
  "OrderID",
  "Username",
  "Email",
  "OrderStatus",
  "DatePlaced",
  "DatePaid",
  "DateUpdated",
  "GrandTotal",
  "ShippingTotal",
  "ShippingMethod",
  "BillAddress",
  "ShipAddress",
  "BillFirstName",
  "BillLastName",
  "BillCompany",
  "BillPhone",
  "ShipFirstName",
  "ShipLastName",
  "ShipPhone",
  "OrderLine",
  "OrderLine.ProductName",
  "OrderLine.Quantity",
  "OrderLine.UnitPrice",
  "OrderLine.SKU",
];

const LIVE_STATUSES = [
  "New",
  "New Backorder",
  "Backorder Approved",
  "Pick",
  "Pack",
  "Pending Pickup",
  "Pending Dispatch",
  "Dispatched",
  "On Hold",
];

export function isLiveOrderStatus(status: string | null | undefined) {
  const value = status?.trim();
  if (!value) return true;
  return LIVE_STATUSES.some((item) => item.toLowerCase() === value.toLowerCase());
}

export type NetoOrderSyncOptions = {
  from?: string | null;
  to?: string | null;
  startPage?: number;
  maxPages?: number;
  timeBudgetMs?: number;
  importedSoFar?: number;
  skipBackfill?: boolean;
  onPage?: (info: { nextPage: number; imported: number }) => Promise<void>;
};

export type NetoOrderApiFilter = {
  OrderStatus?: string[];
  DatePlacedFrom?: string;
  DatePlacedTo?: string;
  DateUpdatedFrom?: string;
  DateUpdatedTo?: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseOrderSyncRange(input: { from?: string | null; to?: string | null }) {
  const from = input.from?.trim() && ISO_DATE.test(input.from.trim()) ? input.from.trim() : null;
  const to = input.to?.trim() && ISO_DATE.test(input.to.trim()) ? input.to.trim() : null;
  if (!from && !to) return null;
  const start = from ?? to!;
  const end = to ?? from!;
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

export function netoOrderDateFilters(range: { from: string; to: string }) {
  const fromStamp = toNetoUtcStamp(zonedDayRange(range.from).start);
  const toStamp = toNetoUtcStamp(new Date(zonedDayRange(range.to).end.getTime() - 1000));
  return {
    placed: { DatePlacedFrom: fromStamp, DatePlacedTo: toStamp },
    updated: { DateUpdatedFrom: fromStamp, DateUpdatedTo: toStamp },
  };
}

function parseNetoDate(value?: string | null): Date | null {
  return parseNetoDateTime(value);
}

function customerName(order: NetoOrder): string {
  const parts = [order.BillFirstName, order.BillLastName].map((part) => normalizeWhitespace(part ?? "")).filter(Boolean);
  if (parts.length) return parts.join(" ");
  const ship = [order.ShipFirstName, order.ShipLastName].map((part) => normalizeWhitespace(part ?? "")).filter(Boolean);
  if (ship.length) return ship.join(" ");
  if (order.BillCompany?.trim()) return normalizeWhitespace(order.BillCompany);
  if (order.Email?.includes("@")) return order.Email.split("@")[0];
  return order.Username?.trim() || `Neto customer ${order.OrderID ?? ""}`.trim();
}

function isNonProductLine(sku?: string | null, name?: string | null): boolean {
  if (!sku && !name) return true;
  const text = `${sku ?? ""} ${name ?? ""}`.toLowerCase();
  return /\b(shipping|freight|postage|surcharge|handling)\b/.test(text);
}

export async function fetchNetoOrderPage(page: number, pageSize = 100, filter: NetoOrderApiFilter = { OrderStatus: LIVE_STATUSES }) {
  const result = await netoRequest<NetoOrder>("GetOrder", {
    Filter: {
      ...filter,
      Limit: pageSize,
      Page: page,
      OutputSelector: ORDER_SELECTORS,
    },
  });
  return {
    orders: asItems(result.Order),
    totalRecords: Number(result.TotalRecords ?? 0),
  };
}

export async function syncNetoOrders(
  onProgress?: (done: number, total: number, message?: string) => Promise<void>,
  options?: NetoOrderSyncOptions,
) {
  const pageSize = Number(process.env.NETO_ORDER_PAGE_SIZE ?? 100) || 100;
  const range = parseOrderSyncRange(options ?? {});
  const dateFilters = range ? netoOrderDateFilters(range) : null;
  const deadline = options?.timeBudgetMs ? Date.now() + options.timeBudgetMs : Number.POSITIVE_INFINITY;
  const maxPages = options?.maxPages ?? Number.POSITIVE_INFINITY;
  // Date-placed pass covers the history window; skip the slower "updated" pass unless opted in.
  const includeUpdated = process.env.NETO_ORDERS_INCLUDE_UPDATED !== "0";
  const passes: Array<{ filter: NetoOrderApiFilter; label: string }> = dateFilters && range
    ? [
        { filter: { ...dateFilters.placed, OrderStatus: LIVE_STATUSES }, label: `placed ${range.from} to ${range.to}` },
        ...(includeUpdated
          ? [{ filter: dateFilters.updated, label: `updated ${range.from} to ${range.to}` }]
          : []),
      ]
    : [{ filter: { OrderStatus: LIVE_STATUSES }, label: "live Neto orders" }];
  type ProductHit = {
    id: string;
    skuNormalized: string | null;
    make: string | null;
    series: unknown;
    vehicleFamily: string | null;
    bodyType: string | null;
    fitment: string | null;
  };
  type CustomerHit = { id: string; emailNormalized: string | null; name: string; externalId: string | null };
  const productBySku = new Map<string, ProductHit>();
  const customerByEmail = new Map<string, CustomerHit>();
  const customerByUsername = new Map<string, CustomerHit>();
  const orderByExternalId = new Map<string, string>();

  let pages = 0;
  let imported = options?.importedSoFar ?? 0;
  let created = 0;
  let updated = 0;
  let lines = 0;
  let done = false;
  let nextPage = options?.startPage ?? 0;
  const seen = new Set<string>();

  // Chunked runs use a single placed-date pass starting at startPage.
  const activePasses =
    options?.startPage != null || options?.timeBudgetMs != null || options?.maxPages != null
      ? [passes[0]]
      : passes;

  for (const pass of activePasses) {
    let page = options?.startPage ?? 0;
    let pagesRun = 0;
    for (;;) {
      if (pagesRun >= maxPages || Date.now() >= deadline) break;
      const { orders } = await fetchNetoOrderPage(page, pageSize, pass.filter);
    if (!orders.length) {
      done = true;
      break;
    }

    const pageSkus = [
      ...new Set(
        orders.flatMap((order) =>
          asItems(order.OrderLine)
            .map((line) => (line.SKU?.trim() ? normalizeKey(line.SKU.trim()) : ""))
            .filter((sku) => sku && !productBySku.has(sku)),
        ),
      ),
    ];
    if (pageSkus.length) {
      const products = await prisma.product.findMany({
        where: { skuNormalized: { in: pageSkus } },
        select: { id: true, skuNormalized: true, make: true, series: true, vehicleFamily: true, bodyType: true, fitment: true },
      });
      for (const product of products) {
        if (product.skuNormalized) productBySku.set(product.skuNormalized, product);
      }
    }
    const pageEmails = [...new Set(orders.map((order) => normalizeEmail(order.Email)).filter((email): email is string => Boolean(email && !customerByEmail.has(email))))];
    if (pageEmails.length) {
      const customers = await prisma.customer.findMany({
        where: { emailNormalized: { in: pageEmails } },
        select: { id: true, emailNormalized: true, name: true, externalId: true },
      });
      for (const customer of customers) {
        if (customer.emailNormalized) customerByEmail.set(customer.emailNormalized, customer);
        if (customer.externalId) customerByUsername.set(customer.externalId, customer);
      }
    }
    const pageUsers = [...new Set(orders.map((order) => order.Username?.trim() || "").filter((name) => name && !customerByUsername.has(name)))];
    if (pageUsers.length) {
      const customers = await prisma.customer.findMany({
        where: { externalId: { in: pageUsers } },
        select: { id: true, emailNormalized: true, name: true, externalId: true },
      });
      for (const customer of customers) {
        if (customer.externalId) customerByUsername.set(customer.externalId, customer);
        if (customer.emailNormalized && !customerByEmail.has(customer.emailNormalized)) customerByEmail.set(customer.emailNormalized, customer);
      }
    }
    const pageOrderIds = orders.map((order) => order.OrderID?.trim() || "").filter((id) => id && !orderByExternalId.has(id));
    if (pageOrderIds.length) {
      const existingOrders = await prisma.order.findMany({
        where: { externalId: { in: pageOrderIds } },
        select: { id: true, externalId: true },
      });
      for (const order of existingOrders) {
        if (order.externalId) orderByExternalId.set(order.externalId, order.id);
      }
    }

    for (const netoOrder of orders) {
      const orderId = netoOrder.OrderID?.trim();
      if (!orderId || seen.has(orderId)) continue;
      seen.add(orderId);
      const email = normalizeEmail(netoOrder.Email);
      const username = netoOrder.Username?.trim() || null;
      const name = customerName(netoOrder);
      let customer = email ? customerByEmail.get(email) : username ? customerByUsername.get(username) : undefined;
      if (!customer) {
        const createdCustomer = await prisma.customer.create({
          data: {
            externalId: netoOrder.Username ?? orderId,
            name,
            email: netoOrder.Email?.trim() || null,
            emailNormalized: email,
            phone: netoOrder.ShipPhone ?? netoOrder.BillPhone ?? null,
            firstName: firstNameFrom(name),
            lastName: name.split(" ").slice(1).join(" ") || null,
            originalData: { username: netoOrder.Username, orderId } as object,
          },
        });
        customer = { id: createdCustomer.id, emailNormalized: email, name, externalId: createdCustomer.externalId };
        if (email) customerByEmail.set(email, customer);
        if (username) customerByUsername.set(username, customer);
      } else if (customer.name === "Unknown customer" || customer.name.startsWith("Neto customer")) {
        await prisma.customer.update({
          where: { id: customer.id },
          data: {
            name,
            phone: netoOrder.ShipPhone ?? netoOrder.BillPhone ?? undefined,
            firstName: firstNameFrom(name),
          },
        });
      }

      const existingId = orderByExternalId.get(orderId);
      if (!isLiveOrderStatus(netoOrder.OrderStatus)) {
        if (existingId) {
          await prisma.order.delete({ where: { id: existingId } });
          orderByExternalId.delete(orderId);
          updated += 1;
        }
        continue;
      }
      const orderLines = asItems(netoOrder.OrderLine).filter((line) => !isNonProductLine(line.SKU, line.ProductName));
      const orderData = {
        externalId: orderId,
        customerId: customer.id,
        orderDate: parseNetoDate(netoOrder.DatePlaced) ?? parseNetoDate(netoOrder.DatePaid),
        orderTotal: toCents(netoOrder.GrandTotal) ?? undefined,
        sourceRowHash: `neto:${orderId}`,
        originalData: {
          OrderID: orderId,
          OrderStatus: netoOrder.OrderStatus,
          Username: netoOrder.Username,
          DatePaid: netoOrder.DatePaid,
          DatePlaced: netoOrder.DatePlaced,
          DateUpdated: netoOrder.DateUpdated,
          GrandTotal: netoOrder.GrandTotal,
          ShippingTotal: netoOrder.ShippingTotal,
          ShippingMethod: netoOrder.ShippingMethod,
        } as object,
      };

      const itemsData = orderLines.map((line) => {
        const sku = line.SKU?.trim() || null;
        const productName = normalizeWhitespace(line.ProductName ?? sku ?? "Unknown product");
        const product = sku ? productBySku.get(normalizeKey(sku)) : undefined;
        const quantity = parseInteger(line.Quantity) ?? 1;
        const unitPrice = toCents(line.UnitPrice);
        const extraction = extractVehicle({
          name: productName,
          sku,
          make: product?.make,
          series: asStringArray(product?.series),
          fitment: product?.fitment,
          bodyType: product?.bodyType,
        });
        return {
          productId: product?.id ?? null,
          sku,
          productName,
          productNameRaw: line.ProductName ?? productName,
          quantity,
          unitPrice,
          lineTotal: unitPrice != null ? unitPrice * quantity : undefined,
          extractedVehicle: extraction as object,
          extractionConfidence: extraction.confidence,
        };
      });

      if (existingId) {
        await prisma.orderItem.deleteMany({ where: { orderId: existingId } });
        await prisma.order.update({
          where: { id: existingId },
          data: {
            ...orderData,
            items: { create: itemsData },
          },
        });
        updated += 1;
      } else {
        const createdOrder = await prisma.order.create({
          data: {
            ...orderData,
            items: { create: itemsData },
          },
        });
        orderByExternalId.set(orderId, createdOrder.id);
        created += 1;
      }
      imported += 1;
      lines += itemsData.length;
    }

    pagesRun += 1;
    nextPage = page + 1;
    if (onProgress) {
      await onProgress(
        imported,
        Math.max(imported, (page + 1) * pageSize),
        `Imported ${imported.toLocaleString()} orders (${pass.label})`,
      );
    }
    await options?.onPage?.({ nextPage, imported });
    page += 1;
    if (page > 2000) {
      done = true;
      break;
    }
    if (Date.now() >= deadline) break;
    }
    pages += pagesRun;
  }

  if (!options?.timeBudgetMs && !options?.maxPages && options?.startPage == null) {
    done = true;
  }

  let links: Record<string, unknown> = {};
  if (done && !options?.skipBackfill) {
    if (onProgress) {
      await onProgress(imported, imported, "Linking customers to extracted vehicles");
    }
    links = await backfillCustomerVehiclesFromOrders(onProgress);
  }
  return {
    imported,
    created,
    updated,
    lines,
    pages,
    nextPage,
    done,
    from: range?.from ?? null,
    to: range?.to ?? null,
    ...links,
  };
}

export async function repairNetoOrderDates() {
  const orders = await prisma.order.findMany({
    where: { sourceRowHash: { startsWith: "neto:" } },
    select: { id: true, originalData: true },
  });
  let updated = 0;
  for (const order of orders) {
    const data = order.originalData as { DatePlaced?: string } | null;
    const raw = data?.DatePlaced?.trim();
    if (!raw) continue;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) continue;
    await prisma.order.update({ where: { id: order.id }, data: { orderDate: date } });
    updated += 1;
  }
  return { updated };
}

export async function refreshNetoOrderPlacedDates(from = "2026-08-01") {
  let page = 0;
  let updated = 0;
  let scanned = 0;
  for (;;) {
    const result = await netoRequest<NetoOrder>("GetOrder", {
      Filter: {
        DatePlacedFrom: toNetoUtcStamp(zonedDayRange(from).start),
        Limit: 100,
        Page: page,
        OutputSelector: ["OrderID", "OrderStatus", "DatePlaced", "DatePaid"],
      },
    });
    const orders = asItems(result.Order);
    if (!orders.length) break;
    for (const netoOrder of orders) {
      const orderId = netoOrder.OrderID?.trim();
      const placed = parseNetoDateTime(netoOrder.DatePlaced) ?? parseNetoDateTime(netoOrder.DatePaid);
      if (!orderId || !placed) continue;
      scanned += 1;
      const existing = await prisma.order.findFirst({
        where: { externalId: orderId },
        select: { id: true, originalData: true },
      });
      if (!existing) continue;
      const previous = (existing.originalData ?? {}) as Record<string, unknown>;
      await prisma.order.update({
        where: { id: existing.id },
        data: {
          orderDate: placed,
          originalData: {
            ...previous,
            OrderID: orderId,
            OrderStatus: netoOrder.OrderStatus ?? previous.OrderStatus,
            DatePlaced: netoOrder.DatePlaced,
            DatePaid: netoOrder.DatePaid,
          } as object,
        },
      });
      updated += 1;
    }
    if (orders.length < 100) break;
    page += 1;
    if (page > 50) break;
  }
  return { scanned, updated, pages: page + 1 };
}
