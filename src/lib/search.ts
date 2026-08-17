import { prisma } from "@/lib/db";
import { normalizeKey } from "@/lib/utils";

export async function globalSearch(query: string) {
  const q = query.trim();
  if (q.length < 1) return { customers: [], products: [], vehicles: [], campaigns: [] };
  const contains = { contains: q, mode: "insensitive" as const };
  const seriesUpper = q.toUpperCase();

  const [customers, products, vehicles, campaigns] = await Promise.all([
    prisma.customer.findMany({
      where: {
        OR: [{ name: contains }, { email: contains }, { emailNormalized: contains }, { phone: contains }],
      },
      take: 8,
    }),
    prisma.product.findMany({
      where: {
        OR: [
          { name: contains },
          { sku: contains },
          { searchableText: contains },
          { series: { has: seriesUpper } },
        ],
      },
      take: 8,
    }),
    prisma.vehicle.findMany({
      where: {
        OR: [
          { canonicalName: contains },
          { make: contains },
          { model: contains },
          { vehicleFamily: contains },
          { searchableText: contains },
          { series: { has: seriesUpper } },
          { aliases: { some: { aliasNormalized: { contains: normalizeKey(q) } } } },
        ],
      },
      take: 8,
    }),
    prisma.campaign.findMany({
      where: { OR: [{ name: contains }, { slug: contains }, { subject: contains }] },
      take: 8,
    }),
  ]);

  return { customers, products, vehicles, campaigns };
}
