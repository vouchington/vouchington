import { getMinUuidv7ForDate } from '@modules/utils'
import type { TransactionQuery } from '@data-stores/psql'

export type CleanupName =
  | 'email_address_login_tokens'
  | 'phone_number_login_tokens'
  | 'user_sessions'
  | 'web_push_subscriptions'

export type Candidate = { id: string; user_id?: string; position_at: string | null }
export type Cursor = {
  cursor_at: string | null
  cursor_id: string | null
  cursor_partition_key: string | null
  sweep_cutoff_at: Date | null
}

async function listCandidates(
  query: TransactionQuery,
  name: 'user_sessions' | 'web_push_subscriptions',
  cutoff: Date,
  limit: number,
  cursor?: Cursor,
  lowerBoundDate?: Date,
): Promise<Candidate[]> {
  const timestampColumn = name === 'user_sessions' ? 'expires_at' : 'deleted_at'
  const alias = name === 'web_push_subscriptions' ? 'subscription' : 'source'
  const parameters: unknown[] = [cutoff]
  let predicate = `${alias}.${timestampColumn} < $1::timestamptz`
  if (name === 'web_push_subscriptions') predicate += ` AND ${alias}.deleted_at IS NOT NULL`
  if (lowerBoundDate) {
    parameters.push(lowerBoundDate)
    predicate += ` AND ${alias}.${timestampColumn} >= $${parameters.length}::timestamptz`
  }
  if (cursor?.cursor_id) {
    if (name === 'web_push_subscriptions') {
      parameters.push(cursor.cursor_at, cursor.cursor_id, cursor.cursor_partition_key)
      predicate += ` AND (${alias}.${timestampColumn}, ${alias}.id, ${alias}.user_id) > ($${parameters.length - 2}::timestamptz, $${parameters.length - 1}::uuid, $${parameters.length}::uuid)`
    } else {
      parameters.push(cursor.cursor_at, cursor.cursor_id)
      predicate += ` AND (${alias}.${timestampColumn}, ${alias}.id) > ($${parameters.length - 1}::timestamptz, $${parameters.length}::uuid)`
    }
  }
  parameters.push(limit)
  const columns = name === 'web_push_subscriptions' ? `${alias}.user_id, ` : ''
  // PostgreSQL timestamps have microsecond precision; node-postgres Date parsing loses three digits.
  const position = `${alias}.${timestampColumn}::text`
  const order =
    name === 'web_push_subscriptions'
      ? `${alias}.${timestampColumn}, ${alias}.id, ${alias}.user_id`
      : `${alias}.${timestampColumn}, ${alias}.id`
  // lock-reason: prevents: an expired user_sessions row cascading a newly minted grant; writer: mintNativeSessionMcpToken writes oauth_grants.
  // lock-reason: prevents: a web_push_subscriptions tombstone deletion cascading a newly admitted receipt; writer: persistClaimedNotificationPushOutcome writes notification_push_intent_subscription_receipts.
  const { rows } = await query<Candidate>(
    `/* listAuthSessionRetentionCandidates */
     -- cross-partition: expiry and tombstone retention must inspect every partition through each child index
     SELECT ${columns}${alias}.id, ${position} AS position_at
     FROM ${name} ${alias}
     WHERE ${predicate}
     ORDER BY ${order}
     LIMIT $${parameters.length}
     FOR UPDATE OF ${alias} SKIP LOCKED`,
    parameters,
  )
  return rows
}

export async function deleteExpiredLoginTokens(
  query: TransactionQuery,
  name: 'email_address_login_tokens' | 'phone_number_login_tokens',
  sweepCutoff: Date,
  batchSize: number,
  cursor: Cursor | undefined,
  lowerBoundDate: Date | undefined,
): Promise<{ page: Candidate[]; deleted: number }> {
  const parameters: unknown[] = [getMinUuidv7ForDate(sweepCutoff)]
  let predicate = `id < $1::uuid`
  if (lowerBoundDate) {
    parameters.push(getMinUuidv7ForDate(lowerBoundDate))
    predicate += ` AND id >= $${parameters.length}::uuid`
  }
  if (cursor?.cursor_id) {
    parameters.push(cursor.cursor_id)
    predicate += ` AND id > $${parameters.length}::uuid`
  }
  parameters.push(batchSize)
  const { rows } = await query<{ id: string }>(
    `/* deleteAuthSessionRetentionTokenPage */
     DELETE FROM ${name}
     WHERE id = ANY(ARRAY(
       SELECT id FROM ${name} WHERE ${predicate} ORDER BY id LIMIT $${parameters.length}
     )) AND ${predicate}
     RETURNING id`,
    parameters,
  )
  return {
    page: rows
      .map(row => ({ id: row.id, position_at: null }))
      .toSorted((a, b) => a.id.localeCompare(b.id)),
    deleted: rows.length,
  }
}

export async function deleteProtectedAuthSessionPage(
  query: TransactionQuery,
  name: 'user_sessions' | 'web_push_subscriptions',
  sweepCutoff: Date,
  batchSize: number,
  cursor: Cursor | undefined,
  lowerBoundDate: Date | undefined,
): Promise<{ page: Candidate[]; deleted: number }> {
  const page = await listCandidates(query, name, sweepCutoff, batchSize, cursor, lowerBoundDate)
  if (page.length === 0) return { page, deleted: 0 }

  const ids = page.map(row => row.id)
  const result =
    name === 'web_push_subscriptions'
      ? await query(
          `/* deleteWebPushSubscriptionTombstonePage */
           DELETE FROM web_push_subscriptions subscription
           WHERE subscription.user_id = ANY($1::uuid[])
           AND (subscription.user_id, subscription.id) IN (
             SELECT * FROM unnest($1::uuid[], $2::uuid[])
           )
           AND NOT EXISTS (
             SELECT 1 FROM notification_push_intent_subscription_receipts receipt
             WHERE receipt.user_id = subscription.user_id
               AND receipt.subscription_id = subscription.id
           )`,
          [
            page.map(row => {
              if (!row.user_id) throw new Error('Push subscription candidate lacks user_id')
              return row.user_id
            }),
            ids,
          ],
        )
      : await query(
          `/* deleteAuthSessionRetentionPage */
           DELETE FROM user_sessions WHERE id = ANY($1::uuid[])`,
          [ids],
        )
  return { page, deleted: result.rowCount ?? 0 }
}
