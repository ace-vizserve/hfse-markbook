'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  FileCheck2,
  GraduationCap,
  Loader2,
  Lock,
  Shield,
  Users,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <main className="grid min-h-dvh w-full bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Left brand panel */}
      <aside
        className="relative hidden overflow-hidden border-r border-border bg-muted lg:flex lg:flex-col lg:justify-between lg:p-14"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, var(--muted-foreground) 1px, transparent 0)',
            backgroundSize: '22px 22px',
            maskImage:
              'radial-gradient(ellipse at center, black 40%, transparent 75%)',
          }}
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              HFSE International School
            </span>
            <span className="text-xs text-muted-foreground">
              Singapore &middot; AY 2025–2026
            </span>
          </div>
        </div>

        <div className="relative max-w-lg">
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shadow-sm">
            Faculty Portal
          </span>
          <h1 className="mt-5 font-serif text-4xl font-semibold leading-[1.1] tracking-tight text-foreground xl:text-[2.75rem]">
            Grading, report cards, and advisory —
            <span className="text-muted-foreground"> one source of truth.</span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            The official HFSE markbook replaces quarterly spreadsheets with a
            single, auditable system for teachers and the registrar.
          </p>

          <ul className="mt-10 space-y-5">
            <FeatureRow
              icon={FileCheck2}
              title="Single-source computation"
              body="Scores in, grades out — no more formula drift between workbooks."
            />
            <FeatureRow
              icon={Shield}
              title="Full audit trail"
              body="Every post-lock edit is recorded with its approval reference."
            />
            <FeatureRow
              icon={Users}
              title="Role-aware access"
              body="Teachers see their sections. The registrar sees everything."
            />
          </ul>
        </div>

        <div className="relative flex items-center justify-between border-t border-border pt-6 text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} HFSE International School</span>
          <span className="tabular-nums">v1.0</span>
        </div>
      </aside>

      {/* Right form panel */}
      <section className="flex items-center justify-center bg-background px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-foreground">HFSE Markbook</span>
              <span className="text-xs text-muted-foreground">Singapore</span>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="font-serif text-[28px] font-semibold tracking-tight text-foreground">
              Sign in to your account
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use your HFSE staff credentials to continue.
            </p>
          </div>

          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                placeholder="you@hfse.edu.sg"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error ? true : undefined}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs font-medium text-muted-foreground hover:text-foreground hover:no-underline"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </Button>
              </div>
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? true : undefined}
                className="h-11"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading} className="h-11 w-full shadow-sm">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Forgot your password? Contact the registrar&apos;s office.
            </p>
          </form>

          <div className="mt-12 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" />
            <span>Secured connection &middot; Authorized personnel only</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function FeatureRow({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary shadow-sm">
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
          {body}
        </span>
      </div>
    </li>
  );
}
