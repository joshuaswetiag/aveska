import { MailSettingsForm } from "@/components/mail-settings-form";
import { SettingsForm } from "@/components/settings-form";
import { PageState, usePageData } from "@/lib/use-page-data";
import type { ComponentProps } from "react";

type SettingsData = {
  canEdit: boolean;
  hostedOnRailway: boolean;
  mail: ComponentProps<typeof MailSettingsForm>["mail"];
  settings: ComponentProps<typeof SettingsForm>["settings"];
};

export default function SettingsPage() {
  const state = usePageData<SettingsData>("/api/views/settings", { search: false });
  return (
    <PageState {...state}>
      {({ canEdit, hostedOnRailway, mail, settings }) => (
        <div className="space-y-4">
          <h1 className="font-display text-3xl font-semibold">Settings</h1>
          <p className="text-sm">
            <a href="/settings/templates" className="text-primary hover:underline">
              Email template editor
            </a>
          </p>
          <MailSettingsForm canEdit={canEdit} hostedOnRailway={hostedOnRailway} mail={mail} />
          <SettingsForm settings={settings} />
        </div>
      )}
    </PageState>
  );
}
