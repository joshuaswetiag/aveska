import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "btn-shine bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-[0_10px_24px_var(--glow)] hover:-translate-y-0.5 hover:shadow-[0_14px_28px_var(--glow)]",
        secondary: "bg-muted text-foreground hover:-translate-y-0.5 hover:bg-border",
        outline:
          "border border-border bg-card/80 text-foreground shadow-sm hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-[0_8px_20px_rgba(15,118,110,0.12)]",
        ghost: "hover:bg-muted hover:text-primary",
        danger:
          "btn-shine bg-gradient-to-r from-danger to-[#db2777] text-white shadow-[0_10px_22px_rgba(190,24,93,0.28)] hover:-translate-y-0.5",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
