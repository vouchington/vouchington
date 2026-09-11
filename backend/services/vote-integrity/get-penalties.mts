import { read, write } from '@data-stores/psql'
import { decodeScopedUuidCursorWithLegacySimple, encodeScopedUuidCursor } from '@modules/pagination'
import sql from 'sql-template-strings'
import type { PageInfo } from '@voucha/types/pagination'
import type { VoteWeightPenalty } from './revoke-penalty.mts'

export type GetVoteWeightPenaltiesOptions = {
  status?: 'active' | 'revoked'
  source?: 'flag'
  userId?: string
  sourceFlagId?: string
  after?: string
  limit?: number
}

export type GetVoteWeightPenaltiesResult = {
  results: VoteWeightPenalty[]
  page_info: PageInfo
  filter_scope?: {
    source: 'flag'
    source_flag_id: string | null
  }
}

export async function getVoteWeightPenaltyByIdFromPrimary(
  penaltyId: string,
): Promise<VoteWeightPenalty | null> {
  const { rows } = await write(sql`/* getVoteWeightPenaltyByIdFromPrimary */
    SELECT
      id,
      user_id,
      penalty_multiplier,
      reason,
      source_flag_id,
      created_by_id,
      revoked_at,
      revoked_by_id,
      created_at
    FROM vote_weight_penalties
    WHERE id = ${penaltyId}
  `)
  return (rows[0] as VoteWeightPenalty | undefined) ?? null
}

export async function getVoteWeightPenalties(
  options: GetVoteWeightPenaltiesOptions = {},
): Promise<GetVoteWeightPenaltiesResult> {
  return getVoteWeightPenaltiesWithDatabaseRead(options, read)
}

export async function getVoteWeightPenaltiesByFlagIdFromPrimary(
  options: Omit<GetVoteWeightPenaltiesOptions, 'sourceFlagId'> & { sourceFlagId: string },
): Promise<GetVoteWeightPenaltiesResult> {
  return getVoteWeightPenaltiesWithDatabaseRead(options, write)
}

async function getVoteWeightPenaltiesWithDatabaseRead(
  options: GetVoteWeightPenaltiesOptions,
  databaseRead: typeof read,
): Promise<GetVoteWeightPenaltiesResult> {
  const { status, source, userId, sourceFlagId, after, limit = 25 } = options
  const clampedLimit = Math.min(Math.max(1, limit), 100)
  const cursorScope = buildVotePenaltyCursorScope({ status, source, userId, sourceFlagId })
  const afterId = after
    ? decodeScopedUuidCursorWithLegacySimple(after, cursorScope, 'Invalid cursor format').id
    : undefined

  const query = sql`/* getVoteWeightPenalties */
    SELECT
      id,
      user_id,
      penalty_multiplier,
      reason,
      source_flag_id,
      created_by_id,
      revoked_at,
      revoked_by_id,
      created_at
    FROM vote_weight_penalties
    WHERE TRUE
  `

  if (status === 'active') {
    query.append(sql` AND revoked_at IS NULL`)
  } else if (status === 'revoked') {
    query.append(sql` AND revoked_at IS NOT NULL`)
  }

  if (userId) {
    query.append(sql` AND user_id = ${userId}`)
  }

  if (source === 'flag') {
    query.append(sql` AND reason = 'voting_ring'`)
  }

  if (sourceFlagId) {
    query.append(sql` AND source_flag_id = ${sourceFlagId}`)
  }

  if (afterId) {
    query.append(sql` AND id < ${afterId}`)
  }

  query.append(sql` ORDER BY id DESC LIMIT ${clampedLimit + 1}`)

  const { rows } = await databaseRead(query)
  const penalties = rows as VoteWeightPenalty[]
  const hasNextPage = penalties.length > clampedLimit
  const results = hasNextPage ? penalties.slice(0, clampedLimit) : penalties
  const lastNode = results.at(-1)

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor: hasNextPage && lastNode ? encodeScopedUuidCursor(lastNode.id, cursorScope) : null,
      start_cursor: results[0] ? encodeScopedUuidCursor(results[0].id, cursorScope) : null,
    },
    ...(source === 'flag'
      ? { filter_scope: { source: 'flag' as const, source_flag_id: sourceFlagId ?? null } }
      : {}),
  }
}

function buildVotePenaltyCursorScope(
  options: Pick<GetVoteWeightPenaltiesOptions, 'status' | 'source' | 'userId' | 'sourceFlagId'>,
): string {
  return JSON.stringify({
    resource: 'vote-weight-penalties',
    status: options.status ?? 'all',
    source: options.source ?? 'all',
    user_id: options.userId ?? null,
    source_flag_id: options.sourceFlagId ?? null,
    order: 'id-desc',
  })
}
