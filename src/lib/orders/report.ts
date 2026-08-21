import { prisma } from "@/lib/db";
import { canonicalVehicleName } from "@/lib/vehicle/extract";
import { formatDate, parseNumber, zonedDayRange } from "@/lib/utils";
import type { VehicleExtraction } from "@/types";
import type { Prisma } from "@prisma/client";

export const ORDER_REPORT_PAGE_SIZE = 50;
export const ORDER_REPORT_EXPORT_LIMIT = 25000;

export type OrderReportFilters = {
  from?: string;
  to?: string;
  q?: string;
  page: number;
};

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

export function parseOrderReportFilters(params: {
  from?: string;
  to?: string;
  q?: string;
  page?: string;
}): OrderReportFilters {
  const from = params.from && DATE_INPUT.test(params.from) ? params.from : undefined;
  const to = params.to && DATE_INPUT.test(params.to) ? params.to : undefined;
  const q = params.q?.trim() || undefined;
  const page = Math.max(1, Number(params.page) || 1);
  return { from, to, q, page };
}

export function orderReportQueryString(filters: Omit<OrderReportFilters, "page"> & { page?: number }) {
  const query = new URLSearchParams();
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.q) query.set("q", filters.q);
  if (filters.page && filters.page > 1) query.set("page", String(filters.page));
  return query.toString();
}

export function orderReportOrderWhere(filters: Pick<OrderReportFilters, "from" | "to" | "q">): Prisma.OrderWhereInput {
  const clauses: Prisma.OrderWhereInput[] = [
    { externalId: { not: null } },
    { NOT: { externalId: { startsWith: "DEMO" } } },
  ];
  if (filters.from || filters.to) {
    const fromRange = filters.from ? zonedDayRange(filters.from) : null;
    const toRange = filters.to ? zonedDayRange(filters.to) : null;
    clauses.push({
      orderDate: {
        gte: fromRange?.start,
        lt: toRange?.end,
      },
    });
  }
  if (filters.q) {
    const q = filters.q;
    clauses.push({
      OR: [
        { externalId: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { email: { contains: q, mode: "insensitive" } } },
        {
          items: {
            some: {
              OR: [
                { productName: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
              ],
            },
          },
        },
      ],
    });
  }
  return { AND: clauses };
}

export function orderItemReportWhere(filters: Pick<OrderReportFilters, "from" | "to" | "q">): Prisma.OrderItemWhereInput {
  const clauses: Prisma.OrderItemWhereInput[] = [
    {
      order: {
        externalId: { not: null },
        NOT: { externalId: { startsWith: "DEMO" } },
      },
    },
  ];
  if (filters.from || filters.to) {
    const fromRange = filters.from ? zonedDayRange(filters.from) : null;
    const toRange = filters.to ? zonedDayRange(filters.to) : null;
    clauses.push({
      order: {
        orderDate: {
          gte: fromRange?.start,
          lt: toRange?.end,
        },
      },
    });
  }
  if (filters.q) {
    const q = filters.q;
    clauses.push({
      OR: [
        { productName: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { order: { externalId: { contains: q, mode: "insensitive" } } },
        { order: { customer: { name: { contains: q, mode: "insensitive" } } } },
        { order: { customer: { email: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  return { AND: clauses };
}

const reportInclude = {
  product: {
    include: {
      fitments: {
        include: { vehicle: true },
        take: 1,
        orderBy: { confidence: "desc" as const },
      },
    },
  },
  order: {
    include: {
      customer: {
        include: {
          vehicles: {
            include: { vehicle: true },
            orderBy: { confidence: "desc" as const },
            take: 3,
          },
        },
      },
      items: { select: { lineTotal: true } },
    },
  },
} satisfies Prisma.OrderItemInclude;

export type OrderReportItem = Prisma.OrderItemGetPayload<{ include: typeof reportInclude }>;

export function vehicleLabelForOrderItem(item: OrderReportItem): string {
  const extracted = item.extractedVehicle as VehicleExtraction | null;
  if (extracted && (extracted.make || extracted.vehicleFamily || extracted.series?.length)) {
    return canonicalVehicleName(extracted) || extracted.application || "";
  }
  const fitment = item.product?.fitments[0]?.vehicle.canonicalName;
  if (fitment) return fitment;
  const vehicles = item.order.customer.vehicles;
  const primary = vehicles.find((row) => row.isPrimary) ?? vehicles[0];
  return primary?.vehicle.canonicalName ?? "";
}

export function orderStatusLabel(order: { originalData: unknown }): string {
  const data = order.originalData as { OrderStatus?: string } | null;
  return data?.OrderStatus?.trim() || "";
}

export function orderShippingAmount(order: {
  originalData: unknown;
  orderTotal?: { toString(): string } | number | string | null;
  items?: Array<{ lineTotal?: { toString(): string } | number | string | null }>;
}): number | null {
  const stored = parseNumber((order.originalData as { ShippingTotal?: string | number } | null)?.ShippingTotal);
  if (stored != null) return stored;
  if (order.orderTotal == null || !order.items?.length) return null;
  const total = Number(order.orderTotal);
  if (!Number.isFinite(total)) return null;
  const product = order.items.reduce((sum, item) => sum + (parseNumber(item.lineTotal) ?? 0), 0);
  return Math.round((total - product) * 100) / 100;
}

export function orderReportExportRow(item: OrderReportItem) {
  return {
    Date: formatDate(item.order.orderDate),
    "Order #": item.order.externalId ?? item.order.id,
    Status: orderStatusLabel(item.order),
    "Customer name": item.order.customer.name,
    "Customer email": item.order.customer.email ?? "",
    "Product name": item.productName,
    SKU: item.sku ?? "",
    Vehicle: vehicleLabelForOrderItem(item),
    Quantity: item.quantity,
    "Unit price": item.unitPrice != null ? Number(item.unitPrice) : "",
    "Line total": item.lineTotal != null ? Number(item.lineTotal) : "",
    Shipping: orderShippingAmount(item.order) ?? "",
    "Order total": item.order.orderTotal != null ? Number(item.order.orderTotal) : "",
  };
}

export async function fetchOrderReportPage(filters: OrderReportFilters) {
  const where = orderItemReportWhere(filters);
  const skip = (filters.page - 1) * ORDER_REPORT_PAGE_SIZE;
  const orderWhere = orderReportOrderWhere(filters);
  const [totalLines, items, aggregates, orderCount, orderTotals] = await Promise.all([
    prisma.orderItem.count({ where }),
    prisma.orderItem.findMany({
      where,
      include: reportInclude,
      orderBy: [{ order: { orderDate: "desc" } }, { createdAt: "desc" }],
      skip,
      take: ORDER_REPORT_PAGE_SIZE,
    }),
    prisma.orderItem.aggregate({
      where,
      _sum: { quantity: true, lineTotal: true },
    }),
    prisma.order.count({ where: orderWhere }),
    prisma.order.aggregate({
      where: orderWhere,
      _sum: { orderTotal: true },
    }),
  ]);
  return {
    items,
    totalLines,
    orderCount,
    quantity: aggregates._sum.quantity ?? 0,
    revenue: Number(aggregates._sum.lineTotal ?? 0),
    orderRevenue: Number(orderTotals._sum.orderTotal ?? 0),
  };
}

export async function fetchOrderReportExport(filters: Pick<OrderReportFilters, "from" | "to" | "q">) {
  const where = orderItemReportWhere(filters);
  const items = await prisma.orderItem.findMany({
    where,
    include: reportInclude,
    orderBy: [{ order: { orderDate: "desc" } }, { createdAt: "desc" }],
    take: ORDER_REPORT_EXPORT_LIMIT,
  });
  return items.map(orderReportExportRow);
}
