#!/usr/bin/env node
import { Resvg } from '@resvg/resvg-js';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import satori from 'satori';
import { html } from 'satori-html';

const WIDTH = 1920;
const HEIGHT = 1080;

const FONT_REGULAR =
  process.env.FALLOW_FONT_REGULAR ?? 'C:\\Windows\\Fonts\\segoeui.ttf';
const FONT_BOLD =
  process.env.FALLOW_FONT_BOLD ?? 'C:\\Windows\\Fonts\\segoeuib.ttf';

const COLORS = {
  bg: '#0B1220',
  panel: '#111A2E',
  panelAlt: '#0F1729',
  border: '#1F2A44',
  text: '#E5ECF7',
  muted: '#8A99B8',
  accent: '#7AA2F7',
  ok: '#4ADE80',
  watch: '#F5B544',
  critical: '#F87171',
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) {
      out.out = argv[++i];
    } else if (argv[i] === '--input' && argv[i + 1]) {
      out.input = argv[++i];
    }
  }
  return out;
}

function loadFallowJson(inputPath) {
  if (inputPath && existsSync(inputPath)) {
    return JSON.parse(readFileSync(inputPath, 'utf8'));
  }
  const stdout = execFileSync('npx', ['fallow', '--format', 'json'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    shell: true,
  });
  return JSON.parse(stdout);
}

function statusFor(metric, value) {
  if (metric === 'mi') {
    if (value >= 85) return 'OK';
    if (value >= 65) return 'Watch';
    return 'Critical';
  }
  if (metric === 'deadPct' || metric === 'dupPct') {
    if (value < 1) return 'OK';
    if (value < 5) return 'Watch';
    return 'Critical';
  }
  if (metric === 'complexPct') {
    if (value < 5) return 'OK';
    if (value < 10) return 'Watch';
    return 'Critical';
  }
  return 'OK';
}

function statusColor(status) {
  return status === 'OK'
    ? COLORS.ok
    : status === 'Watch'
      ? COLORS.watch
      : COLORS.critical;
}

function decodePath(p) {
  return p.replace(/%5B/g, '[').replace(/%5D/g, ']').replace(/\\/g, '/');
}

function buildHtml(data) {
  const { check, dupes, health } = data;
  const vs = health.vital_signs;
  const summary = health.summary;

  const totalFiles = vs.counts.total_files;
  const totalLoc = vs.counts.total_lines;
  const mi = vs.maintainability_avg;
  const deadFiles = vs.counts.dead_files;
  const deadFilePct = vs.dead_file_pct;
  const deadExports = vs.counts.dead_exports;
  const deadExportPct = vs.dead_export_pct;
  const dupPct = dupes.stats.duplication_percentage;
  const dupLines = dupes.stats.duplicated_lines;
  const dupGroups = dupes.stats.clone_groups;
  const fnTotal = summary.functions_analyzed;
  const fnOver = summary.functions_above_threshold;
  const fnPct = (fnOver / fnTotal) * 100;
  const hotspotsCount = (health.hotspots ?? []).length;
  const targets = health.targets ?? [];

  const topHotspots = [...health.findings]
    .sort((a, b) => b.crap - a.crap)
    .slice(0, 6)
    .map((f) => ({
      name: f.name,
      file: decodePath(f.path),
      line: f.line,
      cyc: f.cyclomatic,
      cog: f.cognitive,
      loc: f.line_count,
      crap: Math.round(f.crap),
      sev: f.severity.toUpperCase(),
    }));

  const topActions = [];
  if (deadFiles + deadExports > 0) {
    topActions.push({
      tag: 'Quick',
      text: `Remove ${deadFiles + deadExports} dead-code item(s)`,
    });
  }
  for (const t of targets.slice(0, 3)) {
    topActions.push({
      tag:
        t.effort === 'low' ? 'Quick' : t.effort === 'medium' ? 'Med' : 'Heavy',
      text: `${decodePath(t.path)} — ${t.recommendation}`,
    });
  }
  for (const f of topHotspots.slice(0, 4)) {
    if (topActions.length >= 6) break;
    topActions.push({
      tag: f.loc < 60 ? 'Quick' : f.loc < 200 ? 'Med' : 'Heavy',
      text: `${f.name} (${f.file}:${f.line}) — CRAP ${f.crap}`,
    });
  }

  const miStatus = statusFor('mi', mi);
  const deadStatus = statusFor('deadPct', Math.max(deadFilePct, deadExportPct));
  const dupStatus = statusFor('dupPct', dupPct);
  const cmplxStatus = statusFor('complexPct', fnPct);

  const tagColor = (tag) =>
    tag === 'Quick'
      ? COLORS.ok
      : tag === 'Med'
        ? COLORS.watch
        : COLORS.critical;

  const generatedAt = new Date().toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
  });

  const metricCard = (label, value, sub, status) => `
    <div style="display:flex;flex-direction:column;flex:1;background:${COLORS.panel};border:1px solid ${COLORS.border};border-radius:18px;padding:24px 28px;gap:6px;">
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:18px;color:${COLORS.muted};letter-spacing:1px;text-transform:uppercase;">
        <span>${label}</span>
        <span style="font-size:14px;font-weight:700;color:${statusColor(status)};letter-spacing:1.5px;">${status}</span>
      </div>
      <div style="display:flex;font-size:54px;font-weight:700;color:${COLORS.text};line-height:1.05;">${value}</div>
      <div style="display:flex;font-size:18px;color:${COLORS.muted};">${sub}</div>
    </div>
  `;

  const hotspotRow = (h, idx) => `
    <div style="display:flex;align-items:center;padding:14px 18px;background:${idx % 2 === 0 ? COLORS.panelAlt : 'transparent'};border-radius:10px;gap:18px;">
      <div style="display:flex;width:84px;font-size:24px;font-weight:700;color:${h.sev === 'CRITICAL' ? COLORS.critical : COLORS.watch};">${h.crap}</div>
      <div style="display:flex;flex-direction:column;flex:1;gap:2px;">
        <div style="display:flex;font-size:20px;font-weight:700;color:${COLORS.text};">${h.name}</div>
        <div style="display:flex;font-size:15px;color:${COLORS.muted};">${h.file}:${h.line}</div>
      </div>
      <div style="display:flex;font-size:15px;color:${COLORS.muted};width:170px;justify-content:flex-end;">cyc ${h.cyc} · cog ${h.cog} · ${h.loc} LOC</div>
    </div>
  `;

  const actionRow = (a) => `
    <div style="display:flex;align-items:flex-start;gap:14px;padding:12px 0;">
      <div style="display:flex;background:${tagColor(a.tag)};color:#0B1220;font-size:13px;font-weight:700;padding:5px 12px;border-radius:999px;letter-spacing:1px;text-transform:uppercase;">${a.tag}</div>
      <div style="display:flex;flex:1;font-size:18px;color:${COLORS.text};line-height:1.4;">${a.text}</div>
    </div>
  `;

  const accentBar = `linear-gradient(90deg, ${COLORS.accent} 0%, ${COLORS.ok} 100%)`;

  return `
<div style="display:flex;flex-direction:column;width:${WIDTH}px;height:${HEIGHT}px;background:${COLORS.bg};font-family:'Segoe UI', sans-serif;color:${COLORS.text};padding:48px 56px;gap:28px;">
  <div style="display:flex;align-items:center;justify-content:space-between;">
    <div style="display:flex;flex-direction:column;gap:4px;">
      <div style="display:flex;font-size:18px;color:${COLORS.muted};letter-spacing:3px;text-transform:uppercase;">Fallow · Code Quality Report</div>
      <div style="display:flex;font-size:48px;font-weight:700;color:${COLORS.text};letter-spacing:-1px;">HFSE Student Information System</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
      <div style="display:flex;font-size:16px;color:${COLORS.muted};">${generatedAt} (SGT)</div>
      <div style="display:flex;font-size:16px;color:${COLORS.muted};">${totalFiles} files · ${totalLoc.toLocaleString()} LOC</div>
    </div>
  </div>

  <div style="display:flex;height:4px;background:${accentBar};border-radius:3px;"></div>

  <div style="display:flex;gap:20px;">
    ${metricCard('Maintainability', mi.toFixed(1), 'MI score (0–100)', miStatus)}
    ${metricCard('Dead Code', `${deadFilePct.toFixed(1)}%`, `${deadFiles} files · ${deadExports} exports`, deadStatus)}
    ${metricCard('Duplication', `${dupPct.toFixed(1)}%`, `${dupLines} lines · ${dupGroups} groups`, dupStatus)}
    ${metricCard('Complexity', `${fnPct.toFixed(1)}%`, `${fnOver} of ${fnTotal} functions over threshold`, cmplxStatus)}
    ${metricCard('Hotspots', String(hotspotsCount), `churn × complexity (${vs.hotspot_count} strict)`, hotspotsCount > 5 ? 'Watch' : 'OK')}
  </div>

  <div style="display:flex;flex:1;gap:24px;">
    <div style="display:flex;flex:1.4;flex-direction:column;background:${COLORS.panel};border:1px solid ${COLORS.border};border-radius:18px;padding:28px 32px;gap:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;font-size:22px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${COLORS.text};">Top Complexity Hotspots</div>
        <div style="display:flex;font-size:14px;color:${COLORS.muted};">ranked by CRAP</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${topHotspots.map(hotspotRow).join('')}
      </div>
    </div>

    <div style="display:flex;flex:1;flex-direction:column;background:${COLORS.panel};border:1px solid ${COLORS.border};border-radius:18px;padding:28px 32px;gap:8px;">
      <div style="display:flex;font-size:22px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${COLORS.text};">Action Plan</div>
      <div style="display:flex;font-size:14px;color:${COLORS.muted};margin-bottom:6px;">prioritized by ROI</div>
      <div style="display:flex;flex-direction:column;">
        ${topActions.slice(0, 6).map(actionRow).join('')}
      </div>
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:center;font-size:14px;color:${COLORS.muted};">
    <div style="display:flex;">Run with: npx fallow --explain</div>
    <div style="display:flex;">fallow ${data.version}</div>
  </div>
</div>
  `;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = loadFallowJson(args.input);

  const fontRegular = readFileSync(FONT_REGULAR);
  const fontBold = readFileSync(FONT_BOLD);

  const markup = html(buildHtml(data));

  const svg = await satori(markup, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: 'Segoe UI', data: fontRegular, weight: 400, style: 'normal' },
      { name: 'Segoe UI', data: fontBold, weight: 700, style: 'normal' },
    ],
  });

  const png = new Resvg(svg, {
    background: '#0B1220',
    fitTo: { mode: 'width', value: WIDTH },
  })
    .render()
    .asPng();

  const outPath = args.out ?? defaultOutPath();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, png);
  console.log(outPath);
}

function defaultOutPath() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/T/, '-')
    .replace(/\..+$/, '');
  return join('reports', 'fallow', `fallow-report-${stamp}.png`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
