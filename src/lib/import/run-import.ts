import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { applyMapping } from "@/lib/import/columns";
import type { ColumnMapping, ParsedRow } from "@/types";
import {
  firstNameFrom,
  normalizeEmail,
  normalizeKey,
  normalizeWhitespace,
  parseDate,
  parseInteger,
  parseNumber,
} from "@/lib/utils";
import type { ImportType } from "@prisma/client";

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = normalizeWhitespace(String(value));
  return text || null;
}

function rowHash(parts: Array<string | number | null | undefined>): string {
  return createHash("sha256").update(parts.map((p) => String(p ?? "")).join("|")).digest("hex");
}

export async function importOrders(importJobId: string, rows: ParsedRow[], mapping: ColumnMapping) {
  let valid = 0;
  let duplicates = 0;
  let missingEmail = 0;
  let missingProduct = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const mapped = applyMapping(rows[i], mapping);
    try {
      const productNameRaw = str(mapped.product_name);
      const email = normalizeEmail(str(mapped.email));
      const customerName = str(mapped.customer_name) ?? (email ? email.split("@")[0] : "Unknown customer");
      if (!email) missingEmail += 1;
      if (!productNameRaw) {
        missingProduct += 1;
        await prisma.importRowError.create({
          data: {
            importJobId,
            rowNumber: i + 2,
            field: "product_name",
            message: "Missing product name",
            rawData: rows[i] as object,
          },
        });
        errors += 1;
        continue;
      }

      const hash = rowHash([
        mapped.order_id,
        mapped.sku,
        mapped.order_date,
        mapped.email,
        mapped.product_name,
        mapped.quantity,
      ]);
      const existing = await prisma.order.findFirst({ where: { sourceRowHash: hash } });
      if (existing) {
        duplicates += 1;
        continue;
      }

      const emailNormalized = email;
      let customer = emailNormalized
        ? await prisma.customer.findFirst({ where: { emailNormalized } })
        : str(mapped.customer_id)
          ? await prisma.customer.findFirst({ where: { externalId: str(mapped.customer_id)! } })
          : null;

      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            externalId: str(mapped.customer_id),
            name: customerName,
            email: str(mapped.email),
            emailNormalized,
            phone: str(mapped.phone),
            firstName: firstNameFrom(customerName),
            lastName: customerName.split(" ").slice(1).join(" ") || null,
            originalData: rows[i] as object,
          },
        });
      } else {
        await prisma.customer.update({
          where: { id: customer.id },
          data: {
            name: customer.name === "Unknown customer" ? customerName : customer.name,
            phone: customer.phone ?? str(mapped.phone),
            email: customer.email ?? str(mapped.email),
            emailNormalized: customer.emailNormalized ?? emailNormalized,
          },
        });
      }

      const sku = str(mapped.sku);
      const product =
        (sku
          ? await prisma.product.findFirst({ where: { skuNormalized: normalizeKey(sku) } })
          : null) ??
        (await prisma.product.findFirst({
          where: { name: { equals: productNameRaw, mode: "insensitive" } },
        }));

      const orderDate = parseDate(mapped.order_date);
      const order = await prisma.order.create({
        data: {
          externalId: str(mapped.order_id),
          customerId: customer.id,
          orderDate,
          orderTotal: parseNumber(mapped.order_total) ?? undefined,
          sourceRowHash: hash,
          importJobId,
          originalData: rows[i] as object,
          items: {
            create: {
              productId: product?.id,
              sku,
              productName: productNameRaw,
              productNameRaw,
              quantity: parseInteger(mapped.quantity) ?? 1,
              unitPrice: parseNumber(mapped.unit_price) ?? undefined,
              lineTotal: parseNumber(mapped.order_total) ?? parseNumber(mapped.unit_price) ?? undefined,
              productUrl: str(mapped.product_url),
              category: str(mapped.category),
            },
          },
        },
      });
      void order;
      valid += 1;
    } catch (error) {
      errors += 1;
      await prisma.importRowError.create({
        data: {
          importJobId,
          rowNumber: i + 2,
          message: error instanceof Error ? error.message : "Row failed",
          rawData: rows[i] as object,
        },
      });
    }

    if (i % 50 === 0) {
      await prisma.importJob.update({
        where: { id: importJobId },
        data: { processedRows: i + 1, validRows: valid, duplicateRows: duplicates, errorRows: errors, missingEmail, missingProduct },
      });
    }
  }

  const summary = {
    importedRows: rows.length,
    validOrders: valid,
    duplicateRows: duplicates,
    missingEmail,
    missingProduct,
    errorRows: errors,
  };

  await prisma.importJob.update({
    where: { id: importJobId },
    data: {
      status: "COMPLETED",
      processedRows: rows.length,
      validRows: valid,
      duplicateRows: duplicates,
      errorRows: errors,
      missingEmail,
      missingProduct,
      totalRows: rows.length,
      summary: summary as object,
    },
  });

  return summary;
}

export async function importCatalogue(importJobId: string, rows: ParsedRow[], mapping: ColumnMapping) {
  let valid = 0;
  let duplicates = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const mapped = applyMapping(rows[i], mapping);
    try {
      const nameRaw = str(mapped.product_name);
      if (!nameRaw) {
        errors += 1;
        await prisma.importRowError.create({
          data: {
            importJobId,
            rowNumber: i + 2,
            field: "product_name",
            message: "Missing product name",
            rawData: rows[i] as object,
          },
        });
        continue;
      }
      const sku = str(mapped.sku);
      const skuNormalized = sku ? normalizeKey(sku) : null;
      const existing = skuNormalized
        ? await prisma.product.findFirst({ where: { skuNormalized } })
        : await prisma.product.findFirst({ where: { nameRaw } });

      const series = str(mapped.series)
        ? str(mapped.series)!
            .split(/[/,+\s]+/)
            .map((s) => s.toUpperCase())
            .filter(Boolean)
        : [];
      const stockRaw = str(mapped.stock);
      const stockNum = parseInteger(mapped.stock);
      let stockStatus: "IN_STOCK" | "OUT_OF_STOCK" | "UNKNOWN" | "DISCONTINUED" = "UNKNOWN";
      if (stockRaw) {
        const lower = stockRaw.toLowerCase();
        if (lower.includes("discontinued")) stockStatus = "DISCONTINUED";
        else if (["0", "out", "out of stock", "oos", "no"].some((v) => lower === v || lower.includes("out of stock")))
          stockStatus = "OUT_OF_STOCK";
        else if (["in stock", "yes", "available"].some((v) => lower.includes(v)) || (stockNum !== null && stockNum > 0))
          stockStatus = "IN_STOCK";
      } else if (stockNum !== null) {
        stockStatus = stockNum > 0 ? "IN_STOCK" : "OUT_OF_STOCK";
      }

      const searchableText = [
        nameRaw,
        str(mapped.description),
        sku,
        str(mapped.category),
        str(mapped.make),
        str(mapped.model),
        str(mapped.series),
        str(mapped.vehicle),
        str(mapped.fitment),
        str(mapped.application),
        str(mapped.brand),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const data = {
        sku,
        skuNormalized,
        externalId: str(mapped.product_id),
        name: nameRaw,
        nameRaw,
        description: str(mapped.description),
        descriptionRaw: str(mapped.description),
        url: str(mapped.product_url),
        imageUrl: str(mapped.image_url),
        category: str(mapped.category),
        subcategory: str(mapped.subcategory),
        brand: str(mapped.brand),
        price: parseNumber(mapped.price) ?? parseNumber(mapped.unit_price),
        stock: stockNum,
        stockStatus,
        make: str(mapped.make),
        model: str(mapped.model),
        vehicleFamily: str(mapped.model),
        series,
        bodyType: str(mapped.body_type),
        yearFrom: parseInteger(mapped.year_from),
        yearTo: parseInteger(mapped.year_to),
        fitment: str(mapped.fitment) ?? str(mapped.vehicle) ?? str(mapped.application),
        searchableText,
        tags: str(mapped.tags)
          ? str(mapped.tags)!
              .split(/[,;]/)
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        originalData: rows[i] as object,
        importJobId,
      };

      if (existing) {
        duplicates += 1;
        await prisma.product.update({ where: { id: existing.id }, data });
      } else {
        await prisma.product.create({ data });
      }
      valid += 1;
    } catch (error) {
      errors += 1;
      await prisma.importRowError.create({
        data: {
          importJobId,
          rowNumber: i + 2,
          message: error instanceof Error ? error.message : "Row failed",
          rawData: rows[i] as object,
        },
      });
    }
    if (i % 50 === 0) {
      await prisma.importJob.update({
        where: { id: importJobId },
        data: { processedRows: i + 1, validRows: valid, duplicateRows: duplicates, errorRows: errors },
      });
    }
  }

  const summary = { importedRows: rows.length, validProducts: valid, duplicateRows: duplicates, errorRows: errors };
  await prisma.importJob.update({
    where: { id: importJobId },
    data: {
      status: "COMPLETED",
      processedRows: rows.length,
      validRows: valid,
      duplicateRows: duplicates,
      errorRows: errors,
      totalRows: rows.length,
      summary: summary as object,
    },
  });
  return summary;
}

export async function importSuppressions(importJobId: string, rows: ParsedRow[], mapping: ColumnMapping) {
  let valid = 0;
  let errors = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const mapped = applyMapping(rows[i], mapping);
    const email = normalizeEmail(str(mapped.email) ?? str(mapped.customer_name));
    if (!email) {
      errors += 1;
      continue;
    }
    await prisma.suppression.upsert({
      where: { emailNormalized_reason: { emailNormalized: email, reason: "UNSUBSCRIBED" } },
      update: {},
      create: {
        email: str(mapped.email) ?? email,
        emailNormalized: email,
        reason: "UNSUBSCRIBED",
        source: "import",
      },
    });
    await prisma.customer.updateMany({ where: { emailNormalized: email }, data: { isSuppressed: true } });
    valid += 1;
  }
  await prisma.importJob.update({
    where: { id: importJobId },
    data: { status: "COMPLETED", validRows: valid, errorRows: errors, processedRows: rows.length, summary: { valid, errors } as object },
  });
}

export function importKindFromType(type: ImportType): "orders" | "catalogue" {
  return type === "CATALOGUE" ? "catalogue" : "orders";
}
