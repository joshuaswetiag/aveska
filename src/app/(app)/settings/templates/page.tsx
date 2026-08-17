import { prisma } from "@/lib/db";
import { TemplateEditor } from "@/components/template-editor";

export default async function TemplatesPage() {
  const templates = await prisma.emailTemplate.findMany({ orderBy: { name: "asc" } });
  const current = templates[0] ?? {
    id: "new",
    name: "Cross-sell",
    subject: "Selected parts for your {{vehicle}}",
    preheader: "Hand-selected {{series}} parts from Aveska, chosen to suit your vehicle.",
    bodyHtml: "<p>Hi {{first_name}},</p><p>Thank you for choosing Aveska for your {{vehicle}}.</p><p>We've selected a short list of {{series}} parts that restorers typically look for as the project moves forward.</p>",
    ctaLabel: "View {{series}} parts",
    ctaUrl: "{{shop_url}}",
  };
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-semibold">Email templates</h1>
      <p className="text-muted-foreground">
        Variables: {"{{first_name}} {{vehicle}} {{make}} {{model}} {{series}} {{purchased_product}} {{product_1_name}} {{shop_url}}"}
      </p>
      <TemplateEditor template={current} />
    </div>
  );
}
