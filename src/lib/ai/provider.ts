import type { EmailCopy, TemplateVariables } from "@/types";
import { professionalEmailCopy } from "@/lib/email/copy";
import { applyTemplate, renderEmailHtml } from "@/lib/email/provider";
import { firstNameFrom } from "@/lib/utils";

export interface AiProvider {
  name: string;
  generateEmailCopy(input: {
    firstName: string;
    vehicle: string;
    make: string;
    series: string;
    purchasedProduct: string;
    products: Array<{ name: string }>;
    campaignType: string;
  }): Promise<Omit<EmailCopy, "html">>;
}

export class TemplateAiProvider implements AiProvider {
  name = "template";

  async generateEmailCopy(input: {
    firstName: string;
    vehicle: string;
    make: string;
    series: string;
    purchasedProduct: string;
    products: Array<{ name: string }>;
    campaignType: string;
  }): Promise<Omit<EmailCopy, "html">> {
    return professionalEmailCopy(input);
  }
}

export class OpenAiCompatibleProvider implements AiProvider {
  name = "openai-compatible";

  async generateEmailCopy(input: {
    firstName: string;
    vehicle: string;
    make: string;
    series: string;
    purchasedProduct: string;
    products: Array<{ name: string }>;
    campaignType: string;
  }): Promise<Omit<EmailCopy, "html">> {
    const apiKey = process.env.AI_API_KEY;
    const model = process.env.AI_MODEL || "gpt-4o-mini";
    const baseUrl = process.env.AI_BASE_URL || "https://api.openai.com/v1";
    if (!apiKey) return new TemplateAiProvider().generateEmailCopy(input);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You write short, professional emails for Aveska, an Australian classic-car restoration parts supplier. Subject lines must name the customer's vehicle naturally, sound like a knowledgeable parts specialist, and invite a click. Never start with 'More'. Avoid hype, ALL CAPS, discount language, free shipping, warranty, stock, or compatibility unless provided. Keep the subject under 60 characters when possible. Do not mention purchase dates or sensitive details. Return JSON with subject, preheader, greeting, body, ctaLabel, footer.",
          },
          {
            role: "user",
            content: JSON.stringify({
              firstName: input.firstName,
              vehicle: input.vehicle,
              series: input.series,
              campaignType: input.campaignType,
              recommended: input.products.map((p) => p.name),
            }),
          },
        ],
      }),
    });
    if (!response.ok) return new TemplateAiProvider().generateEmailCopy(input);
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "";
    try {
      const parsed = JSON.parse(content.replace(/```json|```/g, "").trim()) as Omit<EmailCopy, "html">;
      return { ...parsed, ctaUrl: "{{shop_url}}" };
    } catch {
      return new TemplateAiProvider().generateEmailCopy(input);
    }
  }
}

export function getAiProvider(): AiProvider {
  const provider = (process.env.AI_PROVIDER || "none").toLowerCase();
  if (provider === "openai" || provider === "openai-compatible") return new OpenAiCompatibleProvider();
  return new TemplateAiProvider();
}

export function buildVariables(input: {
  name?: string | null;
  vehicle?: string | null;
  make?: string | null;
  model?: string | null;
  series?: string | null;
  purchasedProduct?: string | null;
  products?: Array<{ name: string; url: string; price?: string | null }>;
  shopUrl?: string | null;
  contactUrl?: string | null;
}): TemplateVariables {
  const products = input.products ?? [];
  return {
    first_name: firstNameFrom(input.name),
    vehicle: input.vehicle ?? "",
    make: input.make ?? "",
    model: input.model ?? "",
    series: input.series ?? "",
    purchased_product: input.purchasedProduct ?? "",
    product_1_name: products[0]?.name ?? "",
    product_1_url: products[0]?.url ?? "",
    product_1_price: products[0]?.price ?? "",
    product_2_name: products[1]?.name ?? "",
    product_2_url: products[1]?.url ?? "",
    product_2_price: products[1]?.price ?? "",
    product_3_name: products[2]?.name ?? "",
    product_3_url: products[2]?.url ?? "",
    product_3_price: products[2]?.price ?? "",
    shop_url: input.shopUrl ?? "",
    contact_url: input.contactUrl ?? "",
  };
}

export async function generatePersonalizedEmail(input: {
  customerName: string;
  vehicle: string;
  make: string;
  series: string;
  purchasedProduct: string;
  products: Array<{ name: string; url: string; price?: string | null; imageUrl?: string | null }>;
  campaignType: string;
  shopUrl?: string | null;
  contactUrl?: string | null;
  logoUrl?: string | null;
}): Promise<EmailCopy> {
  const copy = await getAiProvider().generateEmailCopy({
    firstName: firstNameFrom(input.customerName),
    vehicle: input.vehicle,
    make: input.make,
    series: input.series,
    purchasedProduct: input.purchasedProduct,
    products: input.products,
    campaignType: input.campaignType,
  });
  const vars = buildVariables({
    name: input.customerName,
    vehicle: input.vehicle,
    make: input.make,
    series: input.series,
    purchasedProduct: input.purchasedProduct,
    products: input.products,
    shopUrl: input.shopUrl,
    contactUrl: input.contactUrl,
  });
  const resolved = {
    ...copy,
    subject: applyTemplate(copy.subject, vars),
    preheader: applyTemplate(copy.preheader, vars),
    greeting: applyTemplate(copy.greeting, vars),
    body: applyTemplate(copy.body, vars),
    ctaLabel: applyTemplate(copy.ctaLabel, vars),
    ctaUrl: applyTemplate(copy.ctaUrl || "{{shop_url}}", vars) || input.shopUrl || "#",
    footer: applyTemplate(copy.footer, vars),
  };
  return { ...resolved, html: renderEmailHtml(resolved, input.products, { logoUrl: input.logoUrl }) };
}
