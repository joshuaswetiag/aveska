import { TemplateEditor } from "@/components/template-editor";
import { PageState, usePageData } from "@/lib/use-page-data";
import type { ComponentProps } from "react";

export default function TemplatesPage() {
  const state = usePageData<ComponentProps<typeof TemplateEditor>["template"]>("/api/views/settings/templates", { search: false });
  return (
    <PageState {...state}>
      {(template) => (
        <div className="space-y-4">
          <h1 className="font-display text-3xl font-semibold">Email templates</h1>
          <p className="text-muted-foreground">Variables: {"{{first_name}} {{vehicle}} {{make}} {{model}} {{series}} {{purchased_product}} {{product_1_name}} {{shop_url}}"}</p>
          <TemplateEditor template={template} />
        </div>
      )}
    </PageState>
  );
}
