import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { listCampaignTraffic, resolveTrackingBaseUrl, trafficSummary } from "@/lib/email/tracking-record";

export default async function TrafficPage() {
  const [events, summary, trackingBase] = await Promise.all([
    listCampaignTraffic({ take: 200 }),
    trafficSummary(),
    resolveTrackingBaseUrl(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-semibold">Traffic</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          When a customer opens a campaign email or clicks a product link, it is logged here with the date and their
          name.
        </p>
        {trackingBase ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Worldwide click tracking is on via {trackingBase}. New campaign sends will record visits here from any
            country.
          </p>
        ) : (
          <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium">Worldwide tracking needs a public https tunnel</p>
            <p>
              Keep <code className="rounded bg-white/80 px-1">npm run dev</code> running, then in a second terminal run:
            </p>
            <pre className="overflow-x-auto rounded-md bg-white/80 p-2 text-xs">npm run track:tunnel</pre>
            <p>
              Leave that window open. It saves a public URL automatically. Then send the campaign. When someone in any
              country clicks View product, Traffic will show date, name, and the link.
            </p>
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface p-4">
          <div className="text-xs uppercase text-muted-foreground">People who clicked</div>
          <div className="mt-1 font-display text-2xl">{summary.clickers.toLocaleString()}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs uppercase text-muted-foreground">Link clicks</div>
          <div className="mt-1 font-display text-2xl">{summary.clicks.toLocaleString()}</div>
        </div>
        <div className="surface p-4">
          <div className="text-xs uppercase text-muted-foreground">Opens</div>
          <div className="mt-1 font-display text-2xl">{summary.opens.toLocaleString()}</div>
        </div>
      </div>
      <div className="surface overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="p-3">Date</th>
              <th>Name</th>
              <th>Traffic</th>
              <th>Campaign</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-t border-border">
                <td className="whitespace-nowrap p-3">{formatDateTime(event.createdAt)}</td>
                <td>
                  <Link href={`/customers/${event.customerId}`} className="font-medium hover:underline">
                    {event.customerName}
                  </Link>
                  {event.customerEmail ? (
                    <div className="text-xs text-muted-foreground">{event.customerEmail}</div>
                  ) : null}
                </td>
                <td>
                  <Badge variant={event.type === "CLICK" ? "success" : "muted"}>
                    {event.type === "CLICK" ? "Clicked" : "Opened"}
                  </Badge>
                  {event.label ? <div className="mt-1 text-xs text-muted-foreground">{event.label}</div> : null}
                </td>
                <td>
                  <Link href={`/campaigns/${event.campaignId}`} className="hover:underline">
                    {event.campaignName}
                  </Link>
                </td>
                <td className="max-w-xs truncate text-muted-foreground">
                  {event.url ? (
                    <a href={event.url} className="hover:underline" target="_blank" rel="noreferrer">
                      {event.url}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {!events.length ? (
              <tr>
                <td colSpan={5} className="p-6 text-sm text-muted-foreground">
                  No email traffic yet. Send a campaign, then when a customer clicks View product it will appear here.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
