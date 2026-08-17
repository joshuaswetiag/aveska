import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & { variant?: "default" | "success" | "warning" | "outline" | "muted" | "danger" }) {
  const styles = {
    default: "bg-primary/10 text-primary ring-1 ring-primary/15",
    success: "bg-teal-50 text-teal-800 ring-1 ring-teal-200/80",
    warning: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/80",
    danger: "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80",
    outline: "border border-border text-foreground",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-transform duration-200 hover:scale-[1.03]",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
