import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.importJob.findUnique({ where: { id }, include: { errors: { take: 100 } } });
  if (!job) notFound();
  const summary = (job.summary ?? {}) as Record<string, number>;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">{job.fileName}</h1>
        <p className="mt-1 text-muted-foreground">
          {job.type} · <Badge>{job.status}</Badge>
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Object.entries({
          "Imported rows": summary.importedRows ?? job.totalRows,
          "Valid orders": summary.validOrders ?? job.validRows,
          "Duplicate rows": summary.duplicateRows ?? job.duplicateRows,
          "Missing email": summary.missingEmail ?? job.missingEmail,
          "Missing product": summary.missingProduct ?? job.missingProduct,
          "Error rows": summary.errorRows ?? job.errorRows,
        }).map(([label, value]) => (
          <div key={label} className="surface p-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      {job.errors.length ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Row-level errors</h2>
            <a className="text-sm text-primary hover:underline" href={`/api/imports/${job.id}/errors`}>
              Download invalid rows
            </a>
          </div>
          <div className="surface">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">Row</th>
                  <th>Field</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {job.errors.map((error) => (
                  <tr key={error.id} className="border-t border-border">
                    <td className="p-3">{error.rowNumber}</td>
                    <td>{error.field}</td>
                    <td>{error.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      <Link href="/imports" className="text-sm text-primary hover:underline">
        Back to imports
      </Link>
    </div>
  );
}
