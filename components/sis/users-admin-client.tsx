"use client";

import { Ban, CheckCircle2, Loader2, Mail, Shield, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TABLE_COPY } from "@/lib/copy/data-table";
import { ROLES, type Role } from "@/lib/auth/roles";
import type { AdminUserRow } from "@/lib/sis/users/queries";

// ─── Role labels ──────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<Role, string> = {
  teacher: "Teacher",
  registrar: "Registrar",
  school_admin: TABLE_COPY.schoolAdmin,
  superadmin: "Superadmin",
  "p-file": "P-Files",
  admissions: "Admissions",
};

// ─── Columns ──────────────────────────────────────────────────────────────────

function buildColumns(currentUserId: string): ColumnDef<AdminUserRow>[] {
  return [
    {
      id: "user",
      accessorFn: (row) => row.display_name,
      header: "User",
      // No identifier link — no canonical user-detail page
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-foreground">{row.original.display_name}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{row.original.email}</div>
        </div>
      ),
      enableHiding: false,
    },
    {
      id: "role",
      accessorFn: (row) => row.role ?? "",
      header: "Role",
      cell: ({ row }) => (
        <RoleSelect user={row.original} isSelf={row.original.id === currentUserId} />
      ),
      filterFn: (row, _id, value) => {
        if (!value || (Array.isArray(value) && value.length === 0)) return true;
        const roleVal = row.original.role ?? "";
        return Array.isArray(value) ? value.includes(roleVal) : roleVal === value;
      },
    },
    {
      id: "status",
      accessorFn: (row) => (row.disabled ? "Disabled" : "Active"),
      header: "Status",
      cell: ({ row }) =>
        row.original.disabled ? (
          <Badge variant="blocked">
            <Ban className="size-3" /> Disabled
          </Badge>
        ) : (
          <Badge variant="success">
            <CheckCircle2 className="size-3" /> Active
          </Badge>
        ),
      filterFn: (row, _id, value) => {
        if (!value || (Array.isArray(value) && value.length === 0)) return true;
        const statusVal = row.original.disabled ? "Disabled" : "Active";
        return Array.isArray(value) ? value.includes(statusVal) : statusVal === value;
      },
    },
    {
      // created_at: hidden-by-default "Member since" column
      id: "created_at",
      accessorKey: "created_at",
      header: "Member since",
      cell: ({ row }) => (
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {new Date(row.original.created_at).toLocaleDateString("en-SG", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: "lastSignIn",
      accessorKey: "last_sign_in_at",
      header: "Last sign-in",
      cell: ({ row }) => (
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {row.original.last_sign_in_at
            ? new Date(row.original.last_sign_in_at).toLocaleDateString("en-SG", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "—"}
        </span>
      ),
      enableSorting: true,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <ToggleDisabledButton user={row.original} isSelf={row.original.id === currentUserId} />
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function RoleSelect({ user, isSelf }: { user: AdminUserRow; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setRole(next: Role) {
    if (next === user.role) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/sis/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "update failed");
      toast.success(`Role updated: ${user.email} → ${ROLE_LABEL[next]}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Select value={user.role ?? undefined} onValueChange={(v) => setRole(v as Role)} disabled={busy || isSelf}>
      <SelectTrigger className="h-8 w-[160px]">
        <SelectValue placeholder="— no role —" />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABEL[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ToggleDisabledButton({ user, isSelf }: { user: AdminUserRow; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggleDisabled() {
    const next = !user.disabled;
    setBusy(true);
    try {
      const res = await fetch(`/api/sis/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disabled: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "update failed");
      toast.success(next ? `Disabled: ${user.email}` : `Enabled: ${user.email}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={user.disabled ? "default" : "destructive"}
      disabled={busy || isSelf}
      onClick={toggleDisabled}
      className="gap-1.5"
      title={isSelf ? "You cannot disable your own account here" : undefined}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : user.disabled ? (
        <CheckCircle2 className="size-3.5" />
      ) : (
        <Ban className="size-3.5" />
      )}
      {user.disabled ? "Enable" : "Disable"}
    </Button>
  );
}

// ─── Main client component ───────────────────────────────────────────────────

export function UsersAdminClient({ users, currentUserId }: { users: AdminUserRow[]; currentUserId: string }) {
  const [inviteOpen, setInviteOpen] = useState(false);

  const columns = buildColumns(currentUserId);

  const toolbarTrailing = (
    <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
  );

  return (
    <DataTable<AdminUserRow>
      data={users}
      columns={columns}
      getRowId={(row) => row.id}
      searchKeys={["email", "display_name", (row) => row.role ?? ""]}
      searchPlaceholder="Search email, name, or role…"
      facets={[
        {
          columnId: "role",
          label: "Role",
          valueOptions: ROLES.map((r) => r),
        },
        {
          columnId: "status",
          label: "Status",
          valueOptions: ["Active", "Disabled"],
        },
      ]}
      toolbarTrailing={toolbarTrailing}
      initialSort={[{ id: "user", desc: false }]}
      initialColumnVisibility={{ created_at: false }}
      pageSize={25}
      emptyState={{
        icon: Users,
        title: "No staff users yet.",
        cta: {
          label: "Invite user",
          onClick: () => setInviteOpen(true),
        },
      }}
      emptyFilteredState={{
        title: "No users match.",
        body: "Try clearing filters or adjusting the search.",
      }}
    />
  );
}

// ─── Invite dialog ────────────────────────────────────────────────────────────

function InviteUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      toast.error("Valid email required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sis/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          role,
          displayName: displayName.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "invite failed");
      toast.success(`Invite sent to ${trimmed}`);
      onOpenChange(false);
      setEmail("");
      setDisplayName("");
      setRole("teacher");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "invite failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <UserPlus className="size-3.5" />
          Invite user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4 text-primary" /> Invite user
          </DialogTitle>
          <DialogDescription>
            Sends a magic-link invitation. The invitee signs in once with the link; their role is assigned immediately
            on the account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="new.user@hfse.edu.sg"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Display name (optional)</Label>
            <Input
              id="invite-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Jane Smith"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              <span className="inline-flex items-center gap-1.5">
                <Shield className="size-3.5" /> Role
              </span>
            </Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={saving || !email}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
            {saving ? "Inviting…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
