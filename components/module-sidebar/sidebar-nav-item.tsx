"use client";

import Link from "next/link";

import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import type { NavItem, SidebarBadges } from "@/lib/auth/roles";
import type { ModuleSidebarConfig } from "@/lib/sidebar/registry";

type SidebarNavItemProps = {
  item: NavItem;
  isActive: boolean;
  config: ModuleSidebarConfig;
  badges?: SidebarBadges;
};

const NAV_ACTIVE_CLASSES =
  "h-9 transition-colors " +
  "data-[active=true]:bg-accent " +
  "data-[active=true]:text-brand-indigo-deep " +
  "data-[active=true]:font-semibold " +
  "data-[active=true]:ring-1 data-[active=true]:ring-inset data-[active=true]:ring-brand-indigo-soft/40 " +
  "data-[active=true]:hover:bg-accent " +
  "data-[active=true]:[&_svg]:text-brand-indigo-deep";

export function SidebarNavItem({ item, isActive, config, badges }: SidebarNavItemProps) {
  const Icon = config.iconByHref[item.href] ?? config.fallbackIcon;
  const badge = item.badgeKey ? badges?.[item.badgeKey] ?? 0 : 0;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={badge > 0 ? `${item.label} (${badge})` : item.label}
        className={NAV_ACTIVE_CLASSES}>
        <Link href={item.href}>
          <Icon />
          <span>{item.label}</span>
          {badge > 0 && (
            <span className="ml-auto rounded-full bg-destructive px-1.5 text-[10px] font-semibold tabular-nums text-white group-data-[collapsible=icon]:hidden">
              {badge}
            </span>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
