import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

export function usePageData<T>(path: string | null, options?: { search?: boolean }) {
  const location = useLocation();
  const includeSearch = options?.search !== false && path != null && !path.includes("?");
  const url = path == null ? null : includeSearch ? `${path}${location.search}` : path;
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setData(null);
    setStatus("loading");

    const load = () => {
      fetch(url, { credentials: "same-origin" })
        .then(async (res) => {
          if (cancelled) return;
          if (res.status === 401) {
            window.location.assign("/login");
            return;
          }
          if (res.status === 404) {
            setData(null);
            setStatus("missing");
            return;
          }
          if (!res.ok) {
            setStatus("error");
            return;
          }
          setData((await res.json()) as T);
          setStatus("ready");
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
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
