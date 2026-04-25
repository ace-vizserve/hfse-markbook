"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "peer size-4 shrink-0 rounded-full border border-hairline bg-background shadow-input transition-all",
        // Hover
        "hover:border-hairline-strong",
        // Focus
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/20 focus-visible:border-brand-indigo/60",
        // Checked — same gradient craft as Checkbox (brand indigo + inset highlight)
        "data-[state=checked]:border-transparent data-[state=checked]:bg-gradient-to-br data-[state=checked]:from-brand-indigo data-[state=checked]:to-brand-indigo-deep data-[state=checked]:shadow-brand-tile",
        // Disabled
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <span aria-hidden className="block size-1.5 rounded-full bg-white" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
