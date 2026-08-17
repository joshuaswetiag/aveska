import { prisma } from "@/lib/db";
import { ImportWizard } from "@/components/import-wizard";
import { NetoSyncButton } from "@/components/neto-sync-button";
import { NetoOrderSyncForm } from "@/components/neto-order-sync-button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export default async function ImportsPage() {
  const jobs = await prisma.importJob.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Imports</h1>
          <p className="mt-1 text-muted-foreground">
            Upload orders, catalogue, or suppression lists. Invalid rows are reported, never silently deleted.
          </p>
        </div>
        <NetoSyncButton />
      </div>
      <div className="surface space-y-3 p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Sync orders from Aveska</h2>
          <p className="text-sm text-muted-foreground">
            Set today, a month, or any range. Updated website orders in that window are fetched even if they were placed earlier.
          </p>
        </div>
        <NetoOrderSyncForm />
      </div>
      <ImportWizard defaultType="ORDERS" />
      <div className="surface">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="p-3">File</th>
              <th>Type</th>
              <th>Status</th>
              <th>Rows</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-t border-border">
                <td className="p-3">
                  <Link href={`/imports/${job.id}`} className="hover:underline">
                    {job.fileName}
                  </Link>
                </td>
                <td>{job.type}</td>
                <td>
                  <Badge variant={job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "warning" : "muted"}>
                    {job.status}
                  </Badge>
                </td>
                <td>
                  {job.validRows}/{job.totalRows}
                </td>
                <td>{formatDate(job.createdAt)}</td>
              </tr>
            ))}
            {!jobs.length ? (
              <tr>
                <td className="p-4 text-muted-foreground" colSpan={5}>
                  No imports yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
