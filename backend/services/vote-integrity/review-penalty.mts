import { write } from '@data-stores/psql'
import { getPaginationLimits } from '@services/pagination'
import {
  decodeScopedPreciseTimestampCursor,
  parseBoundedIntegerLimit,
  encodeScopedPreciseTimestampCursor,
} from '@modules/pagination'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import type { VoteWeightPenalty } from './revoke-penalty.mts'

type VoteWeightPenaltyReviewDue = VoteWeightPenalty & { user_username: string | null }

/** One bounded, independently navigable page of due active penalties. */
export async function getVoteWeightPenaltyReviewsDue(
  options: { after?: string; limit?: number } = {},
) {
  const limit = parseBoundedIntegerLimit(options.limit, { min: 1, ...getPaginationLimits(25, 25) })
  const scope = 'vote-integrity:penalty-reviews:due:asc'
  const after = options.after
    ? decodeScopedPreciseTimestampCursor(options.after, scope, 'Invalid penalty review cursor')
    : undefined
  const query = sql`/* getVoteWeightPenaltyReviewsDue */
    WITH due AS MATERIALIZED (
      SELECT id, user_id, penalty_multiplier, reason, source_flag_id, created_by_id, revoked_at, revoked_by_id, reviewed_at, reviewed_by_id, review_due_at, created_at,
        to_char(review_due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_timestamp
      FROM vote_weight_penalties
      WHERE revoked_at IS NULL AND review_due_at <= CURRENT_TIMESTAMP`
  if (after)
    query.append(
      sql` AND (review_due_at, id) > (${after.timestamp}::timestamptz, ${after.id}::uuid)`,
    )
  query.append(sql`
      ORDER BY review_due_at, id LIMIT ${limit + 1}
    )
    SELECT due.id, due.user_id, due.penalty_multiplier, due.reason, due.source_flag_id, due.created_by_id, due.revoked_at, due.revoked_by_id, due.reviewed_at, due.reviewed_by_id, due.review_due_at, due.created_at, profile.username AS user_username, due.cursor_timestamp
    FROM due LEFT JOIN view_users_public profile ON profile.id = due.user_id
    ORDER BY due.review_due_at, due.id
  `)
  const { rows } = await write<VoteWeightPenaltyReviewDue & { cursor_timestamp: string }>(query)
  const page = rows.slice(0, limit)
  const cursorFor = (row: (typeof page)[number]) =>
    encodeScopedPreciseTimestampCursor(row.cursor_timestamp, row.id, scope)
  const last = page.at(-1)
  return {
    results: page.map(({ cursor_timestamp: _, ...penalty }) => penalty),
    page_info: {
      has_next_page: rows.length > limit,
      start_cursor: page[0] ? cursorFor(page[0]) : null,
      end_cursor: rows.length > limit && last ? cursorFor(last) : null,
    },
  }
}

/** Confirm that an active penalty remains warranted, scheduling its next annual review. */
export async function reviewVoteWeightPenalty(
  penaltyId: string,
  reviewedById: string,
): Promise<VoteWeightPenalty> {
  const { rows } = await write<VoteWeightPenalty>(sql`/* reviewVoteWeightPenalty */
    UPDATE vote_weight_penalties
    SET reviewed_at = CURRENT_TIMESTAMP,
        reviewed_by_id = ${reviewedById},
        review_due_at = CURRENT_TIMESTAMP + interval '12 months'
    WHERE id = ${penaltyId} AND revoked_at IS NULL
      AND review_due_at <= CURRENT_TIMESTAMP
    RETURNING id, user_id, penalty_multiplier, reason, source_flag_id, created_by_id,
      revoked_at, revoked_by_id, reviewed_at, reviewed_by_id, review_due_at, created_at
  `)
  const penalty = rows[0]
  if (!penalty) throw createHttpError(404, 'Active vote weight penalty not found')
  return penalty
}
