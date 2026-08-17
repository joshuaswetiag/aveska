import { prisma } from "@/lib/db";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CampaignBuilder } from "@/components/campaign-builder";
import { formatDate } from "@/lib/utils";
import { CampaignListActions } from "@/components/campaign-list-actions";

export default async function CampaignsPage() {
  const [campaigns, segments, vehicles] = await Promise.all([
    prisma.campaign.findMany({ include: { _count: { select: { recipients: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.segment.findMany({ orderBy: { name: "asc" } }),
    prisma.vehicle.findMany({ orderBy: { canonicalName: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Campaigns</h1>
      <CampaignBuilder
        segments={segments.map((s) => ({ id: s.id, name: s.name }))}
        vehicles={vehicles.map((v) => ({ id: v.id, name: v.canonicalName }))}
      />
      <div className="surface">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="p-3">Campaign</th>
              <th>Type</th>
              <th>Status</th>
              <th>Recipients</th>
              <th>Generated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-3">
                  <Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td>{c.type.replaceAll("_", " ")}</td>
                <td>
                  <Badge>{c.status}</Badge>
                </td>
                <td>{c._count.recipients}</td>
                <td>{formatDate(c.createdAt)}</td>
                <td className="p-3 text-right">
                  <CampaignListActions id={c.id} name={c.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
