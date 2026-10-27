"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";
import { cn } from "../lib/utils.ts";

export type InputProps = Omit<
  InputPrimitive.Props & React.RefAttributes<HTMLInputElement>,
  "size"
> & {
  size?: "sm" | "default" | "lg" | number;
  unstyled?: boolean;
  nativeInput?: boolean;
};

export function Input({
  className,
  size = "default",
  unstyled = false,
  nativeInput = false,
  style,
  ...props
}: InputProps): React.ReactElement {
  const inputClassName = cn(
    "h-8 w-full min-w-0 rounded-[inherit] px-[calc(--spacing(2.5)-1px)] leading-8 outline-none [transition:background-color_5000000s_ease-in-out_0s] placeholder:text-muted-foreground/64 sm:h-6 sm:leading-6",
    size === "sm" &&
      "h-7 px-[calc(--spacing(2)-1px)] leading-7 sm:h-5.5 sm:leading-5.5",
    size === "lg" && "h-9 leading-9 sm:h-7 sm:leading-7",
    props.type === "search" &&
      "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
    props.type === "file" &&
      "text-muted-foreground file:me-3 file:bg-transparent file:font-medium file:text-foreground file:text-sm",
  );

  return (
    <span
      className={
        cn(
          !unstyled &&
            "relative inline-flex w-full rounded-lg border border-border/80 bg-surface-2/50 text-sm text-foreground shadow-[inset_0_1px_2px_rgba(0,0,0,0.06),0_1px_0_rgba(255,255,255,0.7)] dark:bg-surface-2/30 dark:border-border/60 dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.35),0_1px_0_rgba(255,255,255,0.06)] transition-all duration-150 ease-smooth hover:border-border has-focus-visible:border-cx-accent has-focus-visible:ring-2 has-focus-visible:ring-cx-accent/30 has-focus-visible:has-aria-invalid:border-destructive has-aria-invalid:border-destructive/60 has-autofill:bg-foreground/4 has-disabled:opacity-56 sm:text-xs dark:has-autofill:bg-foreground/8",
          className,
        ) || undefined
      }
      data-size={size}
      data-slot="input-control"
    >
      {nativeInput ? (
        <input
          className={inputClassName}
          data-slot="input"
          size={typeof size === "number" ? size : undefined}
          style={typeof style === "function" ? undefined : style}
          {...props}
        />
      ) : (
        <InputPrimitive
          className={inputClassName}
          data-slot="input"
          size={typeof size === "number" ? size : undefined}
          style={style}
          {...props}
        />
      )}
    </span>
  );
}

export { InputPrimitive };
