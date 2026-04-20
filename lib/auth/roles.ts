import type { User } from "@supabase/supabase-js";

export type Role =
  | "teacher"
  | "registrar"
  | "school_admin"
  | "admin"
  | "superadmin"
  | "p-file";

export const ROLES: Role[] = [
  "teacher",
  "registrar",
  "school_admin",
  "admin",
  "superadmin",
  "p-file",
];

export type Module = "markbook" | "p-files" | "records" | "sis";

export type NavItem = {
  href: string;
  label: string;
  badgeKey?: SidebarBadgeKey;
  requiresRoles?: Role[];
};
export type NavSection = { label?: string; items: NavItem[] };

export type SidebarBadgeKey = "changeRequests";
export type SidebarBadges = Partial<Record<SidebarBadgeKey, number>>;

const PFILES_NAV: NavSection[] = [
  {
    items: [
      { href: "/p-files", label: "Dashboard" },
      { href: "/p-files/audit-log", label: "Audit Log" },
    ],
  },
];

// Records module — the student-records operational surface.
// Route group: (records)/records/*
const RECORDS_NAV: NavSection[] = [
  {
    items: [
      { href: "/records", label: "Dashboard" },
      { href: "/records/students", label: "Students" },
      { href: "/records/discount-codes", label: "Discount Codes" },
      { href: "/records/audit-log", label: "Audit Log" },
    ],
  },
];

// SIS admin hub — the system-level admin surface where structural ops live.
// Distinct from Records. Route group: (sis)/sis/*. Access: school_admin +
// admin + superadmin (AY Setup) and superadmin-only (Approvers).
const SIS_NAV: NavSection[] = [
  {
    items: [
      { href: "/sis", label: "Admin Hub" },
      { href: "/sis/ay-setup", label: "AY Setup", requiresRoles: ["school_admin", "admin", "superadmin"] },
      { href: "/sis/admin/approvers", label: "Approvers", requiresRoles: ["superadmin"] },
    ],
  },
];

// Sidebar navigation is scoped per module. The module switcher
// (components/module-switcher.tsx) moves between them; each module's sidebar
// renders only its own tree so links don't duplicate the switcher.
// Markbook varies by role; P-Files and SIS render one list regardless of role
// (access is gated by proxy.ts + ROUTE_ACCESS).
export const NAV_BY_MODULE: {
  markbook: Partial<Record<Role, NavSection[]>>;
  "p-files": NavSection[];
  records: NavSection[];
  sis: NavSection[];
} = {
  markbook: {
    teacher: [
      { items: [{ href: "/", label: "Dashboard" }] },
      {
        label: "Grading",
        items: [
          { href: "/grading", label: "My Sheets" },
          { href: "/grading/requests", label: "My Requests", badgeKey: "changeRequests" },
        ],
      },
    ],
    registrar: [
      { items: [{ href: "/", label: "Dashboard" }] },
      {
        label: "Grading",
        items: [
          { href: "/grading", label: "All Sheets" },
          { href: "/grading/new", label: "New Sheet" },
        ],
      },
      {
        label: "Students",
        items: [
          { href: "/admin/sections", label: "Sections" },
          { href: "/admin/sync-students", label: "Sync from Admissions" },
        ],
      },
      { items: [{ href: "/report-cards", label: "Report Cards" }] },
      {
        label: "Admin",
        items: [
          { href: "/admin/admissions", label: "Admissions Dashboard" },
          { href: "/admin/change-requests", label: "Change Requests", badgeKey: "changeRequests" },
          { href: "/admin/audit-log", label: "Audit Log" },
        ],
      },
    ],
    admin: [
      { items: [{ href: "/", label: "Dashboard" }] },
      {
        label: "Students",
        items: [{ href: "/admin/sections", label: "Sections" }],
      },
      { items: [{ href: "/report-cards", label: "Report Cards" }] },
      {
        label: "Admissions",
        items: [{ href: "/admin/admissions", label: "Pipeline Dashboard" }],
      },
      {
        label: "Admin",
        items: [
          { href: "/admin/change-requests", label: "Change Requests", badgeKey: "changeRequests" },
          { href: "/admin/audit-log", label: "Audit Log" },
        ],
      },
    ],
    // school_admin mirrors admin MINUS the "Change Requests" approval inbox —
    // school admins don't approve grade changes (that's academic admin work).
    school_admin: [
      { items: [{ href: "/", label: "Dashboard" }] },
      {
        label: "Students",
        items: [{ href: "/admin/sections", label: "Sections" }],
      },
      { items: [{ href: "/report-cards", label: "Report Cards" }] },
      {
        label: "Admissions",
        items: [{ href: "/admin/admissions", label: "Pipeline Dashboard" }],
      },
      {
        label: "Admin",
        items: [
          { href: "/admin/audit-log", label: "Audit Log" },
        ],
      },
    ],
    superadmin: [
      { items: [{ href: "/", label: "Dashboard" }] },
      {
        label: "Grading",
        items: [
          { href: "/grading", label: "All Sheets" },
          { href: "/grading/new", label: "New Sheet" },
        ],
      },
      {
        label: "Students",
        items: [
          { href: "/admin/sections", label: "Sections" },
          { href: "/admin/sync-students", label: "Sync from Admissions" },
        ],
      },
      { items: [{ href: "/report-cards", label: "Report Cards" }] },
      {
        label: "Admissions",
        items: [{ href: "/admin/admissions", label: "Pipeline Dashboard" }],
      },
      {
        label: "Admin",
        items: [
          { href: "/admin/change-requests", label: "Change Requests", badgeKey: "changeRequests" },
          { href: "/admin/audit-log", label: "Audit Log" },
        ],
      },
    ],
  },
  "p-files": PFILES_NAV,
  records: RECORDS_NAV,
  sis: SIS_NAV,
};

// Which roles may access a given route prefix. Longer prefixes are
// evaluated first via the explicit `find` order below, so `/sis/ay-setup`
// must appear before the broader `/sis` rule.
export const ROUTE_ACCESS: Array<{ prefix: string; allowed: Role[] }> = [
  { prefix: "/sis/admin/approvers", allowed: ["superadmin"] },
  { prefix: "/sis/ay-setup", allowed: ["school_admin", "admin", "superadmin"] },
  { prefix: "/admin", allowed: ["registrar", "school_admin", "admin", "superadmin"] },
  { prefix: "/report-cards", allowed: ["registrar", "school_admin", "admin", "superadmin"] },
  { prefix: "/grading", allowed: ["teacher", "registrar", "admin", "superadmin"] },
  { prefix: "/p-files", allowed: ["p-file", "school_admin", "admin", "superadmin"] },
  { prefix: "/records", allowed: ["registrar", "school_admin", "admin", "superadmin"] },
  { prefix: "/sis", allowed: ["school_admin", "admin", "superadmin"] },
];

export function getUserRole(user: User | null | undefined): Role | null {
  const raw = user?.app_metadata?.role ?? user?.user_metadata?.role;
  return ROLES.includes(raw as Role) ? (raw as Role) : null;
}

export function getRoleFromClaims(claims: Record<string, unknown> | null | undefined): Role | null {
  const appMeta = claims?.app_metadata as Record<string, unknown> | undefined;
  const userMeta = claims?.user_metadata as Record<string, unknown> | undefined;
  const raw = appMeta?.role ?? userMeta?.role;
  return ROLES.includes(raw as Role) ? (raw as Role) : null;
}

export function isRouteAllowed(pathname: string, role: Role | null): boolean {
  const rule = ROUTE_ACCESS.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  if (!rule) return true;
  return role != null && rule.allowed.includes(role);
}
