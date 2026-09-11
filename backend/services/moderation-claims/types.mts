import type { ModerationQueueClaim } from '@voucha/types/entities/moderation-queue-claim'

// Canonical definition lives in @voucha/types/entities/moderation-queue-claim; re-exported here
// since this service, its consumers, and community-pending-reports.mts all reference this type
// by the historical `@services/moderation-claims/types` path.
export type { ModerationQueueClaim } from '@voucha/types/entities/moderation-queue-claim'

export type ClaimResult = {
  claim: ModerationQueueClaim
  /** true if the active claim is held by someone else */
  claimed_by_other: boolean
}
