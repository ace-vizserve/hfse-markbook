import { AppSidebar } from "@/components/app-sidebar";
import { ModuleSwitcher } from "@/components/module-switcher";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { SidebarBadges } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSidebarChangeRequestCount } from "@/lib/change-requests/sidebar-counts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");

  const { id, email, role } = sessionUser;
  // Null-role users are parents — proxy.ts normally redirects them to
  // /parent before they reach this layout, but if they land here directly
  // (e.g. bookmarked /grading), redirect server-side as well.
  if (!role) redirect("/parent");
  if (role === "p-file") redirect("/p-files");

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar:state")?.value !== "false";

  const service = createServiceClient();
  const sidebarBadges: SidebarBadges = {
    changeRequests: await getSidebarChangeRequestCount(service, role, id),
  };

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar role={role} email={email} badges={sidebarBadges} userId={id} />
      <SidebarInset>
        <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md print:hidden">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 h-4" />
          <ModuleSwitcher currentModule="markbook" canSwitch={role === 'school_admin' || role === 'admin' || role === 'superadmin'} />
        </header>
        <div className="flex-1 bg-muted px-6 py-8 md:px-10 md:py-10 print:bg-background print:p-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
