"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export type MailFormValues = {
  configured: boolean;
  provider: string;
  from: string;
  hostLabel: string | null;
  emailProvider: "export" | "smtp" | "maropost";
  fromName: string;
  fromEmail: string;
  replyTo: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPasswordSet: boolean;
  emailSendDelayMs: number;
  maropostAccountId: string;
  maropostApiKeySet: boolean;
  maropostCampaignName: string;
};

export function MailSettingsForm({ mail, canEdit }: { mail: MailFormValues; canEdit: boolean }) {
  const [pending, setPending] = useState(false);
  const [provider, setProvider] = useState(mail.emailProvider);
  const [secure, setSecure] = useState(mail.smtpSecure);

  async function payload(form: HTMLFormElement) {
    const data = new FormData(form);
    return {
      emailProvider: provider,
      fromName: data.get("fromName"),
      fromEmail: data.get("fromEmail"),
      replyTo: data.get("replyTo"),
      smtpHost: data.get("smtpHost"),
      smtpPort: data.get("smtpPort"),
      smtpSecure: secure,
      smtpUser: data.get("smtpUser"),
      smtpPassword: data.get("smtpPassword"),
      emailSendDelayMs: data.get("emailSendDelayMs") || "200",
      maropostAccountId: data.get("maropostAccountId"),
      maropostApiKey: data.get("maropostApiKey"),
      maropostCampaignName: data.get("maropostCampaignName"),
    };
  }

  async function save(form: HTMLFormElement) {
    setPending(true);
    const res = await fetch("/api/settings/mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await payload(form)),
    });
    setPending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not save SMTP settings");
      return false;
    }
    toast.success("SMTP settings saved");
    window.location.reload();
    return true;
  }

  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bulk email / SMTP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Badge variant={mail.configured ? "success" : "warning"}>{mail.configured ? "Ready to send" : "Not configured"}</Badge>
          <p className="text-muted-foreground">
            {mail.configured ? `From ${mail.from}${mail.hostLabel ? ` · ${mail.hostLabel}` : ""}` : "An admin can add SMTP under Settings."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk email / SMTP</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await save(e.currentTarget);
          }}
        >
          <div className="md:col-span-2 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={mail.configured ? "success" : "warning"}>{mail.configured ? "Ready to send" : "Not configured"}</Badge>
            {mail.configured ? <span className="text-muted-foreground">{mail.from}{mail.hostLabel ? ` · ${mail.hostLabel}` : ""}</span> : null}
          </div>
          <div>
            <Label htmlFor="emailProvider">Provider</Label>
            <select
              id="emailProvider"
              className="mt-1"
              value={provider}
              onChange={(e) => setProvider(e.target.value as MailFormValues["emailProvider"])}
            >
              <option value="export">Off — export only</option>
              <option value="smtp">SMTP</option>
              <option value="maropost">Maropost SMTP</option>
            </select>
          </div>
          <div>
            <Label htmlFor="emailSendDelayMs">Delay between emails (ms)</Label>
            <Input id="emailSendDelayMs" name="emailSendDelayMs" type="number" min={0} defaultValue={mail.emailSendDelayMs || 200} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="fromName">From name</Label>
            <Input id="fromName" name="fromName" defaultValue={mail.fromName} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="fromEmail">From email</Label>
            <Input id="fromEmail" name="fromEmail" type="email" defaultValue={mail.fromEmail} placeholder="hello@aveska.com.au" className="mt-1" />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="replyTo">Reply-to</Label>
            <Input id="replyTo" name="replyTo" type="email" defaultValue={mail.replyTo} className="mt-1" />
          </div>
          {provider !== "export" ? (
            <>
              <div>
                <Label htmlFor="smtpHost">SMTP host</Label>
                <Input id="smtpHost" name="smtpHost" defaultValue={mail.smtpHost || (provider === "maropost" ? "smtp.maropost.com" : "")} placeholder="smtp.gmail.com" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="smtpPort">Port</Label>
                <Input id="smtpPort" name="smtpPort" type="number" defaultValue={mail.smtpPort || 587} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="smtpUser">SMTP username</Label>
                <Input id="smtpUser" name="smtpUser" defaultValue={mail.smtpUser || mail.fromEmail} placeholder="Full Gmail address, not the app name" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="smtpPassword">SMTP password</Label>
                <Input
                  id="smtpPassword"
                  name="smtpPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder={mail.smtpPasswordSet ? "Leave blank to keep the saved password" : "App password or SMTP password"}
                  className="mt-1"
                />
              </div>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <Switch checked={secure} onCheckedChange={setSecure} />
                Use SSL (port 465)
              </label>
            </>
          ) : null}
          {provider === "maropost" ? (
            <>
              <div>
                <Label htmlFor="maropostAccountId">Maropost account ID</Label>
                <Input id="maropostAccountId" name="maropostAccountId" defaultValue={mail.maropostAccountId} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="maropostCampaignName">Maropost campaign name</Label>
                <Input id="maropostCampaignName" name="maropostCampaignName" defaultValue={mail.maropostCampaignName} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="maropostApiKey">Maropost API key</Label>
                <Input
                  id="maropostApiKey"
                  name="maropostApiKey"
                  type="password"
                  autoComplete="new-password"
                  placeholder={mail.maropostApiKeySet ? "Leave blank to keep the saved key" : "API key"}
                  className="mt-1"
                />
              </div>
            </>
          ) : null}
          <p className="text-xs text-muted-foreground md:col-span-2">
            Passwords are stored on the server and never shown again. Leave a password blank to keep the saved value. SMTP username must be the full Gmail address, not the Google app name.
          </p>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save SMTP"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={async (event) => {
                const form = event.currentTarget.form;
                if (!form) return;
                setPending(true);
                const body = await payload(form);
                const saved = await fetch("/api/settings/mail", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                });
                if (!saved.ok) {
                  setPending(false);
                  toast.error("Could not save SMTP before testing");
                  return;
                }
                const res = await fetch("/api/settings/mail/test", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                });
                const data = await res.json().catch(() => ({}));
                setPending(false);
                if (!res.ok) toast.error(data.error ?? "Connection failed");
                else {
                  toast.success(`Saved and connected to ${data.host}`);
                  window.location.reload();
                }
              }}
            >
              Test connection
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={async () => {
                if (!window.confirm("Remove saved SMTP settings? Bulk send will turn off until you add them again.")) return;
                setPending(true);
                const res = await fetch("/api/settings/mail", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "clear" }),
                });
                setPending(false);
                if (!res.ok) toast.error("Could not clear SMTP settings");
                else {
                  toast.success("SMTP settings removed");
                  window.location.reload();
                }
              }}
            >
              Delete SMTP
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
