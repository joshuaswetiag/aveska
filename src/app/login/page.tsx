"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError("");
    const result = await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirect: false,
    });
    setPending(false);
    if (result?.error) {
      setError("Invalid email or password");
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0f3d46] px-4">
      <div className="ui-orb left-[8%] top-[18%] h-64 w-64 bg-teal-300/30" />
      <div className="ui-orb right-[12%] bottom-[16%] h-72 w-72 bg-cyan-400/20" style={{ animationDelay: "1.4s" }} />
      <div className="ui-orb left-[40%] top-[70%] h-40 w-40 bg-emerald-300/20" style={{ animationDelay: "2.2s" }} />
      <form
        action={onSubmit}
        className="page-enter relative w-full max-w-md rounded-3xl border border-white/20 bg-white/95 p-8 shadow-[0_30px_80px_rgba(8,47,53,0.35)] backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-[0_10px_24px_var(--glow)]">
            <span className="h-3.5 w-3.5 rotate-45 rounded-sm bg-white/90" />
          </span>
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-primary">Aveska</div>
            <h1 className="font-display text-2xl font-semibold">Intelligence Platform</h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Internal vehicle-based marketing workspace.</p>
        <div className="mt-6 space-y-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required className="mt-1" defaultValue="admin@aveska.local" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required className="mt-1" />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" className="mt-2 w-full" size="lg" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </form>
    </div>
  );
}
