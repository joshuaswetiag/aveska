export { auth as middleware } from "@/auth";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|api/health|t/|.*\\.png$|.*\\.svg$).*)"],
};
