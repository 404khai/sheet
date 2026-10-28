"use client";

import { Field as FieldPrimitive } from "@base-ui/react/field";
import { mergeProps } from "@base-ui/react/merge-props";
import type * as React from "react";
import { cn } from "../lib/utils.ts";

export type TextareaProps = React.ComponentPropsWithoutRef<"textarea"> &
  React.RefAttributes<HTMLTextAreaElement> & {
    size?: "sm" | "default" | "lg" | number;
    unstyled?: boolean;
  };

export function Textarea({
  className,
  size = "default",
  unstyled = false,
  ref,
  ...props
}: TextareaProps): React.ReactElement {
  return (
    <span
      className={
        cn(
          !unstyled &&
            "relative inline-flex w-full rounded-lg border border-transparent bg-well/60 text-sm text-foreground shadow-sunken transition-[background-color,border-color,box-shadow] duration-150 ease-smooth hover:bg-well has-focus-visible:has-aria-invalid:border-destructive/64 has-focus-visible:has-aria-invalid:ring-destructive/32 has-aria-invalid:border-destructive/36 has-focus-visible:border-cx-accent has-focus-visible:bg-surface has-disabled:opacity-56 has-focus-visible:ring-3 has-focus-visible:ring-cx-accent/20 sm:text-xs",
          className,
        ) || undefined
      }
      data-size={size}
      data-slot="textarea-control"
    >
      <FieldPrimitive.Control
        ref={ref}
        value={props.value}
        defaultValue={props.defaultValue}
        disabled={props.disabled}
        id={props.id}
        name={props.name}
        render={(defaultProps: React.ComponentProps<"textarea">) => (
          <textarea
            className={cn(
              "field-sizing-content min-h-16 w-full rounded-[inherit] px-[calc(--spacing(2.5)-1px)] py-[calc(--spacing(1.5)-1px)] outline-none max-sm:min-h-19",
              size === "sm" &&
                "min-h-14 px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1)-1px)] max-sm:min-h-17",
              size === "lg" &&
                "min-h-18 py-[calc(--spacing(2)-1px)] max-sm:min-h-21",
            )}
            data-slot="textarea"
            {...mergeProps(defaultProps, props)}
          />
        )}
      />
    </span>
  );
}

export { FieldPrimitive };
