import { write } from '@data-stores/psql'
import { ValkeyCache } from '@data-stores/valkey/cache'
import { primaryCacheValkeyClient } from '@data-stores/valkey/clients'
import type { CommunityMember } from '@voucha/types/entities/community'
import sql from 'sql-template-strings'

const userCache = new ValkeyCache({
  prefix: 'community-memberships-by-user',
  ttlSeconds: 60,
  staleRefresh: false,
  client: primaryCacheValkeyClient,
})
const moderatorCache = new ValkeyCache({
  prefix: 'community-moderators',
  ttlSeconds: 60,
  staleRefresh: false,
  client: primaryCacheValkeyClient,
})

// Fetch one extra row so even concurrent limit overshoot never truncates a result.
export const COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES = {
  moderators_per_community: 1000,
  communities_per_user: 10_000,
}
const USER_CACHE_LIMIT = COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES.communities_per_user + 1
const MODERATOR_CACHE_LIMIT = COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES.moderators_per_community + 1

const loadUserMemberships = userCache.cacheGetByAny(async (userId: string) => {
  const { rows } = await write<CommunityMember>(sql`/* membershipCache:user */
    SELECT id, community_id, user_id, role, approved_by_id, created_at, updated_at, removed_at, removed_by_id
    FROM community_members
    WHERE user_id = ${userId} AND removed_at IS NULL
    ORDER BY id LIMIT ${USER_CACHE_LIMIT}`)
  return rows
})

const loadModerators = moderatorCache.cacheGetByAny(async (communityId: string) => {
  const { rows } = await write<{ user_id: string }>(sql`/* membershipCache:moderators */
    SELECT user_id FROM community_members
    WHERE community_id = ${communityId} AND role IN ('owner', 'moderator') AND removed_at IS NULL
    LIMIT ${MODERATOR_CACHE_LIMIT}`)
  return rows.map(row => row.user_id)
})

export async function getCachedUserMemberships(userId: string): Promise<CommunityMember[] | null> {
  const rows = await loadUserMemberships(userId)
  if (!rows || rows.length >= USER_CACHE_LIMIT) return null
  return rows.map(row => ({
    ...row,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    removed_at: row.removed_at ? new Date(row.removed_at) : null,
  }))
}

export async function getCachedCommunityModerators(communityId: string): Promise<string[]> {
  const rows = await loadModerators(communityId)
  if (!rows || rows.length >= MODERATOR_CACHE_LIMIT) {
    throw new Error('Community moderator list exceeds the supported limit')
  }
  return rows
}

export async function invalidateCommunityMembershipCaches(
  userIds: readonly string[],
  communityIds: readonly string[],
): Promise<void> {
  await ValkeyCache.deleteFromCaches([
    { cache: userCache, keys: [...new Set(userIds)] },
    { cache: moderatorCache, keys: [...new Set(communityIds)] },
  ])
}
