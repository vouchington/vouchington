import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CommunityBan, CommunityBanEvasionFlag } from '@voucha/types/entities/community'
import { openOrGetOpenCase } from './_moderation-case-support.mts'

type InsertTestCommunityBanOptions = {
  communityId: string
  userId: string
  bannedById: string
  reason?: string | null
  expiresAt?: Date | null
  liftedAt?: Date | null
  liftedById?: string | null
}

export async function insertTestCommunityBan(
  options: InsertTestCommunityBanOptions,
): Promise<CommunityBan> {
  const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: options.userId })
  const { rows } = await write(
    sql`/* insertTestCommunityBan */
    INSERT INTO community_bans (community_id, user_id, banned_by_id, reason, expires_at, lifted_at, lifted_by_id, case_id)
    VALUES (
      ${options.communityId}, ${options.userId}, ${options.bannedById},
      ${options.reason ?? null}, ${options.expiresAt ?? null},
      ${options.liftedAt ?? null}, ${options.liftedById ?? null},
      ${caseId}
    )
    RETURNING *
    `,
  )
  return rows[0] as CommunityBan
}

type SetTestBanEvasionFlagOptions = {
  communityId: string
  userId: string
  sourceUserId: string
  score?: number
}

export async function setTestBanEvasionFlag(
  options: SetTestBanEvasionFlagOptions,
): Promise<CommunityBanEvasionFlag> {
  const { rows } = await write(
    sql`/* setTestBanEvasionFlag */
    UPDATE community_members
    SET suspected_ban_evader_at = CURRENT_TIMESTAMP,
        suspected_ban_evader_source_user_id = ${options.sourceUserId},
        suspected_ban_evader_score = ${options.score ?? 0.8}
    WHERE community_id = ${options.communityId}
      AND user_id = ${options.userId}
    RETURNING
      community_id,
      user_id,
      suspected_ban_evader_at,
      suspected_ban_evader_source_user_id,
      suspected_ban_evader_score,
      suspected_ban_evader_dismissed_at,
      suspected_ban_evader_dismissed_by_id
    `,
  )
  return rows[0] as CommunityBanEvasionFlag
}

export type BanEvasionFlagState = {
  suspected_ban_evader_at: Date | null
  suspected_ban_evader_dismissed_at: Date | null
  suspected_ban_evader_dismissed_by_id: string | null
}

export async function getTestBanEvasionFlagState(
  communityId: string,
  userId: string,
): Promise<BanEvasionFlagState | null> {
  const { rows } = await read<BanEvasionFlagState>(
    sql`/* getTestBanEvasionFlagState */
    SELECT suspected_ban_evader_at, suspected_ban_evader_dismissed_at, suspected_ban_evader_dismissed_by_id
    FROM community_members
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
    LIMIT 1
    `,
  )
  return rows[0] ?? null
}

export async function getTestActiveCommunityBan(
  communityId: string,
  userId: string,
): Promise<CommunityBan | null> {
  const { rows } = await read<CommunityBan>(
    sql`/* getTestActiveCommunityBan */
    SELECT * FROM community_bans
    WHERE community_id = ${communityId}
      AND user_id = ${userId}
      AND lifted_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1
    `,
  )
  return rows[0] ?? null
}
