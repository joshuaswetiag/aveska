import { prisma } from "@/lib/db";
import { asItems, netoRequest } from "@/lib/catalogue/neto";
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

export type NetoOrderSyncOptions = {
  from?: string | null;
  to?: string | null;
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

function netoApiDateTime(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function netoOrderDateFilters(range: { from: string; to: string }) {
  const start = zonedDayRange(range.from).start;
  const endInclusive = new Date(zonedDayRange(range.to).end.getTime() - 1000);
  const fromStamp = netoApiDateTime(start);
  const toStamp = netoApiDateTime(endInclusive);
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
  const pageSize = 100;
  const range = parseOrderSyncRange(options ?? {});
  const dateFilters = range ? netoOrderDateFilters(range) : null;
  const passes: Array<{ filter: NetoOrderApiFilter; label: string }> = dateFilters && range
    ? [
        { filter: dateFilters.placed, label: `placed ${range.from} to ${range.to}` },
        { filter: dateFilters.updated, label: `updated ${range.from} to ${range.to}` },
      ]
    : [{ filter: { OrderStatus: LIVE_STATUSES }, label: "live Neto orders" }];
  const products = await prisma.product.findMany({
    select: { id: true, skuNormalized: true, make: true, series: true, vehicleFamily: true, bodyType: true, fitment: true },
  });
  const productBySku = new Map(
    products.filter((product) => product.skuNormalized).map((product) => [product.skuNormalized as string, product]),
  );
  const customerByEmail = new Map(
    (await prisma.customer.findMany({ where: { emailNormalized: { not: null } }, select: { id: true, emailNormalized: true, name: true } })).map(
      (customer) => [customer.emailNormalized as string, customer],
    ),
  );
  const customerByUsername = new Map(
    (await prisma.customer.findMany({ where: { externalId: { not: null } }, select: { id: true, emailNormalized: true, name: true, externalId: true } })).map(
      (customer) => [customer.externalId as string, customer],
    ),
  );
  const orderByExternalId = new Map(
    (await prisma.order.findMany({ where: { externalId: { not: null } }, select: { id: true, externalId: true } })).map((order) => [
      order.externalId as string,
      order.id,
    ]),
  );

  let pages = 0;
  let imported = 0;
  let created = 0;
  let updated = 0;
  let lines = 0;
  const seen = new Set<string>();

  for (const pass of passes) {
    let page = 0;
    for (;;) {
      const { orders } = await fetchNetoOrderPage(page, pageSize, pass.filter);
    if (!orders.length) break;

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
        customer = { id: createdCustomer.id, emailNormalized: email, name };
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

      const orderLines = asItems(netoOrder.OrderLine).filter((line) => !isNonProductLine(line.SKU, line.ProductName));
      const existingId = orderByExternalId.get(orderId);
      const orderData = {
        externalId: orderId,
        customerId: customer.id,
        orderDate: parseNetoDate(netoOrder.DatePlaced) ?? parseNetoDate(netoOrder.DatePaid),
        orderTotal: parseNumber(netoOrder.GrandTotal) ?? undefined,
        sourceRowHash: `neto:${orderId}`,
        originalData: {
          OrderID: orderId,
          OrderStatus: netoOrder.OrderStatus,
          Username: netoOrder.Username,
          DatePaid: netoOrder.DatePaid,
          DatePlaced: netoOrder.DatePlaced,
          DateUpdated: netoOrder.DateUpdated,
        } as object,
      };

      const itemsData = orderLines.map((line) => {
        const sku = line.SKU?.trim() || null;
        const productName = normalizeWhitespace(line.ProductName ?? sku ?? "Unknown product");
        const product = sku ? productBySku.get(normalizeKey(sku)) : undefined;
        const quantity = parseInteger(line.Quantity) ?? 1;
        const unitPrice = parseNumber(line.UnitPrice);
        const extraction = extractVehicle({
          name: productName,
          sku,
          make: product?.make,
          series: product?.series,
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

    if (onProgress) {
      await onProgress(
        imported,
        Math.max(imported, (page + 1) * pageSize),
        `Imported ${imported.toLocaleString()} orders (${pass.label})`,
      );
    }
    if (orders.length < pageSize) break;
    page += 1;
    if (page > 2000) break;
    }
    pages += page + 1;
  }

  if (onProgress) {
    await onProgress(imported, imported, "Linking customers to extracted vehicles");
  }
  const links = await backfillCustomerVehiclesFromOrders(onProgress);
  return { imported, created, updated, lines, pages, from: range?.from ?? null, to: range?.to ?? null, ...links };
}

export async function repairNetoOrderDates() {
  const updated = await prisma.$executeRaw`
    UPDATE "Order"
    SET "orderDate" = ("originalData"->>'DatePlaced')::timestamp
    WHERE "sourceRowHash" LIKE 'neto:%'
      AND NULLIF("originalData"->>'DatePlaced', '') IS NOT NULL
  `;
  return { updated };
}

export async function refreshNetoOrderPlacedDates(from = "2026-08-01") {
  let page = 0;
  let updated = 0;
  let scanned = 0;
  for (;;) {
    const result = await netoRequest<NetoOrder>("GetOrder", {
      Filter: {
        DatePlacedFrom: `${from} 00:00:00`,
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
