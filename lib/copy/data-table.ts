/**
 * Plain-English copy for data-table surfaces.
 * Per memory rule: school admins are not IT — every user-visible string
 * must read plain. Add entries here when discovered, not inline.
 */
export const TABLE_COPY = {
  // Document chase / renewal
  awaitingParentReply: 'Awaiting parent reply',
  sentBackToParent: 'Sent back to parent',
  lapsedReupload: 'Lapsed (re-upload needed)',
  awaitingValidation: 'Awaiting validation',

  // Markbook
  termSummary: 'Term summary',
  termSummaryTooltip: 'Older format, no longer written',

  // Roles
  schoolAdmin: 'School admin',

  // Sync wizard
  rowsFromAdmissions: 'Rows from admissions',
  newSectionAssignments: 'New section assignments',
  markedAsWithdrawn: 'Marked as withdrawn',

  // Discount codes
  discountCodesFooter: (label: string) => `These codes apply to the ${label} enrolment portal.`,

  // AY setup
  createGradingSheets: 'Create grading sheets for this AY',
  setAsCurrentAy: 'Set as current AY',
  copyTeacherAssignments: 'Copy teacher assignments from prior AY',
} as const;

export type TableCopyKey = keyof typeof TABLE_COPY;
