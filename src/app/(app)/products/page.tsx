import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link } from "@/lib/router";
import { PageState, usePageData } from "@/lib/use-page-data";
import { formatCurrency } from "@/lib/utils";

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  price: string | number | null;
  stockStatus: string;
  make: string | null;
  series: string[];
  bodyType: string | null;
  fitments: Array<{ vehicle: { canonicalName: string } }>;
  _count: { orderItems: number; recommendations: number };
};

export default function ProductsPage() {
  const state = usePageData<{ q: string; page: number; pageSize: number; total: number; products: ProductRow[] }>("/api/views/products");
  return (
    <PageState {...state}>
      {({ q, page, pageSize, total, products }) => {
        const pageCount = Math.max(1, Math.ceil(total / pageSize));
        const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
        const to = Math.min(page * pageSize, total);
        const href = (nextPage: number) => {
          const query = new URLSearchParams();
          if (q) query.set("q", q);
          if (nextPage > 1) query.set("page", String(nextPage));
          const qs = query.toString();
          return qs ? `/products?${qs}` : "/products";
        };
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl font-semibold">Products</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {total.toLocaleString()} in catalogue
                  {q ? ` matching “${q}”` : ""}
                </p>
              </div>
              <form>
                <Input name="q" defaultValue={q} placeholder="Search SKU, name, make, series" className="max-w-md" />
              </form>
            </div>
            <div className="surface">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="p-3">Product</th>
                    <th>Vehicle</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Customers / recs</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const vehicleName =
                      product.fitments[0]?.vehicle.canonicalName ||
                      [product.make, product.series.join("/"), product.bodyType].filter(Boolean).join(" ") ||
                      "Insufficient fitment data";
                    return (
                      <tr key={product.id} className="border-t border-border">
                        <td className="p-3">
                          <Link href={`/products/${product.id}`} className="font-medium hover:underline">
                            {product.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{product.sku}</div>
                        </td>
                        <td className="max-w-xs pr-3">{vehicleName}</td>
                        <td>{formatCurrency(product.price ? Number(product.price) : null)}</td>
                        <td>
                          <Badge variant={product.stockStatus === "IN_STOCK" ? "success" : "muted"}>{product.stockStatus.replaceAll("_", " ")}</Badge>
                        </td>
                        <td>
                          {product._count.orderItems} / {product._count.recommendations}
                        </td>
                      </tr>
                    );
                  })}
                  {!products.length ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-sm text-muted-foreground">
                        No products found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-sm">
              <p className="text-muted-foreground">
                Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link href={href(page - 1)} className="pager">
                    Previous
                  </Link>
                ) : (
                  <span className="pager opacity-50">Previous</span>
                )}
                <span className="text-muted-foreground">
                  Page {page} of {pageCount}
                </span>
                {page < pageCount ? (
                  <Link href={href(page + 1)} className="pager">
                    Next
                  </Link>
                ) : (
                  <span className="pager opacity-50">Next</span>
                )}
              </div>
            </div>
          </div>
        );
      }}
    </PageState>
  );
}
