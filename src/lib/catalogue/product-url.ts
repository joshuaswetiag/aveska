export function storeOrigin() {
  const api = process.env.NETO_API_URL || "https://www.aveska.com.au/do/WS/NetoAPI";
  try {
    const parsed = new URL(api);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "https://www.aveska.com.au";
  }
}

export function isStoreHome(url: string | null | undefined, shopUrl?: string | null) {
  if (!url?.trim()) return true;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/") return false;
    if (!shopUrl) return true;
    const shop = new URL(shopUrl);
    return parsed.host.replace(/^www\./, "") === shop.host.replace(/^www\./, "");
  } catch {
    return false;
  }
}

export function productPageUrl(item: {
  ItemURL?: string | null;
  URL?: string | null;
  ProductURL?: string | null;
}): string | null {
  const raw = [item.ItemURL, item.URL, item.ProductURL].map((value) => value?.trim()).find((value) => value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${storeOrigin()}/${raw.replace(/^\//, "")}`;
}

export function resolveProductLink(product: { url?: string | null }, shopUrl?: string | null) {
  if (product.url && !isStoreHome(product.url, shopUrl)) return product.url;
  return shopUrl || "#";
}
