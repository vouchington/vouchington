import {
  getRetainedUnarmedOAuthExchangeIds,
  type RetainedOAuthExchangeClaim,
} from './authorization-exchange-recovery-ownership.mts'
import { beginTransaction, write } from '@data-stores/psql'
import { recoverableOAuthAuthorizationRowLocksSql } from './authorization-exchange-row-locks-sql.mts'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import {
  MAX_EXCHANGE_ATTEMPTS,
  STALE_EXCHANGE_CLAIM_SECONDS,
  X_MAX_QUEUE_DELAY_SECONDS,
} from './authorization-exchange-state.mts'

export async function getRecoverableOAuthAuthorizationIds(
  limit = 500,
  authorizationIds?: readonly string[],
  retainedClaim?: RetainedOAuthExchangeClaim,
): Promise<string[]> {
  if (authorizationIds?.length === 0) return []
  observeSharedDbScope('getRecoverableOAuthAuthorizationIds', sharedDbIdsScope(authorizationIds))
  const idScope = authorizationIds ? [...authorizationIds] : null
  await using transaction = await beginTransaction()
  await transaction(
    '/* getRecoverableOAuthAuthorizationIds:isolation */ SET TRANSACTION ISOLATION LEVEL READ COMMITTED',
  )
  const parameters = [
    limit,
    STALE_EXCHANGE_CLAIM_SECONDS,
    MAX_EXCHANGE_ATTEMPTS,
    X_MAX_QUEUE_DELAY_SECONDS,
    idScope,
  ]
  const locked = await transaction<{ id: string }>(
    recoverableOAuthAuthorizationRowLocksSql,
    parameters,
  )
  const ownedIds = locked.rows.map(row => row.id)
  if (ownedIds.length === 0) {
    await transaction.commit()
    return []
  }
  const retainedIds = await getRetainedUnarmedOAuthExchangeIds(
    transaction,
    ownedIds,
    STALE_EXCHANGE_CLAIM_SECONDS,
    retainedClaim,
  )
  const { rows } = await transaction(
    `/* getRecoverableOAuthAuthorizationIds */
     WITH terminal_candidates AS (
       SELECT
         current_flow.id,
         current_flow.status,
         current_flow.updated_at,
         current_flow.exchange_claim_id,
         CASE
           WHEN current_flow.provider = 'x'
             AND current_flow.callback_received_at <=
               CURRENT_TIMESTAMP - make_interval(secs => $4)
             THEN 'provider_code_expired'
           WHEN current_flow.status = 'exchanging' THEN 'provider_exchange_outcome_unknown'
           WHEN current_flow.exchange_attempts >= $3 THEN 'provider_exchange_failed'
           ELSE 'provider_exchange_outcome_unknown'
         END AS callback_error
       FROM oauth_authorizations flow
       JOIN view_oauth_authorization_current_records current_flow ON current_flow.id = flow.id
       WHERE flow.status IN ('callback_received', 'exchanging')
         AND flow.expires_at > CURRENT_TIMESTAMP
         AND ($5::uuid[] IS NULL OR flow.id = ANY($5::uuid[]))
         AND NOT (flow.id = ANY($6::uuid[]))
         AND (
           (current_flow.status = 'exchanging'
             AND current_flow.exchange_started_at < clock_timestamp() - make_interval(secs => $2))
           OR (
             current_flow.exchange_attempts >= $3
             AND (
               current_flow.status = 'callback_received'
               OR (
                 current_flow.status = 'exchanging'
                 AND current_flow.exchange_started_at < clock_timestamp() - make_interval(secs => $2)
               )
             )
           )
           OR (
             current_flow.provider = 'x'
             AND (
               current_flow.status = 'callback_received'
               OR (
                 current_flow.status = 'exchanging'
                 AND current_flow.exchange_started_at < clock_timestamp() - make_interval(secs => $2)
               )
             )
             AND current_flow.callback_received_at <=
               CURRENT_TIMESTAMP - make_interval(secs => $4)
           )
         )
       ORDER BY current_flow.id ASC
       LIMIT $1
     ),
     terminalized AS (
       UPDATE oauth_authorizations
       SET rejected_at = COALESCE(rejected_at, clock_timestamp()),
           callback_error = terminal_candidates.callback_error,
           callback_code_ciphertext = NULL,
           exchange_claim_id = NULL
       FROM terminal_candidates
       WHERE oauth_authorizations.id = terminal_candidates.id
         AND oauth_authorizations.status = 'callback_received'
         AND oauth_authorizations.updated_at = terminal_candidates.updated_at
         AND oauth_authorizations.exchange_claim_id
           IS NOT DISTINCT FROM terminal_candidates.exchange_claim_id
       RETURNING oauth_authorizations.id
     )
     SELECT current_flow.id
     FROM oauth_authorizations flow
     JOIN view_oauth_authorization_current_records current_flow ON current_flow.id = flow.id
     WHERE flow.status IN ('callback_received', 'exchanging')
       AND flow.expires_at > CURRENT_TIMESTAMP
       AND ($5::uuid[] IS NULL OR flow.id = ANY($5::uuid[]))
       AND (
         current_flow.id = ANY($6::uuid[])
         OR (
           current_flow.status = 'callback_received' AND current_flow.exchange_attempts < $3
           AND (current_flow.provider <> 'x' OR current_flow.callback_received_at > CURRENT_TIMESTAMP - make_interval(secs => $4))
         )
       )
     ORDER BY current_flow.id ASC
     LIMIT $1`,
    [
      limit,
      STALE_EXCHANGE_CLAIM_SECONDS,
      MAX_EXCHANGE_ATTEMPTS,
      X_MAX_QUEUE_DELAY_SECONDS,
      ownedIds,
      retainedIds,
    ],
  )
  await transaction.commit()
  return rows.map(row => String(row.id))
}

export async function deleteExpiredOAuthAuthorizationBatch(
  limit: number,
  options: { lowerBoundDate?: Date; now?: Date; authorizationIds?: readonly string[] } = {},
): Promise<number> {
  if (options.authorizationIds?.length === 0) return 0
  observeSharedDbScope(
    'deleteExpiredOAuthAuthorizationBatch',
    sharedDbIdsScope(options.authorizationIds),
  )
  const idScope = options.authorizationIds ? [...options.authorizationIds] : null
  const { rowCount } = await write(
    `/* deleteExpiredOAuthAuthorizationBatch */ DELETE FROM oauth_authorizations
     WHERE id IN (
       SELECT id
       FROM oauth_authorizations
       WHERE expires_at <= COALESCE($3::timestamptz, CURRENT_TIMESTAMP)
         AND ($2::timestamptz IS NULL OR expires_at >= $2)
         AND ($4::uuid[] IS NULL OR id = ANY($4::uuid[]))
       ORDER BY expires_at ASC, id ASC
       LIMIT $1
     )`,
    [limit, options.lowerBoundDate ?? null, options.now ?? null, idScope],
  )
  return rowCount ?? 0
}
