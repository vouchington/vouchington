import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestVoteWeightPenalty = {
  id: string
  user_id: string
  penalty_multiplier: number
  reason: string
  created_by_id: string
  revoked_at: Date | null
}

export async function getTestPenaltiesByFlagId(flagId: string): Promise<TestVoteWeightPenalty[]> {
  const { rows } = await read(sql`/* getTestPenaltiesByFlagId */
    SELECT id, user_id, penalty_multiplier, reason, created_by_id, revoked_at
    FROM vote_weight_penalties
    WHERE source_flag_id = ${flagId}
  `)
  return rows as TestVoteWeightPenalty[]
}

export async function getTestPenaltiesByHostnameId(
  hostnameId: string,
): Promise<TestVoteWeightPenalty[]> {
  const { rows } = await read(sql`/* getTestPenaltiesByHostnameId */
    SELECT id, user_id, penalty_multiplier, reason, created_by_id, revoked_at
    FROM vote_weight_penalties
    WHERE source_hostname_id = ${hostnameId}
  `)
  return rows as TestVoteWeightPenalty[]
}

export async function getTestPenaltiesByPostId(
  postId: string,
  userId?: string,
): Promise<TestVoteWeightPenalty[]> {
  if (userId) {
    const { rows } = await read(sql`/* getTestPenaltiesByPostId */
      SELECT id, user_id, penalty_multiplier, reason, created_by_id, revoked_at
      FROM vote_weight_penalties
      WHERE source_post_id = ${postId}
        AND user_id = ${userId}
    `)
    return rows as TestVoteWeightPenalty[]
  }
  const { rows } = await read(sql`/* getTestPenaltiesByPostId */
    SELECT id, user_id, penalty_multiplier, reason, created_by_id, revoked_at
    FROM vote_weight_penalties
    WHERE source_post_id = ${postId}
  `)
  return rows as TestVoteWeightPenalty[]
}

export async function getTestPenaltiesByUserId(userId: string): Promise<TestVoteWeightPenalty[]> {
  const { rows } = await read(sql`/* getTestPenaltiesByUserId */
    SELECT id, user_id, penalty_multiplier, reason, created_by_id, revoked_at
    FROM vote_weight_penalties
    WHERE user_id = ${userId}
    ORDER BY id DESC
  `)
  return rows as TestVoteWeightPenalty[]
}

/**
 * Inserts a vote event directly into post_votes for testing detection services.
 * Uses a real postId (with FK constraint) and arbitrary ip/device/session values.
 */
export async function insertTestPostVote(
  postId: string,
  userId: string,
  ipAddress: string,
  score: number,
): Promise<void> {
  await write(sql`/* insertTestPostVote */
    INSERT INTO post_votes (post_id, user_id, score, ip_address)
    VALUES (${postId}, ${userId}, ${score}, ${ipAddress}::inet)
  `)
}

export async function insertTestVoteWeightPenalty(
  userId: string,
  createdById: string,
  penaltyMultiplier = 0.2,
): Promise<string> {
  return insertTestVoteWeightPenaltyRecord({ userId, createdById, penaltyMultiplier })
}

export async function insertTestVoteWeightPenaltyRecord(options: {
  userId: string
  createdById: string
  penaltyMultiplier?: number
  reason?: string
  sourceFlagId?: string
  revokedAt?: Date
  revokedById?: string
}): Promise<string> {
  const { rows } = await write(sql`/* insertTestVoteWeightPenalty */
    INSERT INTO vote_weight_penalties
      (user_id, penalty_multiplier, reason, source_flag_id, created_by_id, revoked_at, revoked_by_id)
    VALUES (
      ${options.userId},
      ${options.penaltyMultiplier ?? 0.2},
      ${options.reason ?? 'voting_ring'},
      ${options.sourceFlagId ?? null}::uuid,
      ${options.createdById},
      ${options.revokedAt ?? null},
      ${options.revokedById ?? null}::uuid
    )
    RETURNING id
  `)
  return (rows[0] as { id: string }).id
}

export async function insertTestVoteIntegrityFlag(params: {
  postId: string
  flagType?: 'velocity_spike' | 'ip_correlation'
}): Promise<string> {
  const { rows } = await write(sql`/* insertTestVoteIntegrityFlag */
    INSERT INTO vote_integrity_flags (post_id, flag_type)
    VALUES (${params.postId}::uuid, ${params.flagType ?? 'velocity_spike'})
    RETURNING id
  `)
  return (rows[0] as { id: string }).id
}
