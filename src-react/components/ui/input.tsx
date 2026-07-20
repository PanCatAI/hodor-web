import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@react/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-11 w-full rounded-md border border-border bg-black/20 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-slate-500 focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = "Input";
