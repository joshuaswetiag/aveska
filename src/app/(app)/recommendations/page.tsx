import { GenerateCampaignButton } from "@/components/generate-campaign-button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/lib/router";
import { PageState, usePageData } from "@/lib/use-page-data";

type RecommendationRow = {
  id: string;
  customerId: string;
  productId: string;
  score: string | number;
  status: string;
  customer: { name: string };
  product: { name: string };
  vehicle: { canonicalName: string };
  reasons: Array<{ id: string; label: string }>;
};

export default function RecommendationsPage() {
  const state = usePageData<{ status: string; recs: RecommendationRow[] }>("/api/views/recommendations");
  return (
    <PageState {...state}>
      {({ status, recs }) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-3xl font-semibold">Recommendations</h1>
            <GenerateCampaignButton />
          </div>
          <div className="flex gap-2 text-sm">
            {["", "GENERATED", "NEEDS_REVIEW", "APPROVED"].map((value) => (
              <Link key={value || "all"} href={value ? `/recommendations?status=${value}` : "/recommendations"} className={`chip ${status === value ? "chip-active" : ""}`}>
                {value || "All"}
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
                  {rec.reasons.map((reason) => (
                    <li key={reason.id}>✓ {reason.label}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageState>
  );
}
