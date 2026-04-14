import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth/roles';
import { PageShell } from '@/components/ui/page-shell';
import { PageHeader } from '@/components/ui/page-header';
import { Surface, SurfaceHeader, SurfaceTitle, SurfaceDescription } from '@/components/ui/surface';
import { ChangePasswordForm } from './change-password-form';

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = getUserRole(user);

  return (
    <PageShell className="max-w-2xl">
      <PageHeader
        eyebrow="Account"
        title="Account settings"
        description="Your signed-in identity and how to change your password."
      />

      <Surface padded={false}>
        <SurfaceHeader>
          <SurfaceTitle>Profile</SurfaceTitle>
          <SurfaceDescription>
            Read-only. Ask the registrar to change your email or role.
          </SurfaceDescription>
        </SurfaceHeader>
        <dl className="divide-y divide-border">
          <div className="flex items-center justify-between px-6 py-4 md:px-8">
            <dt className="text-sm text-muted-foreground">Email</dt>
            <dd className="text-sm font-medium text-foreground">{user?.email ?? '—'}</dd>
          </div>
          <div className="flex items-center justify-between px-6 py-4 md:px-8">
            <dt className="text-sm text-muted-foreground">Role</dt>
            <dd className="text-sm font-medium capitalize text-foreground">
              {role ?? 'no role'}
            </dd>
          </div>
        </dl>
      </Surface>

      <Surface padded={false}>
        <SurfaceHeader>
          <SurfaceTitle>Change password</SurfaceTitle>
          <SurfaceDescription>
            Use a strong password you don&apos;t use anywhere else. Minimum 8 characters.
          </SurfaceDescription>
        </SurfaceHeader>
        <div className="p-6 md:p-8">
          <ChangePasswordForm />
        </div>
      </Surface>
    </PageShell>
  );
}
