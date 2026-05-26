import { NextResponse } from 'next/server';

// POST /api/evaluation/checklist-items/copy-from — deprecated.
//
// Direct cross-section topic copying is no longer supported (KD #110).
// Import from a peer section instead: POST /api/sow/import copies ww_labels,
// pt_labels, and topics into the target SOW instance, then teachers seed
// their checklist via POST /api/sow/[id]/sync-to-eval.
export function POST() {
  return NextResponse.json(
    { error: 'Use POST /api/sow/import to copy topics via the SOW import flow.' },
    { status: 410 },
  );
}
