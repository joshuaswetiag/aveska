import { CampaignBuilder } from "@/components/campaign-builder";
import { CampaignListActions } from "@/components/campaign-list-actions";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/lib/router";
import { PageState, usePageData } from "@/lib/use-page-data";
import { formatDate } from "@/lib/utils";

type CampaignList = {
  campaigns: Array<{ id: string; name: string; type: string; status: string; createdAt: string; _count: { recipients: number } }>;
  segments: Array<{ id: string; name: string }>;
  vehicles: Array<{ id: string; name: string }>;
};

export default function CampaignsPage() {
  const state = usePageData<CampaignList>("/api/views/campaigns", { search: false });
  return (
    <PageState {...state}>
      {({ campaigns, segments, vehicles }) => (
        <div className="space-y-6">
          <h1 className="font-display text-3xl font-semibold">Campaigns</h1>
          <CampaignBuilder segments={segments} vehicles={vehicles} />
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
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-t border-border">
                    <td className="p-3">
                      <Link href={`/campaigns/${campaign.id}`} className="font-medium hover:underline">
                        {campaign.name}
                      </Link>
                    </td>
                    <td>{campaign.type.replaceAll("_", " ")}</td>
                    <td>
                      <Badge>{campaign.status}</Badge>
                    </td>
                    <td>{campaign._count.recipients}</td>
                    <td>{formatDate(campaign.createdAt)}</td>
                    <td className="p-3 text-right">
                      <CampaignListActions id={campaign.id} name={campaign.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageState>
  );
}
