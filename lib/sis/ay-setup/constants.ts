// Sentinel placed in `CopyForwardPreview.source_ay_code` when the AY Setup
// wizard will copy from the master template (migration 031) rather than
// from a prior AY. Doesn't match `^AY[0-9]{4}$` so it never collides with
// a real AY code.
//
// Lives outside `queries.ts` because that module is server-only; the
// wizard (client component) needs to import this constant for its review-
// row rendering.
export const TEMPLATE_SOURCE_SENTINEL = '__TEMPLATE__';
