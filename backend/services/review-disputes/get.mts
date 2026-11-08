import { assertNever } from '@modules/utils/assert-never'
import { read, write, type QueryExecutor, type QueryOptions } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import assert from 'http-assert'
import { DISPUTE_SLA_HOURS, type ReviewDisputeStatus } from './config.mts'
import type { ReviewDisputeResponse, ReviewDisputeSummary } from './types.mts'
import {
  DISPUTE_JOINS,
  DISPUTE_SELECT,
  DISPUTE_SUMMARY_JOINS,
  DISPUTE_SUMMARY_SELECT,
} from './get-query.mts'

function addIsOverdue<T extends { status: ReviewDisputeStatus; created_at: Date }>(
  dispute: T,
  now: Date,
): T {
  if (dispute.status !== 'pending') return dispute
  const ageHours = (now.getTime() - dispute.created_at.getTime()) / 3_600_000
  return { ...dispute, is_overdue: ageHours > DISPUTE_SLA_HOURS }
}

export async function getReviewDisputeById(
  id: string,
  now: Date = new Date(),
): Promise<ReviewDisputeResponse | null> {
  return queryReviewDisputeById(id, read, now)
}

/** Reads from the primary, or through `options.query` to see the caller's own uncommitted rows. */
export async function getReviewDisputeByIdFromPrimary(
  id: string,
  options?: QueryOptions,
  now: Date = new Date(),
): Promise<ReviewDisputeResponse | null> {
  return queryReviewDisputeById(
    id,
    statement => write(statement, { ...options, readOnly: false }),
    now,
  )
}

async function queryReviewDisputeById(
  id: string,
  query: QueryExecutor,
  now: Date,
): Promise<ReviewDisputeResponse | null> {
  const { rows } = await query<ReviewDisputeResponse>(
    sql`/* getReviewDisputeById */
    SELECT `
      .append(DISPUTE_SELECT)
      .append(sql`
    FROM review_disputes rd
    `)
      .append(DISPUTE_JOINS).append(sql`
    WHERE rd.id = ${id}
    LIMIT 1
  `),
  )
  const row = rows[0]
  return row ? addIsOverdue(row, now) : null
}

export async function getReviewDisputeAfterMutation(
  id: string,
  options?: QueryOptions,
  now: Date = new Date(),
): Promise<ReviewDisputeResponse> {
  const dispute = await getReviewDisputeByIdFromPrimary(id, options, now)
  assert(dispute, 500, 'Dispute disappeared after mutation')
  return dispute
}

export type ListReviewDisputesOptions = {
  status?: ReviewDisputeStatus
  limit?: number
  beforeId?: string | null
  disputantUserId?: string | null
  now?: Date
}

export async function listReviewDisputes(
  options: ListReviewDisputesOptions = {},
): Promise<{ disputes: ReviewDisputeSummary[]; hasNextPage: boolean }> {
  const { status = 'pending', limit = 25, beforeId, disputantUserId, now = new Date() } = options
  const fetchLimit = limit + 1

  const query = sql`/* listReviewDisputes */
    SELECT `
    .append(DISPUTE_SUMMARY_SELECT)
    .append(sql`
    FROM review_disputes rd
    `)
    .append(DISPUTE_SUMMARY_JOINS).append(sql`
    WHERE `)
  query.append(reviewDisputeStatusPredicate(status))
  query.append(sql`
  `)
  if (disputantUserId) {
    query.append(sql` AND rd.disputant_user_id = ${disputantUserId}`)
  }
  if (beforeId) {
    query.append(sql` AND rd.id < ${beforeId}`)
  }
  query.append(sql` ORDER BY rd.id DESC LIMIT ${fetchLimit}`)

  const { rows } = await read<ReviewDisputeSummary>(query)
  const disputes = rows.map(dispute => addIsOverdue(dispute, now))
  const hasNextPage = disputes.length > limit
  return { disputes: disputes.slice(0, limit), hasNextPage }
}

function reviewDisputeStatusPredicate(status: ReviewDisputeStatus): SQLStatement {
  switch (status) {
    case 'pending':
      return sql`rd.resolved_at IS NULL`
    case 'dismissed':
      return sql`rd.resolved_at IS NOT NULL AND rd.resolution_action = 'dismiss'`
    case 'resolved':
      return sql`rd.resolved_at IS NOT NULL AND rd.resolution_action != 'dismiss'`
    default:
      return assertNever(status, 'Unknown review dispute status')
  }
}

export async function listDisputesForPost(postId: string): Promise<ReviewDisputeResponse[]> {
  const { rows } = await read<ReviewDisputeResponse>(
    sql`/* listDisputesForPost */
    SELECT `
      .append(DISPUTE_SELECT)
      .append(sql`
    FROM review_disputes rd
    `)
      .append(DISPUTE_JOINS).append(sql`
    WHERE rd.post_id = ${postId}
    ORDER BY rd.id DESC
  `),
  )
  return rows
}
