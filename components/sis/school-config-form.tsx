'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SchoolConfig } from '@/lib/sis/school-config';

// School-wide settings form. Singleton row (id=1); patches via
// PATCH /api/sis/admin/school-config. Empty string clears a field.
export function SchoolConfigForm({ current }: { current: SchoolConfig }) {
  const router = useRouter();
  const [principal, setPrincipal] = useState(current.principalName);
  const [ceo, setCeo] = useState(current.ceoName);
  const [pei, setPei] = useState(current.peiRegistrationNumber);
  const [windowDays, setWindowDays] = useState(
    String(current.defaultPublishWindowDays),
  );
  const [compassionateDefault, setCompassionateDefault] = useState(
    String(current.defaultCompassionateAllowancePerYear),
  );
  const [vlDefault, setVlDefault] = useState(
    String(current.defaultVlAllowancePerTerm),
  );
  const [bronzeMin, setBronzeMin] = useState(String(current.subjectAwardBronzeMin));
  const [silverMin, setSilverMin] = useState(String(current.subjectAwardSilverMin));
  const [goldMin, setGoldMin] = useState(String(current.subjectAwardGoldMin));
  const [awardMax, setAwardMax] = useState(String(current.subjectAwardMax));
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const dirty =
    principal !== current.principalName ||
    ceo !== current.ceoName ||
    pei !== current.peiRegistrationNumber ||
    String(current.defaultPublishWindowDays) !== windowDays ||
    String(current.defaultCompassionateAllowancePerYear) !== compassionateDefault ||
    String(current.defaultVlAllowancePerTerm) !== vlDefault ||
    String(current.subjectAwardBronzeMin) !== bronzeMin ||
    String(current.subjectAwardSilverMin) !== silverMin ||
    String(current.subjectAwardGoldMin) !== goldMin ||
    String(current.subjectAwardMax) !== awardMax;

  async function save() {
    const days = Number(windowDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      toast.error('Publish window must be 1–365 days');
      return;
    }
    const compassionate = Number(compassionateDefault);
    if (!Number.isInteger(compassionate) || compassionate < 0 || compassionate > 30) {
      toast.error('Compassionate leave must be 0–30 days');
      return;
    }
    const vl = Number(vlDefault);
    if (!Number.isInteger(vl) || vl < 0 || vl > 10) {
      toast.error('Vacation leave must be 0–10 days per term');
      return;
    }
    const bronze = Number(bronzeMin);
    const silver = Number(silverMin);
    const gold = Number(goldMin);
    const max = Number(awardMax);
    const validNumbers = [bronze, silver, gold, max].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 100,
    );
    if (!validNumbers) {
      toast.error('Award thresholds must be between 0 and 100');
      return;
    }
    if (!(bronze < silver && silver < gold && gold <= max)) {
      toast.error('Award thresholds must be strictly increasing — Bronze < Silver < Gold ≤ Max');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/sis/admin/school-config', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          principalName: principal.trim(),
          ceoName: ceo.trim(),
          peiRegistrationNumber: pei.trim(),
          defaultPublishWindowDays: days,
          defaultCompassionateAllowancePerYear: compassionate,
          defaultVlAllowancePerTerm: vl,
          subjectAwardBronzeMin: bronze,
          subjectAwardSilverMin: silver,
          subjectAwardGoldMin: gold,
          subjectAwardMax: max,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? 'save failed');
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-5"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="principal">School Principal name</Label>
          <Input
            id="principal"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            maxLength={120}
            placeholder="e.g. Dr Jane Smith"
          />
          <p className="text-[11px] text-muted-foreground">
            Shown under the Principal signature line on final (T4) report cards.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ceo">Founder &amp; CEO name</Label>
          <Input
            id="ceo"
            value={ceo}
            onChange={(e) => setCeo(e.target.value)}
            maxLength={120}
            placeholder="e.g. John Doe"
          />
          <p className="text-[11px] text-muted-foreground">
            Shown under the Founder &amp; CEO signature line on final (T4) report cards.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pei">PEI registration number</Label>
          <Input
            id="pei"
            value={pei}
            onChange={(e) => setPei(e.target.value)}
            maxLength={64}
            placeholder="e.g. 200512345K"
          />
          <p className="text-[11px] text-muted-foreground">
            Rendered as a subtle line under the report-card title.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="windowDays">Default publish window (days)</Label>
          <Input
            id="windowDays"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={windowDays}
            onChange={(e) =>
              setWindowDays(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))
            }
            className="text-right font-mono tabular-nums"
          />
          <p className="text-[11px] text-muted-foreground">
            Default for the publication window (1–365). Registrar can override per publish.
          </p>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        <div className="space-y-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Attendance quotas
          </p>
          <p className="text-[13px] text-muted-foreground">
            School-wide defaults for how many leave days each student gets.
            Individual students can be adjusted from their attendance profile.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="compassionateDefault">
              Urgent / compassionate leave (days per year)
            </Label>
            <Input
              id="compassionateDefault"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={compassionateDefault}
              onChange={(e) =>
                setCompassionateDefault(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))
              }
              className="text-right font-mono tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              HFSE policy: 5 days per academic year. Used when no per-student override is set.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vlDefault">Vacation leave (days per term)</Label>
            <Input
              id="vlDefault"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={vlDefault}
              onChange={(e) =>
                setVlDefault(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))
              }
              className="text-right font-mono tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              HFSE policy: 1 per term (4 per year total). Unused days do not carry forward to the next term.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        <div className="space-y-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Academic award thresholds
          </p>
          <p className="text-[13px] text-muted-foreground">
            Score cut-offs for the Subject Award (per subject) and Overall
            Academic Award (per student). The same ladder applies to both —
            only the label changes. Thresholds must be strictly increasing.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="bronzeMin">Bronze (min)</Label>
            <Input
              id="bronzeMin"
              type="text"
              inputMode="decimal"
              value={bronzeMin}
              onChange={(e) =>
                setBronzeMin(e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))
              }
              className="text-right font-mono tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              Below this → Not eligible. HFSE default 88.5.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="silverMin">Silver (min)</Label>
            <Input
              id="silverMin"
              type="text"
              inputMode="decimal"
              value={silverMin}
              onChange={(e) =>
                setSilverMin(e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))
              }
              className="text-right font-mono tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              Bronze tops out below this. HFSE default 91.5.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="goldMin">Gold (min)</Label>
            <Input
              id="goldMin"
              type="text"
              inputMode="decimal"
              value={goldMin}
              onChange={(e) =>
                setGoldMin(e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))
              }
              className="text-right font-mono tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              Silver tops out below this. HFSE default 95.5.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="awardMax">Maximum</Label>
            <Input
              id="awardMax"
              type="text"
              inputMode="decimal"
              value={awardMax}
              onChange={(e) =>
                setAwardMax(e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))
              }
              className="text-right font-mono tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground">
              Upper bound for Gold. HFSE default 100.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        {justSaved && (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-primary">
            <CheckCircle2 className="size-3.5" /> Saved
          </span>
        )}
        <Button type="submit" disabled={saving || !dirty} className="gap-1.5">
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
