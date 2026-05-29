import { CalendarCog } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function NoCurrentAyCard() {
  return (
    <Card className="bg-gradient-to-t from-primary/5 to-card shadow-xs">
      <CardHeader>
        <CardDescription className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]">
          Setup required
        </CardDescription>
        <CardTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">
          No academic year configured
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          This module needs a current academic year to display data. Go to SIS
          Admin to create or activate an academic year.
        </p>
        <Button asChild size="sm">
          <Link href="/sis/ay-setup">
            <CalendarCog className="mr-2 size-4" />
            Open AY Setup
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
