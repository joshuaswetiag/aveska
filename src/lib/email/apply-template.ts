import type { TemplateVariables } from "@/types";

export function applyTemplate(template: string, vars: Partial<TemplateVariables>): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => {
    const value = vars[key as keyof TemplateVariables];
    return value ?? "";
  });
}
