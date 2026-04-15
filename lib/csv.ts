// Tiny CSV helpers shared by all export endpoints.
// - toCsvValue: escape a single field per RFC 4180 (wrap in quotes if it
//   contains a comma, quote, or newline; double up internal quotes).
// - buildCsv: header row + body rows joined with \n.

export function toCsvValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  const head = headers.map(toCsvValue).join(',');
  const body = rows.map((r) => r.map(toCsvValue).join(','));
  return [head, ...body].join('\n');
}
