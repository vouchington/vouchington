import { write } from '@data-stores/psql'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import {
  MAX_EXCHANGE_ATTEMPTS,
  STALE_EXCHANGE_CLAIM_SECONDS,
  X_MAX_QUEUE_DELAY_SECONDS,
} from './authorization-exchange-state.mts'

export async function getRecoverableOAuthAuthorizationIds(
  limit = 500,
  authorizationIds?: readonly string[],
): Promise<string[]> {
  if (authorizationIds?.length === 0) return []
  observeSharedDbScope('getRecoverableOAuthAuthorizationIds', sharedDbIdsScope(authorizationIds))
  const idScope = authorizationIds ? [...authorizationIds] : null
  const { rows } = await write(
    `/* getRecoverableOAuthAuthorizationIds */
     WITH terminal_candidates AS (
       SELECT
         id,
         status,
         updated_at,
         exchange_claim_id,
         CASE
           WHEN provider = 'x'
             AND callback_received_at <=
               CURRENT_TIMESTAMP - make_interval(secs => $4)
             THEN 'provider_code_expired'
           ELSE 'provider_exchange_failed'
         END AS callback_error
       FROM oauth_authorization_current_records
       WHERE expires_at > CURRENT_TIMESTAMP
         AND ($5::uuid[] IS NULL OR id = ANY($5::uuid[]))
         AND (
           (
             exchange_attempts >= $3
             AND (
               status = 'callback_received'
               OR (
                 status = 'exchanging'
                 AND exchange_started_at < clock_timestamp() - make_interval(secs => $2)
               )
             )
           )
           OR (
             provider = 'x'
             AND (
               status = 'callback_received'
               OR (
                 status = 'exchanging'
                 AND exchange_started_at < clock_timestamp() - make_interval(secs => $2)
               )
             )
             AND callback_received_at <=
               CURRENT_TIMESTAMP - make_interval(secs => $4)
           )
         )
       ORDER BY id ASC
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
     SELECT id
     FROM oauth_authorization_current_records
     WHERE expires_at > CURRENT_TIMESTAMP
       AND ($5::uuid[] IS NULL OR id = ANY($5::uuid[]))
       AND exchange_attempts < $3
       AND (
         provider <> 'x'
         OR callback_received_at >
           CURRENT_TIMESTAMP - make_interval(secs => $4)
       )
       AND (
         status = 'callback_received'
         OR (
           status = 'exchanging'
           AND exchange_started_at < clock_timestamp() - make_interval(secs => $2)
         )
       )
     ORDER BY id ASC
     LIMIT $1`,
    [
      limit,
      STALE_EXCHANGE_CLAIM_SECONDS,
      MAX_EXCHANGE_ATTEMPTS,
      X_MAX_QUEUE_DELAY_SECONDS,
      idScope,
    ],
  )
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
