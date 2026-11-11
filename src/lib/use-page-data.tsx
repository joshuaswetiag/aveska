import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

export function usePageData<T>(path: string | null, options?: { search?: boolean }) {
  const location = useLocation();
  const includeSearch = options?.search !== false && path != null && !path.includes("?");
  const url = path == null ? null : includeSearch ? `${path}${location.search}` : path;
  const [loaded, setLoaded] = useState<{ url: string; data: T | null; status: "ready" | "missing" | "error" } | null>(null);
  const data = loaded?.url === url ? loaded.data : null;
  const status: "loading" | "ready" | "missing" | "error" = !url
    ? "loading"
    : loaded?.url === url
      ? loaded.status
      : "loading";

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const load = () => {
      fetch(url, { credentials: "same-origin" })
        .then(async (res) => {
          if (cancelled) return;
          if (res.status === 401) {
            window.location.assign("/login");
            return;
          }
          if (res.status === 404) {
            setLoaded({ url, data: null, status: "missing" });
            return;
          }
          if (!res.ok) {
            setLoaded({ url, data: null, status: "error" });
            return;
          }
          setLoaded({ url, data: (await res.json()) as T, status: "ready" });
        })
        .catch(() => {
          if (!cancelled) setLoaded({ url, data: null, status: "error" });
        });
    };

    load();
    const onRefresh = () => load();
    window.addEventListener("aveska:refresh", onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener("aveska:refresh", onRefresh);
    };
  }, [url]);

  return { data, status };
}

export function PageState<T>({
  status,
  data,
  children,
}: {
  status: "loading" | "ready" | "missing" | "error";
  data: T | null;
  children: (data: T) => ReactNode;
}) {
  if (status === "missing") return <p className="text-sm text-muted-foreground">Not found.</p>;
  if (status === "error") return <p className="text-sm text-danger">Could not load this page.</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return children(data);
}
