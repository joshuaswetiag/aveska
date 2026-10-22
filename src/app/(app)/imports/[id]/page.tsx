import { Badge } from "@/components/ui/badge";
import { Link, useParams } from "@/lib/router";
import { PageState, usePageData } from "@/lib/use-page-data";

type ImportDetail = {
  id: string;
  fileName: string;
  type: string;
  status: string;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  missingEmail: number;
  missingProduct: number;
  errorRows: number;
  summary: Record<string, number> | null;
  errors: Array<{ id: string; rowNumber: number; field: string | null; message: string }>;
};

export default function ImportDetailPage() {
  const { id } = useParams();
  const state = usePageData<ImportDetail>(id ? `/api/views/imports/${id}` : null, { search: false });
  return (
    <PageState {...state}>
      {(job) => {
        const summary = job.summary ?? {};
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
      }}
    </PageState>
  );
}
