/** Job-level cursor assertions require their own database, rather than arbitrary cursor keys. */
export const cursorIsolatedCases = {
  'digest-work-window-gaps': {
    file: 'backend/services/notifications/community-activity-digest-dispatch.test.mts',
    fullName:
      'community activity digest work items > initializes and fills ordered gaps while retaining the completed high-water mark',
  },
  'digest-work-lease-takeover': {
    file: 'backend/services/notifications/community-activity-digest-dispatch.test.mts',
    fullName:
      'community activity digest work items > fences stale batch chains after expiry and successor takeover',
  },
  'retained-binding-cleanup-cursor': {
    file: 'backend/services/data-retention/__tests__/cleanup-retained-media-identities.test.mts',
    fullName:
      'retained media identity cleanup > initializes its own cursor and resumes deleted placement positions without advancing scoped calls',
  },
  'publication-audit-orphan-repair': {
    file: 'backend/services/post-publication/shadow-audit.test.mts',
    fullName:
      'post publication shadow audit > repairs a receipt left behind by a hard-deleted post',
  },
  'publication-audit-counts': {
    file: 'backend/services/post-publication/shadow-audit.test.mts',
    fullName:
      'post publication shadow audit > compares missing receipts, keeps dry runs read-only, and records a repair with truthful counts',
  },
  'publication-audit-eof': {
    file: 'backend/services/post-publication/shadow-audit.test.mts',
    fullName:
      'post publication shadow audit > resets an EOF checkpoint so the next scheduled run can start over',
  },
  'publication-audit-exact-receipt': {
    file: 'backend/services/post-publication/shadow-audit.test.mts',
    fullName:
      'post publication shadow audit > does not report a candidate whose current receipt matches primary state',
  },
  'publication-audit-final-page': {
    file: 'backend/services/post-publication/shadow-audit-checkpoint.test.mts',
    fullName:
      'post publication shadow audit checkpoints > resets the durable checkpoint after the final partial repair page',
  },
  'publication-audit-relational-identities': {
    file: 'backend/services/post-publication/identity-snapshots.test.mts',
    fullName:
      'bounded publication identity snapshots > detects and repairs exact relational audit discrepancies',
  },
  'entity-reconciliation-cursor': {
    file: 'backend/services/entity-listener-reconciliation/reconciliation.test.mts',
    fullName:
      'entity-listener reconciliation > resumes from the durable checkpoint with overlap and replica-lag margin',
  },
} as const
