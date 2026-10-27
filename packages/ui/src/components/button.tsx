"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../lib/utils.ts";
import { Spinner } from "./spinner.tsx";

export const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border font-medium text-sm outline-none transition-[background-color,box-shadow,color,transform] duration-150 ease-smooth active:scale-[0.97] pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-56 data-loading:select-none data-loading:text-transparent sm:text-xs [&_svg:not([class*='opacity-'])]:opacity-72 [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-8 px-[calc(--spacing(2.5)-1px)] sm:h-6",
        icon: "size-8 sm:size-6",
        "icon-lg": "size-9 sm:size-7",
        "icon-sm": "size-7 sm:size-5.5",
        "icon-xl":
          "size-10 sm:size-8 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-3.5",
        "icon-xs":
          "size-6 rounded-md sm:size-5 not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-3.5 sm:not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-3",
        lg: "h-9 px-[calc(--spacing(3)-1px)] sm:h-7",
        sm: "h-7 gap-1 px-[calc(--spacing(2)-1px)] sm:h-5.5",
        xl: "h-10 px-[calc(--spacing(3.5)-1px)] text-base sm:h-8 sm:text-xs [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-6 gap-1 rounded-md px-[calc(--spacing(1.5)-1px)] text-xs sm:h-5 sm:text-xs [&_svg:not([class*='size-'])]:size-3.5 sm:[&_svg:not([class*='size-'])]:size-3",
      },
      variant: {
        default:
          "border-primary/20 bg-primary text-primary-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-primary/92 hover:shadow-[0_2px_6px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.3)] active:shadow-[0_1px_1px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(0,0,0,0.2)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.15)] ring-1 ring-black/10 dark:ring-white/10 *:data-[slot=button-loading-indicator]:text-primary-foreground",
        destructive:
          "border-destructive/20 bg-destructive text-white shadow-[0_1px_3px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-destructive/90 hover:shadow-[0_2px_6px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.3)] *:data-[slot=button-loading-indicator]:text-white",
        "destructive-outline":
          "border-destructive/30 bg-destructive/5 text-destructive-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.4)] hover:bg-destructive/12 hover:border-destructive/50 data-pressed:bg-destructive/15 *:data-[slot=button-loading-indicator]:text-foreground",
        ghost:
          "border-transparent text-foreground hover:bg-accent data-pressed:bg-accent *:data-[slot=button-loading-indicator]:text-foreground",
        link: "border-transparent text-foreground underline-offset-4 hover:underline data-pressed:underline *:data-[slot=button-loading-indicator]:text-foreground",
        outline:
          "border-border/80 bg-surface/85 text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.8)] hover:bg-accent/80 hover:border-border hover:shadow-[0_2px_5px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] active:shadow-inner dark:shadow-[0_1px_2px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.06)] *:data-[slot=button-loading-indicator]:text-foreground",
        secondary:
          "border-border/70 bg-secondary/85 text-secondary-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.8)] hover:bg-secondary hover:shadow-[0_2px_5px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.95)] active:shadow-inner dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.08)] *:data-[slot=button-loading-indicator]:text-secondary-foreground",
      },
    },
  },
);

export interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  render,
  children,
  loading = false,
  disabled: disabledProp,
  ...props
}: ButtonProps): React.ReactElement {
  const isDisabled: boolean = Boolean(loading || disabledProp);
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] =
    render ? undefined : "button";

  const defaultProps = {
    children: (
      <>
        {children}
        {loading && (
          <Spinner
            className="pointer-events-none absolute"
            data-slot="button-loading-indicator"
          />
        )}
      </>
    ),
    className: cn(buttonVariants({ className, size, variant })),
    "aria-disabled": loading || undefined,
    "data-loading": loading ? "" : undefined,
    "data-slot": "button",
    // Every button is heard; the primary action and the destructive one are
    // heard at full weight, and a destructive one sounds like a warning.
    "data-cuelume-tap": variant === "destructive" ? "warning" : "",
    "data-cuelume-emphasis":
      variant === undefined || variant === "default" || variant === "destructive"
        ? "strong"
        : undefined,
    disabled: isDisabled,
    type: typeValue,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}
