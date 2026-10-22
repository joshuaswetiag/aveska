export function SignOutButton() {
  return (
    <button
      type="button"
      className="rounded-lg px-2 py-1 text-teal-100 transition-colors hover:bg-white/10 hover:text-white"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.assign("/login");
      }}
    >
      Sign out
    </button>
  );
}
