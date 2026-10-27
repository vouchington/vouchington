import { ACTIVITYPUB_INBOX_STORAGE_POLICY } from '@modules/activitypub-inbox-storage-policy'

export const RECOVERY_INTERVAL_MS = 300_000
export const CLEANUP_INTERVAL_MS = ACTIVITYPUB_INBOX_STORAGE_POLICY.cleanupIntervalMs
// The HTTP handler inserts the envelope, then enqueues. Recovery must not spend a
// replacement while that enqueue is still in flight.
export const INBOX_RECOVERY_ENQUEUE_GRACE_MS = 60_000
