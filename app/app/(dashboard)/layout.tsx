import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth/roles';
import { AppSidebar } from '@/components/app-sidebar';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Surface, SurfaceHeader, SurfaceTitle } from '@/components/ui/surface';
import { Separator } from '@/components/ui/separator';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const role = getUserRole(user);
  if (!role) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-muted p-6">
        <Surface padded={false} className="w-full max-w-sm">
          <SurfaceHeader>
            <SurfaceTitle>No role assigned</SurfaceTitle>
          </SurfaceHeader>
          <div className="p-6 text-sm text-muted-foreground md:p-8">
            Your account ({user.email}) has no role. Ask an administrator to set{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
              app_metadata.role
            </code>{' '}
            to one of: teacher, registrar, admin, superadmin.
          </div>
        </Surface>
      </main>
    );
  }

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get('sidebar:state')?.value !== 'false';

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar role={role} email={user.email ?? ''} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md print:hidden">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 h-4" />
          <div className="text-sm font-medium text-muted-foreground">HFSE Markbook</div>
        </header>
        <div className="flex-1 bg-muted px-6 py-8 md:px-10 md:py-10 print:bg-background print:p-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
