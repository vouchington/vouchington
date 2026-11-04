import { COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES } from '@services/entity-cache/community-memberships'
export { COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES } from '@services/entity-cache/community-memberships'
import { DynamicConfig } from '@data-stores/valkey'
import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'
import sql from 'sql-template-strings'
import { createCodedError } from '@vouchington/sentry'
import {
  COMMUNITY_MEMBERSHIP_LIMIT_REACHED,
  COMMUNITY_MODERATOR_LIMIT_REACHED,
} from '@modules/on-error/error-codes'

const DEFAULT_VALUES = { moderators_per_community: 100, communities_per_user: 1000 }

export const communityMembershipLimitsConfig = new DynamicConfig({
  key: 'community-membership-limits-config',
  fieldTypes: { moderators_per_community: 'number', communities_per_user: 'number' },
  defaultFields: DEFAULT_VALUES,
})

export function getCommunityMembershipLimits(): {
  moderatorsPerCommunity: number
  communitiesPerUser: number
} {
  return {
    moderatorsPerCommunity: getBoundedPositiveIntegerField(
      communityMembershipLimitsConfig,
      'moderators_per_community',
      {
        defaultValue: DEFAULT_VALUES.moderators_per_community,
        maxValue: COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES.moderators_per_community,
      },
    ),
    communitiesPerUser: getBoundedPositiveIntegerField(
      communityMembershipLimitsConfig,
      'communities_per_user',
      {
        defaultValue: DEFAULT_VALUES.communities_per_user,
        maxValue: COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES.communities_per_user,
      },
    ),
  }
}

/** Call inside the insertion transaction. All admissions take this user-wide fence. */
export async function assertCommunityMembershipCapacity(
  currentUserId: string,
  communityId: string,
  options: QueryOptions,
): Promise<void> {
  await write(
    sql`/* assertCommunityMembershipCapacity:lock */
    SELECT pg_advisory_xact_lock(hashtextextended('community-membership-admission:' || ${currentUserId}, 0))
  `,
    options,
  )
  const limit = getCommunityMembershipLimits().communitiesPerUser
  const { rows } = await write<{ count: number; existing: boolean }>(
    sql`
    /* assertCommunityMembershipCapacity */
    SELECT (
      SELECT count(*)::int FROM (
        SELECT 1 FROM community_members cm
        -- One keyed community probe per membership avoids hashing unrelated communities.
        JOIN LATERAL (
          SELECT 1 FROM communities c
          WHERE c.id = cm.community_id AND c.deleted_at IS NULL LIMIT 1
        ) live_community ON TRUE
        WHERE cm.user_id = ${currentUserId} AND cm.removed_at IS NULL
        LIMIT ${limit}
      ) capped
    ) AS count,
    COALESCE((
      SELECT true FROM community_members
      WHERE community_id = ${communityId} AND user_id = ${currentUserId} AND removed_at IS NULL
      LIMIT 1
    ), false) AS existing
  `,
    options,
  )
  // Approval is idempotent for an existing member, even after the limit was lowered.
  if (!rows[0]!.existing && rows[0]!.count >= limit) {
    throw createCodedError(
      409,
      'Community membership limit reached',
      COMMUNITY_MEMBERSHIP_LIMIT_REACHED,
    )
  }
}

/** The caller holds the community membership-role fence until commit. */
export async function assertCommunityModeratorCapacity(
  communityId: string,
  options: QueryOptions,
): Promise<void> {
  const limit = getCommunityMembershipLimits().moderatorsPerCommunity
  const { rows } = await write<{ count: number }>(
    sql`
    /* assertCommunityModeratorCapacity */
    SELECT count(*)::int AS count FROM (
      SELECT 1 FROM community_members
      WHERE community_id = ${communityId} AND removed_at IS NULL
        AND role IN ('owner', 'moderator')
      ORDER BY user_id
      LIMIT ${limit}
    ) capped
  `,
    options,
  )
  if (rows[0]!.count >= limit) {
    throw createCodedError(
      409,
      'Community moderator limit reached',
      COMMUNITY_MODERATOR_LIMIT_REACHED,
    )
  }
}
