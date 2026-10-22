import type { ComponentProps } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";

export { useParams, useSearchParams } from "react-router-dom";

export function Link({ href, ...props }: { href: string } & Omit<ComponentProps<typeof RouterLink>, "to">) {
  return <RouterLink to={href} {...props} />;
}

export function usePathname() {
  return useLocation().pathname;
}

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    refresh: () => window.dispatchEvent(new Event("aveska:refresh")),
  };
}
