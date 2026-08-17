import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <AppShell user={session.user} signOutSlot={<SignOutButton />}>
      {children}
    </AppShell>
  );
}
