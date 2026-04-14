import Link from 'next/link';
import { ArrowLeft, ArrowRight, History, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageShell } from '@/components/ui/page-shell';
import { PageHeader } from '@/components/ui/page-header';
import { Surface } from '@/components/ui/surface';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type AuditRow = {
  id: string;
  grading_sheet_id: string;
  grade_entry_id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  approval_reference: string | null;
  changed_by: string;
  changed_at: string;
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ sheet_id?: string; entry_id?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let q = supabase
    .from('grade_audit_log')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(500);
  if (params.sheet_id) q = q.eq('grading_sheet_id', params.sheet_id);
  if (params.entry_id) q = q.eq('grade_entry_id', params.entry_id);

  const { data: rows, error } = await q;
  const auditRows = (rows ?? []) as AuditRow[];

  return (
    <PageShell>
      <Link
        href="/admin"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Admin
      </Link>

      <PageHeader
        eyebrow="Administration"
        title="Audit Log"
        description="Post-lock grade edits. Append-only."
      />

      {params.sheet_id && (
        <Alert>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>
              Filtered to sheet{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">{params.sheet_id}</code>
            </span>
            <Link
              href="/admin/audit-log"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Clear
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <Surface padded={false} className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Field</TableHead>
              <TableHead>Old</TableHead>
              <TableHead>New</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead className="w-24">Sheet</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <History className="h-6 w-6 opacity-50" />
                    No audit entries yet.
                  </div>
                </TableCell>
              </TableRow>
            )}
            {auditRows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {new Date(r.changed_at).toLocaleString()}
                </TableCell>
                <TableCell>{r.changed_by}</TableCell>
                <TableCell className="font-mono text-xs">{r.field_changed}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.old_value ?? '∅'}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.new_value ?? '∅'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.approval_reference ?? '—'}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/grading/${r.grading_sheet_id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    open
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Surface>
    </PageShell>
  );
}
