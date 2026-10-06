import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  observeSharedDbScope,
  sharedDbCursorScope,
  sharedDbIdsScope,
} from '@data-stores/psql/shared-db-scope-observer'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { getPendingCopyrightStaffCase } from './read-models-staff-case.mts'
import { copyrightStaffQueueKeysSql } from './read-models-staff-queue-sql.mts'
import { isCopyrightTrustedFlaggerPriorityEnabled } from './config.mts'
import { findCurrentCopyrightJurisdictionPolicy } from './jurisdiction-policy.mts'
import type {
  CopyrightStaffQueueCase,
  CopyrightStaffQueueReason,
} from './read-models-staff-types.mts'

// Names the `(tier, waiting_since, id)` ascending keyset below; cursors encoded under another
// scope are rejected, so a cursor from a different list or ordering can never seek into this one.
export const copyrightStaffQueueCursorScope =
  'copyright-notices:staff-queue:tier-asc-waiting-since-asc-id-asc'

export type CopyrightStaffQueueCursor = { tier: number; timestamp: string; id: string }
type QueuedCase = CopyrightStaffQueueCase & { cursor: CopyrightStaffQueueCursor }

/**
 * Lists actionable cases by urgency: missed restoration deadlines first, then deadlines past
 * escalation, then everything else by how long its oldest open item has waited.
 */
export async function listCopyrightStaffQueue(
  currentUser: PrivateUser,
  options: { limit: number; after?: CopyrightStaffQueueCursor; noticeIds?: readonly string[] },
): Promise<{
  cases: QueuedCase[]
  endCursor: CopyrightStaffQueueCursor | null
  hasNextPage: boolean
}> {
  assertNotSuspended(currentUser)
  if (!currentUserCanReviewCopyrightNotices(currentUser)) {
    return { cases: [], endCursor: null, hasNextPage: false }
  }
  if (options.noticeIds?.length === 0) return { cases: [], endCursor: null, hasNextPage: false }
  const trustedFlaggerBoost =
    (await isCopyrightTrustedFlaggerPriorityEnabled()) &&
    (await findCurrentCopyrightJurisdictionPolicy('eu_dsa')) !== null
  observeSharedDbScope(
    'listCopyrightStaffQueue',
    options.noticeIds
      ? sharedDbIdsScope(options.noticeIds)
      : sharedDbCursorScope(options.after?.id),
  )
  const noticeIds = options.noticeIds ? [...options.noticeIds] : null
  await using transaction = await beginTransaction()
  const query = sql`/* listPendingCopyrightStaffCases */`.append(
    copyrightStaffQueueKeysSql({ trustedFlaggerBoost }),
  ).append(sql`
    SELECT queue_key.id, queue_key.urgency, queue_key.tier, queue_key.reasons, queue_key.waiting_since,
      to_char(queue_key.waiting_since AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        AS cursor_waiting_since,
      next_deadline.escalation_at, next_deadline.restoration_deadline_at
    FROM queue_key
    LEFT JOIN LATERAL (
      SELECT deadline.escalation_at, deadline.restoration_deadline_at
      FROM copyright_notice_deadlines deadline
      WHERE deadline.copyright_notice_id = queue_key.id
        AND deadline.resolved_at IS NULL AND deadline.cancelled_at IS NULL
      ORDER BY deadline.escalation_at, deadline.id
      LIMIT 1
    ) next_deadline ON true
  `)
  if (options.after || noticeIds) {
    query.append(sql` WHERE true`)
    if (noticeIds) query.append(sql` AND queue_key.id = ANY(${noticeIds}::uuid[])`)
    if (options.after) {
      query.append(sql`
        AND (queue_key.tier, queue_key.waiting_since, queue_key.id)
          > (${options.after.tier}::int, ${options.after.timestamp}::timestamptz, ${options.after.id}::uuid)`)
    }
  }
  query.append(sql`
    ORDER BY queue_key.tier, queue_key.waiting_since, queue_key.id
    LIMIT ${options.limit + 1}
  `)
  const { rows } = await transaction<QueueKeyRow>(query)
  const cases = await Promise.all(
    rows.slice(0, options.limit).map(async row => {
      const staffCase = await getPendingCopyrightStaffCase(row.id, transaction)
      return staffCase ? { ...staffCase, ...queueFields(row), cursor: cursorFor(row) } : null
    }),
  )
  await transaction.commit()
  const last = rows.length > options.limit ? rows[options.limit - 1] : undefined
  return {
    cases: cases.filter((item): item is QueuedCase => item !== null),
    endCursor: last ? cursorFor(last) : null,
    hasNextPage: rows.length > options.limit,
  }
}

type QueueKeyRow = {
  id: string
  urgency: number
  tier: number
  reasons: CopyrightStaffQueueReason[]
  waiting_since: Date
  cursor_waiting_since: string
  escalation_at: Date | null
  restoration_deadline_at: Date | null
}

function queueFields(
  row: QueueKeyRow,
): Pick<CopyrightStaffQueueCase, 'reasons' | 'waiting_since' | 'next_deadline'> {
  return {
    reasons: row.reasons,
    waiting_since: row.waiting_since,
    next_deadline:
      row.escalation_at && row.restoration_deadline_at
        ? { escalation_at: row.escalation_at, restoration_deadline_at: row.restoration_deadline_at }
        : null,
  }
}

function cursorFor(row: QueueKeyRow): CopyrightStaffQueueCursor {
  return { tier: row.tier, timestamp: row.cursor_waiting_since, id: row.id }
}
