import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { COMMUNITY_BANNED } from '@modules/on-error/error-codes'
import sql from 'sql-template-strings'
import type { CommunityBan } from '../types.mts'

export async function getCommunityBanById(id: string): Promise<CommunityBan | null> {
  const { rows } = await read(
    sql`/* getCommunityBanById */
    SELECT *
    FROM community_bans
    WHERE id = ${id}
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
    SELECT *
    FROM community_bans
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
      AND lifted_at IS NULL
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    ORDER BY id DESC
    LIMIT 1
    `,
    options,
  )
  return (rows[0] as CommunityBan) ?? null
}

export async function getActiveCommunityBans(
  communityId: string,
  userId: string,
  options?: QueryOptions,
): Promise<CommunityBan[]> {
  const { rows } = await read(
    sql`/* getActiveCommunityBans */
    SELECT *
    FROM community_bans
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
      AND lifted_at IS NULL
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    ORDER BY id DESC
    `,
    options,
  )
  return rows as CommunityBan[]
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
