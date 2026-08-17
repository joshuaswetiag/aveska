"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ColumnField, ColumnMapping, ParsedRow } from "@/types";
import { toast } from "sonner";

const FIELDS: ColumnField[] = [
  "ignore",
  "customer_id",
  "customer_name",
  "email",
  "phone",
  "order_id",
  "order_date",
  "sku",
  "product_id",
  "product_name",
  "quantity",
  "unit_price",
  "order_total",
  "product_url",
  "category",
  "subcategory",
  "brand",
  "description",
  "image_url",
  "price",
  "stock",
  "make",
  "model",
  "series",
  "vehicle",
  "body_type",
  "year",
  "year_from",
  "year_to",
  "fitment",
  "application",
  "tags",
];

export function ImportWizard({ defaultType }: { defaultType: "ORDERS" | "CATALOGUE" | "SUPPRESSION" }) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState(defaultType);
  const [file, setFile] = useState<File | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [totalRows, setTotalRows] = useState(0);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const mappedPreview = useMemo(() => {
    return preview.slice(0, 8).map((row) => {
      const out: Record<string, unknown> = {};
      for (const [source, field] of Object.entries(mapping)) {
        if (field !== "ignore") out[field] = row[source];
      }
      return out;
    });
  }, [preview, mapping]);

  async function upload() {
    if (!file) return;
    setPending(true);
    const form = new FormData();
    form.set("file", file);
    form.set("type", type);
    const res = await fetch("/api/imports/upload", { method: "POST", body: form });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      toast.error(data.error ?? "Upload failed");
      return;
    }
    setImportId(data.id);
    setHeaders(data.headers);
    setPreview(data.preview);
    setMapping(data.mapping);
    setTotalRows(data.totalRows);
    setStep(2);
  }

  async function startImport() {
    if (!importId) return;
    setPending(true);
    const res = await fetch(`/api/imports/${importId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping, start: true }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      toast.error(data.error ?? "Import could not start");
      return;
    }
    toast.success("Import started");
    router.push(`/jobs/${data.jobId}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-sm text-muted-foreground">
        {["Upload", "Map columns", "Preview", "Import"].map((label, i) => (
          <span key={label} className={step === i + 1 ? "font-semibold text-foreground" : ""}>
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload file</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {(["ORDERS", "CATALOGUE", "SUPPRESSION"] as const).map((item) => (
                <Button key={item} type="button" variant={type === item ? "default" : "outline"} onClick={() => setType(item)}>
                  {item === "ORDERS" ? "Orders" : item === "CATALOGUE" ? "Catalogue" : "Suppression list"}
                </Button>
              ))}
            </div>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button disabled={!file || pending} onClick={upload}>
              {pending ? "Reading file…" : "Continue"}
            </Button>
            <p className="text-sm text-muted-foreground">{totalRows ? `${totalRows} rows detected` : "CSV, XLSX, or JSON. Max 25MB."}</p>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Column mapping</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {totalRows.toLocaleString()} rows. Confirm each source column before importing. Original values are kept.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2">Source column</th>
                    <th>Maps to</th>
                    <th>Sample</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((header) => (
                    <tr key={header} className="border-t border-border">
                      <td className="py-2 font-medium">{header}</td>
                      <td>
                        <select
                          className="h-8"
                          value={mapping[header] ?? "ignore"}
                          onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value as ColumnField }))}
                        >
                          {FIELDS.map((field) => (
                            <option key={field} value={field}>
                              {field.replaceAll("_", " ")}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="max-w-xs truncate text-muted-foreground">{String(preview[0]?.[header] ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)}>Preview mapping</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step >= 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview first rows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {Object.keys(mappedPreview[0] ?? {}).map((key) => (
                      <th key={key} className="px-2 py-1 text-left">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedPreview.map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      {Object.values(row).map((value, j) => (
                        <td key={j} className="px-2 py-1">
                          {String(value ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button disabled={pending} onClick={startImport}>
                {pending ? "Starting…" : "Start import"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
