import { getDataQuality } from "@/lib/data-quality";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export default async function DataQualityPage() {
  const { cards, totals } = await getDataQuality();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Data quality</h1>
        <p className="text-muted-foreground">
          {totals.orderLines.toLocaleString()} order lines · {totals.customers.toLocaleString()} customers ·{" "}
          {totals.products.toLocaleString()} products · {totals.vehicles.toLocaleString()} vehicles
        </p>
      </div>
      <div className="stagger-in grid gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <Link key={card.label} href={card.href}>
            <Card className="h-full">
              <CardContent>
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{card.label}</div>
            <div className="mt-2 font-display text-3xl font-semibold">
              {card.value.toLocaleString()}
              {card.total != null ? (
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  / {card.total.toLocaleString()}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{card.hint}</p>
            {card.samples.length ? (
              <ul className="mt-3 space-y-1 text-sm">
                {card.samples.map((sample, index) => (
                  <li key={`${card.label}-${index}-${sample.label}`} className="truncate text-foreground">
                    {sample.label}
                    {sample.detail ? <span className="text-muted-foreground"> — {sample.detail}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
