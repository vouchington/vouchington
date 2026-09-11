import { createCodedError } from '@modules/on-error/create-coded-error'
import { TAG_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { getContributionLimitTier } from '@services/contribution-gating/limits'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { EntityRelationMetadata } from '@voucha/types/entities/entity-relations-metadata'
import { getManualTagLimit } from './config.mts'
import { countUserOriginatedTagRelations } from './count.mts'

// Enforces the standing per-(subject, relation) cap on tags a user manually *adds* (requirement 1
// of #8246). This never gates voting on an existing tag -- voting writes to the relation's
// separate `__votes` table, not a new row in `relation.table_name`, so it never appears in the
// count below.
//
// `subjectId` is `string | null`: pass `null` when the subject doesn't exist yet (e.g. a post
// being created in the same request that will own the tags) -- there is trivially no existing
// row for a subject that hasn't been inserted, so the count is skipped and `used` is treated as 0.
export async function assertWithinTagAddLimit(
  currentUser: PrivateUser,
  membershipPlan: ContributionLimitMembershipPlan,
  relation: EntityRelationMetadata,
  subjectId: string | null,
  incomingObjectCount: number,
): Promise<void> {
  const tier = getContributionLimitTier(currentUser, membershipPlan)
  if (tier === 'admin') return

  const limit = getManualTagLimit(tier)
  const used =
    subjectId === null
      ? 0
      : await countUserOriginatedTagRelations(relation, subjectId, currentUser.id)
  if (used + incomingObjectCount > limit) {
    throw createCodedError(
      403,
      `You've reached your tag limit (${limit}) for this ${relation.subject_type}. Upgrade your membership to add more tags.`,
      TAG_LIMIT_REACHED,
    )
  }
}

export function assertWithinStandingTagLimit(
  currentUser: PrivateUser,
  membershipPlan: ContributionLimitMembershipPlan,
  existingCount: number,
  finalCount: number,
): void {
  const tier = getContributionLimitTier(currentUser, membershipPlan)
  if (tier === 'admin') return

  const limit = getManualTagLimit(tier)
  if (finalCount > Math.max(existingCount, limit)) {
    throw createCodedError(
      403,
      `You've reached your tag limit (${limit}) for this post. Upgrade your membership to add more tags.`,
      TAG_LIMIT_REACHED,
    )
  }
}
