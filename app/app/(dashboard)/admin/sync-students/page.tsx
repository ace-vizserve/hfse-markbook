'use client';

import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Database,
  FileX,
  Loader2,
  RefreshCw,
  UserMinus,
  UserPlus,
  UserRoundCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

type SyncError = {
  row_index: number;
  student_number: string | null;
  reason: string;
};
type LevelBucket = { add: number; update: number; withdraw: number };
type Stats = {
  total_source_rows: number;
  students_to_add: number;
  students_to_update: number;
  enrollments_to_add: number;
  enrollments_to_withdraw: number;
  enrollments_to_reactivate: number;
  errors: number;
  by_level: Record<string, LevelBucket>;
};

type Preview = { ay_code: string; stats: Stats; errors: SyncError[] };

export default function SyncStudentsPage() {
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPreview() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/students/sync/stats');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'preview failed');
      setPreview(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    if (!confirm('Apply this sync to the grading database? This cannot be undone.')) return;
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch('/api/students/sync', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'commit failed');
      const s = body.summary;
      setResult(
        `Synced ${s.enrolled} enrolments (${s.added} new students, ${s.updated} updated, ${s.withdrawn} withdrawn, ${s.reactivated} reactivated).`,
      );
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setCommitting(false);
    }
  }

  const stats = preview?.stats;
  const levelRows = stats ? Object.entries(stats.by_level).sort(([a], [b]) => a.localeCompare(b)) : [];

  return (
    <PageShell className="max-w-5xl">
      <PageHeader
        eyebrow="Administration"
        title="Sync Students from Admissions"
        description="Preview changes from the admissions database, then commit. Index numbers are append-only — existing students keep theirs, new students get the next available index per section."
      />

      <div className="flex flex-wrap gap-2">
        <Button onClick={loadPreview} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {loading ? 'Loading preview…' : 'Load preview'}
        </Button>
        {preview && (
          <Button onClick={commit} disabled={committing}>
            {committing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {committing ? 'Committing…' : 'Commit sync'}
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sync failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {result && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Sync complete</AlertTitle>
          <AlertDescription>{result}</AlertDescription>
        </Alert>
      )}

      {stats && (
        <div className="space-y-6">
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <Stat icon={Database} label="Source rows" value={stats.total_source_rows} />
            <Stat icon={UserPlus} label="New students" value={stats.students_to_add} />
            <Stat icon={UserRoundCog} label="Name updates" value={stats.students_to_update} />
            <Stat icon={Users} label="New enrolments" value={stats.enrollments_to_add} />
            <Stat icon={UserMinus} label="Withdrawals" value={stats.enrollments_to_withdraw} />
            <Stat
              icon={RefreshCw}
              label="Reactivations"
              value={stats.enrollments_to_reactivate}
            />
            <Stat
              icon={FileX}
              label="Errors"
              value={stats.errors}
              tone={stats.errors > 0 ? 'warn' : 'ok'}
            />
          </div>

          {levelRows.length > 0 && (
            <Surface padded={false} className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Level</TableHead>
                    <TableHead className="text-right">Add</TableHead>
                    <TableHead className="text-right">Update</TableHead>
                    <TableHead className="text-right">Withdraw</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {levelRows.map(([label, b]) => (
                    <TableRow key={label}>
                      <TableCell>{label}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.add}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.update}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.withdraw}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Surface>
          )}

          {preview && preview.errors.length > 0 && (
            <Surface padded={false} className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border bg-muted px-5 py-3 text-sm font-medium text-foreground">
                <AlertTriangle className="h-4 w-4" />
                {preview.errors.length} row(s) skipped
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead>Student #</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.errors.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell className="tabular-nums">{e.row_index}</TableCell>
                      <TableCell>
                        {e.student_number ?? (
                          <em className="text-muted-foreground">null</em>
                        )}
                      </TableCell>
                      <TableCell>{e.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Surface>
          )}
        </div>
      )}
    </PageShell>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = 'ok',
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: 'ok' | 'warn';
}) {
  const warn = tone === 'warn' && value > 0;
  return (
    <Surface className="p-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <Icon
          className={cn('h-4 w-4 text-primary', warn && 'text-destructive')}
        />
      </div>
      <div
        className={cn(
          'mt-2 font-serif text-2xl font-semibold tabular-nums',
          warn ? 'text-destructive' : 'text-primary',
        )}
      >
        {value}
      </div>
    </Surface>
  );
}
