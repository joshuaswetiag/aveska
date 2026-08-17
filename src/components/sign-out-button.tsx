import { signOut } from "@/auth";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button type="submit" className="rounded-lg px-2 py-1 text-teal-100 transition-colors hover:bg-white/10 hover:text-white">
        Sign out
      </button>
    </form>
  );
}
