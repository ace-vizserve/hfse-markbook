"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SidebarBadges } from "@/lib/auth/roles";
import type { QuickAction } from "@/lib/sidebar/registry";

type SidebarQuickActionProps = {
  action: QuickAction;
  badges?: SidebarBadges;
};

export function SidebarQuickAction({ action, badges }: SidebarQuickActionProps) {
  const Icon = action.icon;
  const badge = action.badgeKey ? badges?.[action.badgeKey] ?? 0 : 0;
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  if (collapsed) {
    return (
      <div className="px-2 pt-3 pb-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild size="icon" className="relative size-9">
              <Link href={action.href} aria-label={action.label}>
                <Icon className="size-4" />
                {badge > 0 && (
                  <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-semibold tabular-nums text-white">
                    {badge}
                  </span>
                )}
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {action.label}
            {badge > 0 ? ` (${badge})` : ""}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="px-3 pt-3 pb-2">
      <Button asChild className="h-9 w-full justify-start gap-2 px-3">
        <Link href={action.href}>
          <Icon className="size-4" />
          <span className="flex-1 text-left text-[13px] font-semibold">{action.label}</span>
          {badge > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 text-[10px] font-semibold tabular-nums">
              {badge}
            </span>
          )}
        </Link>
      </Button>
    </div>
  );
}
