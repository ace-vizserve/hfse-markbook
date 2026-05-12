import { type LucideIcon } from "lucide-react";
import * as React from "react";

import { Badge, type BadgeProps } from "@/components/ui/badge";

// Status pill primitive. Delegates to the shared <Badge> variants so every
// status pill across the app reads with one visual voice — saturated brand
// gradient + white text + shadow — matching the SIS workflow status pills
// that <StageStatusBadge> renders for DB-string vocabularies.
//
// Tone → variant map:
//   healthy → success  (mint→sky gradient, white text)
//   locked  → blocked  (destructive gradient, white text)
//   info    → default  (indigo gradient, white text)
//   warning → warning  (amber gradient, white text)
//   muted   → muted    (muted-foreground filled, white text)
//
// `tone` is kept as the public API (descriptive of meaning, not styling)
// so the 4 domain wrappers (Application/DiscountCode/Document/Enrollment)
// don't need to change their call sites.

export type StatusTone = "healthy" | "locked" | "info" | "muted" | "warning";

const TONE_VARIANT: Record<StatusTone, NonNullable<BadgeProps["variant"]>> = {
  healthy: "success",
  locked: "blocked",
  info: "default",
  warning: "warning",
  muted: "muted",
};

type StatusBadgeProps = {
  tone: StatusTone;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
};

export function StatusBadge({ tone, icon: Icon, className, children }: StatusBadgeProps) {
  return (
    <Badge variant={TONE_VARIANT[tone]} className={className}>
      {Icon ? <Icon aria-hidden /> : null}
      {children}
    </Badge>
  );
}
