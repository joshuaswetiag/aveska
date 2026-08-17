import { prisma } from "@/lib/db";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { GenerateCampaignButton } from "@/components/generate-campaign-button";

export default async function RecommendationsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const recs = await prisma.recommendation.findMany({
    where: status ? { status: status as never } : undefined,
    include: { customer: true, product: true, vehicle: true, reasons: true },
    orderBy: { score: "desc" },
    take: 200,
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">Recommendations</h1>
        <GenerateCampaignButton />
      </div>
      <div className="flex gap-2 text-sm">
        {["", "GENERATED", "NEEDS_REVIEW", "APPROVED"].map((s) => (
          <Link key={s} href={s ? `/recommendations?status=${s}` : "/recommendations"} className={`chip ${status === s || (!status && !s) ? "chip-active" : ""}`}>
            {s || "All"}
          </Link>
        ))}
      </div>
      <div className="space-y-3">
        {recs.map((rec) => (
          <div key={rec.id} className="surface p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(15,118,110,0.12)]">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <Link href={`/customers/${rec.customerId}`} className="font-medium hover:underline">
                  {rec.customer.name}
                </Link>
                <span className="text-muted-foreground"> → </span>
                <Link href={`/products/${rec.productId}`} className="hover:underline">
                  {rec.product.name}
                </Link>
                <div className="text-sm text-muted-foreground">
                  {rec.vehicle.canonicalName} · score {Number(rec.score)}
                </div>
              </div>
              <Badge variant={rec.status === "NEEDS_REVIEW" ? "warning" : "default"}>{rec.status.replaceAll("_", " ")}</Badge>
            </div>
            <ul className="mt-2 text-sm">
              {rec.reasons.map((r) => (
                <li key={r.id}>✓ {r.label}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
