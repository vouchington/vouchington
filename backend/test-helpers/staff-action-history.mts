import {
  beginTransaction,
  write,
  type QueryExecutor,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { rejectQuery } from './injected-failures.mts'

export async function readStaffActionHistory(actorId: string) {
  const { rows } = await write<{
    id: string
    post_id: string | null
    agent_moderation_id: string | null
    agent_moderation_post_id: string | null
    moderation_appeal_id: string | null
    review_dispute_id: string | null
    action_type: string
    metadata: Record<string, unknown>
    reason: string | null
    topic_claim_id: string | null
    report_id: string | null
    target_user_id: string | null
    oauth_client_id: string | null
    operation_request_action_id: string | null
  }>(
    sql`/* readStaffActionHistory */ SELECT * FROM moderator_actions WHERE actor_user_id = ${actorId} ORDER BY id`,
  )
  return rows
}

/** Only this executor's history insert fails; `finished` leaves the request insert durable. */
export function rejectStaffActionHistoryQuery<Query extends QueryExecutor>(
  query: Query,
  phase?: 'finished',
): Query {
  return rejectQuery(
    query,
    (statement, values) =>
      statement.startsWith('/* recordModeratorAction') &&
      statement.includes('moderator_actions') &&
      (!phase ||
        values.some(value => typeof value === 'string' && value.includes('"phase":"finished"'))),
    'staff history rejected for test',
  )
}

/** Wrap the primary writer for operations that commit intent outside a transaction. */
export function rejectStaffActionHistoryWrite(phase?: 'finished'): QueryExecutor {
  return rejectStaffActionHistoryQuery(write, phase)
}

/** Lend a rejecting query to one mutation; disposal rolls back any partial writes. */
export async function withRejectedStaffActionHistory<T>(
  execute: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  return await execute(rejectStaffActionHistoryQuery(transaction))
}

const HISTORY_TARGET_TABLES = {
  topic_claim: 'topic_claims',
  report: 'moderation_reports',
  report_claim: 'moderation_queue_claims',
  report_flag: 'report_integrity_flags',
  report_penalty: 'report_abuse_penalties',
  vote_flag: 'vote_integrity_flags',
  vote_penalty: 'vote_weight_penalties',
  note: 'user_moderator_notes',
  oauth_client: 'oauth_clients',
} as const

export async function readStaffActionTarget(kind: keyof typeof HISTORY_TARGET_TABLES, id: string) {
  const query = sql`/* readStaffActionTarget */ SELECT to_jsonb(target) AS state FROM `
  query.append(HISTORY_TARGET_TABLES[kind])
  query.append(sql` target WHERE id = ${id}`)
  const { rows } = await write<{ state: Record<string, unknown> }>(query)
  return rows[0]?.state ?? null
}

export async function readReportStaffClaims(reportId: string) {
  const { rows } = await write(sql`/* readReportStaffClaims */
    SELECT * FROM moderation_queue_claims WHERE report_id = ${reportId} ORDER BY id
  `)
  return rows
}
