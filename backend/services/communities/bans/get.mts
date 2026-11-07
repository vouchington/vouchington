import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { createCodedError } from '@vouchington/sentry'
import { COMMUNITY_BANNED } from '@modules/on-error/error-codes'
import sql from 'sql-template-strings'
import type { CommunityBan } from '../types.mts'

export async function getCommunityBanById(id: string): Promise<CommunityBan | null> {
  const { rows } = await read(
    sql`/* getCommunityBanById */
    SELECT id, case_id, community_id, user_id, banned_by_id, reason, expires_at,
      created_at, updated_at, lifted_at, lifted_by_id
    FROM community_bans
    WHERE id = ${id}
    LIMIT 1
    `,
  )
  return (rows[0] as CommunityBan) ?? null
}

export async function getCommunityBanDetail(
  communityId: string,
  banId: string,
): Promise<CommunityBan | null> {
  const { rows } = await read(
    sql`/* getCommunityBanDetail */
    SELECT id, case_id, community_id, user_id, banned_by_id, reason, expires_at,
      created_at, updated_at, lifted_at, lifted_by_id
    FROM community_bans
    WHERE id = ${banId} AND community_id = ${communityId}
    LIMIT 1
    `,
  )
  return (rows[0] as CommunityBan) ?? null
}

export async function getActiveCommunityBan(
  communityId: string,
  userId: string,
  options?: QueryOptions,
): Promise<CommunityBan | null> {
  const { rows } = await read(
    sql`/* getActiveCommunityBan */
    SELECT id, case_id, community_id, user_id, banned_by_id, reason, expires_at,
      created_at, updated_at, lifted_at, lifted_by_id
    FROM community_bans
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
      AND lifted_at IS NULL
      AND COALESCE(expires_at, 'infinity'::timestamptz) > CURRENT_TIMESTAMP
    ORDER BY id DESC
    LIMIT 1
    `,
    options,
  )
  return (rows[0] as CommunityBan) ?? null
}

export async function assertNotBanned(
  communityId: string,
  userId: string,
  options?: QueryOptions,
): Promise<void> {
  const ban = await getActiveCommunityBan(communityId, userId, options)
  if (ban) {
    throw createCodedError(403, 'You are banned from this community', COMMUNITY_BANNED)
  }
}
