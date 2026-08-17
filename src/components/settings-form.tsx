"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useState } from "react";

type SettingsShape = {
  cooldownDays: number;
  confidenceThreshold: number;
  includeOutOfStock: boolean;
  utmEnabled: boolean;
  shopUrl: string;
  contactUrl: string;
  companyName: string;
  trackingUrl: string;
  reduceScoreSameFamily: boolean;
};

export function SettingsForm({ settings }: { settings: SettingsShape }) {
  const [pending, setPending] = useState(false);
  const [includeOutOfStock, setIncludeOutOfStock] = useState(settings.includeOutOfStock);
  const [utmEnabled, setUtmEnabled] = useState(settings.utmEnabled);
  const [reduceScoreSameFamily, setReduce] = useState(settings.reduceScoreSameFamily);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommendation and campaign defaults</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setPending(true);
            const res = await fetch("/api/settings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                cooldownDays: Number(form.get("cooldownDays")),
                confidenceThreshold: Number(form.get("confidenceThreshold")),
                includeOutOfStock,
                utmEnabled,
                reduceScoreSameFamily,
                shopUrl: form.get("shopUrl"),
                contactUrl: form.get("contactUrl"),
                companyName: form.get("companyName"),
                trackingUrl: form.get("trackingUrl"),
              }),
            });
            setPending(false);
            if (!res.ok) toast.error("Could not save settings");
            else toast.success("Settings saved");
          }}
        >
          <div>
            <Label>Purchase cooldown</Label>
            <select name="cooldownDays" defaultValue={settings.cooldownDays} className="mt-1">
              {[30, 60, 90, 180, 365, 0].map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? "Never recommend purchased SKU" : `${d} days`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Confidence threshold (0–1)</Label>
            <Input name="confidenceThreshold" type="number" step="0.01" min="0" max="1" defaultValue={settings.confidenceThreshold} className="mt-1" />
          </div>
          <Input name="shopUrl" defaultValue={settings.shopUrl} placeholder="Shop URL" />
          <Input name="contactUrl" defaultValue={settings.contactUrl} placeholder="Contact URL" />
          <Input name="companyName" defaultValue={settings.companyName} placeholder="Company name" className="md:col-span-2" />
          <div className="md:col-span-2">
            <Label htmlFor="trackingUrl">Public app URL for email click tracking</Label>
            <Input
              id="trackingUrl"
              name="trackingUrl"
              defaultValue={settings.trackingUrl}
              placeholder="https://your-public-host.example"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              For worldwide click tracking while this app stays on your PC, open a second terminal, run{" "}
              <code className="rounded bg-muted px-1">npm run track:tunnel</code>, keep it running, then send emails.
              That publishes an https address customers anywhere can reach. You can also paste a production https URL
              here after you deploy. Do not use localhost — shoppers cannot open it.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={includeOutOfStock} onCheckedChange={setIncludeOutOfStock} />
            Include out-of-stock products
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={utmEnabled} onCheckedChange={setUtmEnabled} />
            Append UTM parameters on campaign links
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <Switch checked={reduceScoreSameFamily} onCheckedChange={setReduce} />
            Reduce score when customer already bought the same product family
          </label>
          <Button type="submit" disabled={pending} className="md:col-span-2">
            Save settings
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
