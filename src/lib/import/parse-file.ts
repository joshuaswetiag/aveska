import Papa from "papaparse";
import * as XLSX from "xlsx";
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

export function parseSpreadsheet(buffer: Buffer, fileName: string): ParsedSpreadsheet {
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

  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const result = Papa.parse<string[]>(buffer.toString("utf8"), {
      skipEmptyLines: true,
    });
    return rowsFromMatrix(result.data);
  }

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [], preview: [], totalRows: 0 };
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
  return rowsFromMatrix(matrix);
}

export function toCsv(rows: Record<string, unknown>[]): string {
  return Papa.unparse(rows);
}
