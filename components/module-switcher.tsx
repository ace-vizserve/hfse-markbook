"use client";

import { BookOpen, ChevronDown, ChevronUp, FolderOpen, ShieldCheck, Users } from "lucide-react";
import { useRouter } from "next/navigation";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MODULES = [
  { value: "markbook", label: "Markbook", icon: BookOpen, href: "/" },
  { value: "p-files", label: "P-Files", icon: FolderOpen, href: "/p-files" },
  { value: "records", label: "Records", icon: Users, href: "/records" },
  { value: "sis", label: "SIS Admin", icon: ShieldCheck, href: "/sis" },
] as const;

type ModuleSwitcherProps = {
  currentModule: "markbook" | "p-files" | "records" | "sis";
  canSwitch: boolean;
};

export function ModuleSwitcher({ currentModule, canSwitch }: ModuleSwitcherProps) {
  const router = useRouter();
  const current = MODULES.find((m) => m.value === currentModule)!;
  const Icon = current.icon;

  if (!canSwitch) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-3.5" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
            HFSE
          </span>
          <span className="font-serif text-sm font-semibold tracking-tight text-foreground">{current.label}</span>
        </div>
      </div>
    );
  }

  function handleChange(value: string) {
    const target = MODULES.find((m) => m.value === value);
    if (target && target.value !== currentModule) {
      router.push(target.href);
    }
  }

  return (
    <Select value={currentModule} onValueChange={handleChange}>
      <SelectTrigger className="h-auto w-auto gap-2 rounded-lg border-border/60 bg-card px-2.5 py-1.5 shadow-xs transition-all hover:border-primary/30 hover:shadow-sm focus:ring-1 focus:ring-primary/20 [&>svg]:hidden">
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-start leading-none">
            <span className="font-serif text-sm font-semibold tracking-tight text-foreground">
              <SelectValue />
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col -space-y-1 text-muted-foreground/50">
          <ChevronUp className="size-3" />
          <ChevronDown className="size-3" />
        </div>
      </SelectTrigger>
      <SelectContent align="start" className="min-w-[180px]">
        {MODULES.map((m) => {
          const MIcon = m.icon;
          return (
            <SelectItem key={m.value} value={m.value} className="py-2">
              <div className="flex items-center gap-2.5">
                <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <MIcon className="size-3" />
                </div>
                <div className="flex flex-col leading-none">
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    HFSE
                  </span>
                  <span className="font-serif text-[13px] font-semibold tracking-tight text-foreground">{m.label}</span>
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
