import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { ParsedRow } from "@/types";

const MAX_PREVIEW = 50;

export type ParsedSpreadsheet = {
  headers: string[];
  rows: ParsedRow[];
  preview: ParsedRow[];
  totalRows: number;
};

function cellToValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  return text.length ? text : null;
}

function rowsFromMatrix(matrix: unknown[][]): ParsedSpreadsheet {
  const headerRow = (matrix[0] ?? []).map((cell, index) => {
    const text = cellToValue(cell);
    return text ? String(text) : `Column ${index + 1}`;
  });
  const rows: ParsedRow[] = [];
  for (const raw of matrix.slice(1)) {
    if (!raw || raw.every((cell) => cellToValue(cell) === null)) continue;
    const row: ParsedRow = {};
    headerRow.forEach((header, index) => {
      row[header] = cellToValue(raw[index]);
    });
    rows.push(row);
  }
  return {
    headers: headerRow,
    rows,
    preview: rows.slice(0, MAX_PREVIEW),
    totalRows: rows.length,
  };
}

function excelCell(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    const cell = value as { result?: unknown; text?: string; richText?: Array<{ text: string }> };
    if ("result" in cell && cell.result != null) return cell.result;
    if (typeof cell.text === "string" && cell.text !== "[object Object]") return cell.text;
    if (Array.isArray(cell.richText)) return cell.richText.map((part) => part.text).join("");
    return null;
  }
  return value;
}

export async function parseSpreadsheet(buffer: Buffer, fileName: string): Promise<ParsedSpreadsheet> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) {
    const parsed = JSON.parse(buffer.toString("utf8"));
    const records = Array.isArray(parsed) ? parsed : parsed.rows ?? parsed.data ?? [];
    if (!Array.isArray(records) || records.length === 0) {
      return { headers: [], rows: [], preview: [], totalRows: 0 };
    }
    const headers = Object.keys(records[0] as object);
    const rows: ParsedRow[] = records.map((record) => {
      const row: ParsedRow = {};
      for (const header of headers) {
        row[header] = cellToValue((record as Record<string, unknown>)[header]);
      }
      return row;
    });
    return { headers, rows, preview: rows.slice(0, MAX_PREVIEW), totalRows: rows.length };
  }

  if (lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
    throw new Error("Legacy .xls files are not supported. Save the spreadsheet as .xlsx or CSV and upload it again.");
  }

  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const result = Papa.parse<string[]>(buffer.toString("utf8"), {
      skipEmptyLines: true,
    });
    return rowsFromMatrix(result.data);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [], preview: [], totalRows: 0 };
  const matrix: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    matrix.push(values.map((cell) => excelCell(cell)));
  });
  return rowsFromMatrix(matrix);
}

function sheetSafe(value: unknown) {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value ?? "";
}

export async function toXlsx(sheets: Array<{ name: string; rows: Record<string, unknown>[] }>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name.slice(0, 31) || "Sheet");
    const keys = [...new Set(spec.rows.flatMap((row) => Object.keys(row)))];
    sheet.addRow(keys);
    for (const row of spec.rows) sheet.addRow(keys.map((key) => sheetSafe(row[key])));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function csvSafe(value: unknown) {
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = value == null ? "" : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  return Papa.unparse(rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, csvSafe(value)]))));
}
