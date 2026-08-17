import { isStoreHome } from "@/lib/catalogue/product-url";

export function StoreProductLink({
  name,
  url,
  className = "block py-1 text-sm text-primary/90 transition-colors hover:text-primary hover:underline",
}: {
  name: string;
  url?: string | null;
  className?: string;
}) {
  if (url && !isStoreHome(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={className}>
        {name}
      </a>
    );
  }
  return <div className={className.replace("hover:underline", "")}>{name}</div>;
}
