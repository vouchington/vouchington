import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { buildBlueskyAuthorizationExpiryPredicate } from './bluesky-authorization-expiry-predicate.mts'

type ExpiredAuthorization = {
  id: string
  user_id: string
  claimed_did: string | null
}

export async function deleteAbandonedBlueskyLinkSessionBatch(
  cutoffDate: Date,
  batchSize: number,
  lowerBoundDate?: Date,
): Promise<number> {
  return await deleteExpiredAuthorizations(
    ['pending', 'callback_claimed'],
    cutoffDate,
    batchSize,
    lowerBoundDate,
  )
}

export async function deleteExpiredBlueskyHandoffBatch(
  batchSize: number,
  options: { lowerBoundDate?: Date; now?: Date } = {},
): Promise<number> {
  const cutoffDate = options.now ?? new Date()
  const completionDeletes = await deleteExpiredNonHandoffCompletions(
    cutoffDate,
    batchSize,
    options.lowerBoundDate,
  )
  if (completionDeletes === batchSize) return completionDeletes
  const authorizationDeletes = await deleteExpiredAuthorizations(
    ['handoff_ready'],
    cutoffDate,
    batchSize - completionDeletes,
    options.lowerBoundDate,
  )
  return completionDeletes + authorizationDeletes
}

async function deleteExpiredNonHandoffCompletions(
  cutoffDate: Date,
  batchSize: number,
  lowerBoundDate?: Date,
): Promise<number> {
  await using query = await beginTransaction()
  const statement = sql`/* deleteExpiredNonHandoffCompletions */
    DELETE FROM bluesky_link_completions completion
    USING (
      SELECT completion.authorization_id
      FROM bluesky_link_completions completion
      JOIN bluesky_link_authorizations link_auth
        ON link_auth.id = completion.authorization_id
      WHERE completion.expires_at < ${cutoffDate}
  `
  if (lowerBoundDate !== undefined) {
    statement.append(sql` AND completion.expires_at >= ${lowerBoundDate}`)
  }
  statement.append(sql`
        AND link_auth.status <> 'handoff_ready'
      ORDER BY completion.expires_at, completion.authorization_id
      LIMIT ${batchSize}
      FOR UPDATE OF completion SKIP LOCKED
    ) target
    WHERE completion.authorization_id = target.authorization_id`)
  const { rowCount } = await query(statement)
  const result = rowCount ?? 0

  await query.commit()
  return result
}

async function deleteExpiredAuthorizations(
  statuses: string[],
  cutoffDate: Date,
  batchSize: number,
  lowerBoundDate?: Date,
): Promise<number> {
  await using query = await beginTransaction()

  const targets = await findExpiredAuthorizations(
    statuses,
    cutoffDate,
    batchSize,
    lowerBoundDate,
    query,
  )
  if (targets.length === 0) {
    await query.commit()
    return 0
  }
  await lockAuthorizationOwners(targets, query)
  const expiredAuthorizations = await expireExactAuthorizations(
    targets,
    statuses,
    cutoffDate,
    lowerBoundDate,
    query,
  )
  await query.commit()
  return expiredAuthorizations
}

async function findExpiredAuthorizations(
  statuses: string[],
  cutoffDate: Date,
  batchSize: number,
  lowerBoundDate: Date | undefined,
  query: TransactionQuery,
): Promise<ExpiredAuthorization[]> {
  const statement = sql`/* findExpiredBlueskyAuthorizations */
    SELECT id, user_id, claimed_did
    FROM bluesky_link_authorizations link_auth
    WHERE link_auth.status = ANY(${statuses}::text[])
      AND (`
  statement.append(
    buildBlueskyAuthorizationExpiryPredicate('link_auth', cutoffDate, lowerBoundDate),
  )
  statement.append(sql`)
    ORDER BY link_auth.expires_at ASC, link_auth.id ASC
    LIMIT ${batchSize}`)
  const { rows } = await query<ExpiredAuthorization>(statement)
  return rows
}

async function lockAuthorizationOwners(
  targets: ExpiredAuthorization[],
  query: TransactionQuery,
): Promise<void> {
  const userIds = [...new Set(targets.map(target => target.user_id))].sort()
  await query(sql`/* expireBlueskyAuthorizations:lockUsers */
    WITH ordered_users AS MATERIALIZED (
      SELECT user_id FROM unnest(${userIds}::uuid[]) AS user_id ORDER BY user_id
    )
    SELECT pg_advisory_xact_lock(hashtextextended(user_id::text, 0)) FROM ordered_users`)
  const dids = targets.flatMap(target => (target.claimed_did ? [target.claimed_did] : [])).sort()
  if (dids.length > 0) {
    await query(sql`/* expireBlueskyAuthorizations:lockDids */
      WITH ordered_dids AS MATERIALIZED (
        SELECT did FROM unnest(${dids}::text[]) AS did ORDER BY did
      )
      SELECT pg_advisory_xact_lock(hashtextextended(did, 1)) FROM ordered_dids`)
  }
}

async function expireExactAuthorizations(
  targets: ExpiredAuthorization[],
  statuses: string[],
  cutoffDate: Date,
  lowerBoundDate: Date | undefined,
  query: TransactionQuery,
): Promise<number> {
  const authorizationIds = targets.map(target => target.id)
  await query(sql`/* expireBlueskyAuthorizations:lock */
    SELECT id FROM bluesky_link_authorizations
    WHERE id = ANY(${authorizationIds}::uuid[])
    ORDER BY id
    FOR UPDATE`)
  const updateStatement = sql`/* expireBlueskyAuthorizations:update */
    UPDATE bluesky_link_authorizations
    SET status = 'expired', handle = NULL
    WHERE id = ANY(${authorizationIds}::uuid[])
      AND status = ANY(${statuses}::text[])
      AND (`
  updateStatement.append(
    buildBlueskyAuthorizationExpiryPredicate(
      'bluesky_link_authorizations',
      cutoffDate,
      lowerBoundDate,
    ),
  )
  updateStatement.append(sql`)
    RETURNING id`)
  const { rows: expired } = await query<{ id: string }>(updateStatement)
  const expiredIds = expired.map(record => record.id)
  if (expiredIds.length > 0) {
    await query(sql`/* expireBlueskyAuthorizations:accounts */
      DELETE FROM bluesky_linked_accounts
      WHERE link_authorization_id = ANY(${expiredIds}::uuid[])
        AND user_id IS NULL`)
  }
  return expiredIds.length
}
