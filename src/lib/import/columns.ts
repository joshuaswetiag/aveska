import type { ColumnField, ColumnMapping, ParsedRow } from "@/types";
import { normalizeKey, similarity } from "@/lib/utils";

export const FIELD_ALIASES: Record<Exclude<ColumnField, "ignore">, string[]> = {
  customer_id: ["customer id", "customerid", "cust id", "cust_id", "client id", "account id", "customer number"],
  customer_name: ["customer name", "name", "customer", "client name", "full name", "billing name", "contact name"],
  email: ["email", "email address", "customer email", "e-mail", "e mail", "mail"],
  phone: ["phone", "phone number", "mobile", "telephone", "tel", "contact number"],
  order_id: ["order id", "orderid", "order number", "order no", "invoice", "invoice number", "invoice id"],
  order_date: ["order date", "date", "invoice date", "purchase date", "created at", "ordered"],
  sku: ["sku", "product sku", "item sku", "stock code", "part number", "part no", "code"],
  product_id: ["product id", "productid", "item id", "variant id"],
  product_name: ["product name", "product", "item", "item name", "title", "description", "product title"],
  quantity: ["quantity", "qty", "qty ordered", "units"],
  unit_price: ["unit price", "price", "item price", "amount", "unit amount"],
  order_total: ["order total", "total", "line total", "grand total", "invoice total"],
  product_url: ["product url", "url", "link", "product link", "permalink"],
  category: ["category", "product category", "type"],
  subcategory: ["subcategory", "sub category", "sub-category"],
  brand: ["brand", "manufacturer", "vendor"],
  description: ["product description", "long description", "details", "body"],
  image_url: ["image", "image url", "img", "photo", "thumbnail"],
  price: ["sale price", "regular price", "retail", "rrp"],
  stock: ["stock", "inventory", "qty available", "stock status", "in stock"],
  make: ["make", "vehicle make", "car make"],
  model: ["model", "vehicle model", "car model"],
  series: ["series", "vehicle series", "model series"],
  vehicle: ["vehicle", "application", "fit vehicles", "suits"],
  body_type: ["body type", "body", "bodytype"],
  year: ["year", "years", "model year"],
  year_from: ["year from", "from year", "start year"],
  year_to: ["year to", "to year", "end year"],
  fitment: ["fitment", "fits", "compatibility", "vehicle fitment"],
  application: ["application", "apps", "vehicle application"],
  tags: ["tags", "labels", "keywords"],
};

const ORDER_REQUIRED: ColumnField[] = ["product_name"];
const CATALOGUE_REQUIRED: ColumnField[] = ["product_name"];

export function detectColumnMapping(headers: string[], kind: "orders" | "catalogue"): ColumnMapping {
  const used = new Set<ColumnField>();
  const mapping: ColumnMapping = {};
  for (const header of headers) {
    const field = guessField(header, used, kind);
    mapping[header] = field;
    if (field !== "ignore") used.add(field);
  }
  return mapping;
}

function guessField(header: string, used: Set<ColumnField>, kind: "orders" | "catalogue"): ColumnField {
  const key = normalizeKey(header);
  let best: { field: ColumnField; score: number } | null = null;
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<[ColumnField, string[]]>) {
    if (used.has(field)) continue;
    if (kind === "orders" && ["image_url", "stock", "description"].includes(field) && key !== field.replace("_", " ")) {
      // still allow if exact-ish
    }
    for (const alias of aliases) {
      if (key === alias) return field;
      const score = similarity(key, alias);
      if (score >= 0.78 && (!best || score > best.score)) {
        best = { field, score };
      }
    }
  }
  return best?.field ?? "ignore";
}

export function mappingIssues(mapping: ColumnMapping, kind: "orders" | "catalogue"): string[] {
  const values = new Set(Object.values(mapping));
  const required = kind === "orders" ? ORDER_REQUIRED : CATALOGUE_REQUIRED;
  const issues: string[] = [];
  for (const field of required) {
    if (!values.has(field)) issues.push(`Map a column to ${field.replaceAll("_", " ")}`);
  }
  if (kind === "orders" && !values.has("email") && !values.has("customer_id") && !values.has("customer_name")) {
    issues.push("Map at least one customer identifier (email, customer id, or name)");
  }
  return issues;
}

export function applyMapping(row: ParsedRow, mapping: ColumnMapping): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const [source, field] of Object.entries(mapping)) {
    if (field === "ignore") continue;
    const value = row[source];
    if (out[field] === undefined || out[field] === null || out[field] === "") {
      out[field] = value ?? null;
    }
  }
  return out;
}
