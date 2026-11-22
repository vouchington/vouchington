import {
  getRetainedUnarmedOAuthExchangeClaims,
  type RetainedOAuthExchangeClaim,
} from './authorization-exchange-recovery-ownership.mts'
import { beginTransaction, write } from '@data-stores/psql'
import { recoverableOAuthAuthorizationPageSql } from './authorization-exchange-recovery-page-sql.mts'
import { observeSharedDbScope } from '@data-stores/psql/shared-db-scope-observer'
import { sharedDbIdsScope } from '@vouchington/postgres/query-telemetry'
import {
  MAX_EXCHANGE_ATTEMPTS,
  STALE_EXCHANGE_CLAIM_SECONDS,
  X_MAX_QUEUE_DELAY_SECONDS,
} from './authorization-exchange-state.mts'
import { getOAuthAuthorizationExchangeWorkLimit } from './work-limits.mts'

export async function getRecoverableOAuthAuthorizationIds(
  limit = getOAuthAuthorizationExchangeWorkLimit('authorization_exchange_recovery_batch_size'),
  authorizationIds?: readonly string[],
  retainedClaim?: RetainedOAuthExchangeClaim,
): Promise<{ ids: string[]; hasMore: boolean }> {
  if (authorizationIds?.length === 0) return { ids: [], hasMore: false }
  const batchSize = Math.min(
    limit,
    getOAuthAuthorizationExchangeWorkLimit('authorization_exchange_recovery_batch_size'),
  )
  observeSharedDbScope('getRecoverableOAuthAuthorizationIds', sharedDbIdsScope(authorizationIds))
  const idScope = authorizationIds ? [...authorizationIds] : null
  await using transaction = await beginTransaction()
  await transaction(
    '/* getRecoverableOAuthAuthorizationIds:isolation */ SET TRANSACTION ISOLATION LEVEL READ COMMITTED',
  )
  const parameters = [
    batchSize,
    STALE_EXCHANGE_CLAIM_SECONDS,
    MAX_EXCHANGE_ATTEMPTS,
    X_MAX_QUEUE_DELAY_SECONDS,
    idScope,
  ]
  const page = await transaction<{ id: string; exchange_claim_id: string | null }>(
    recoverableOAuthAuthorizationPageSql,
    parameters,
  )
  const candidateIds = page.rows.map(row => row.id)
  if (candidateIds.length === 0) {
    await transaction.commit()
    return { ids: [], hasMore: false }
  }
  const retainedClaims = await getRetainedUnarmedOAuthExchangeClaims(
    transaction,
    candidateIds,
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
       JOIN UNNEST($5::uuid[], $6::uuid[]) AS candidate(id, claim_id)
         ON candidate.id = flow.id AND candidate.claim_id IS NOT DISTINCT FROM flow.exchange_claim_id
       WHERE flow.status IN ('callback_received', 'exchanging')
         AND flow.expires_at > CURRENT_TIMESTAMP
         AND NOT EXISTS (
           SELECT 1 FROM UNNEST($7::uuid[], $8::uuid[]) AS retained(id, claim_id)
           WHERE retained.id = current_flow.id AND retained.claim_id = current_flow.exchange_claim_id
         )
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
     JOIN UNNEST($5::uuid[], $6::uuid[]) AS candidate(id, claim_id)
       ON candidate.id = flow.id AND candidate.claim_id IS NOT DISTINCT FROM flow.exchange_claim_id
     WHERE flow.status IN ('callback_received', 'exchanging')
       AND flow.expires_at > CURRENT_TIMESTAMP
       AND (
         EXISTS (
           SELECT 1 FROM UNNEST($7::uuid[], $8::uuid[]) AS retained(id, claim_id)
           WHERE retained.id = current_flow.id AND retained.claim_id = current_flow.exchange_claim_id
         )
         OR (
           current_flow.status = 'callback_received' AND current_flow.exchange_attempts < $3
           AND (current_flow.provider <> 'x' OR current_flow.callback_received_at > CURRENT_TIMESTAMP - make_interval(secs => $4))
         )
       )
     ORDER BY current_flow.id ASC
     LIMIT $1`,
    [
      batchSize,
      STALE_EXCHANGE_CLAIM_SECONDS,
      MAX_EXCHANGE_ATTEMPTS,
      X_MAX_QUEUE_DELAY_SECONDS,
      candidateIds,
      page.rows.map(row => row.exchange_claim_id),
      retainedClaims.map(receipt => receipt.id),
      retainedClaims.map(receipt => receipt.claimId),
    ],
  )
  await transaction.commit()
  return {
    ids: rows.map(row => String(row.id)),
    // A full terminal bucket can produce no ids because it was terminalized. The next scheduled
    // dispatcher run resumes from the durable recovery predicate in either case.
    hasMore: candidateIds.length >= batchSize,
  }
}

export async function deleteExpiredOAuthAuthorizationBatch(
  limit: number,
  options: { authorizationIds?: readonly string[] } = {},
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
       WHERE expires_at <= CURRENT_TIMESTAMP
         AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))
       ORDER BY expires_at ASC, id ASC
       LIMIT $1
     )`,
    [limit, idScope],
  )
  return rowCount ?? 0
}
