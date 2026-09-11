import { createHash } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { CONFLICT } from '@modules/on-error/error-codes'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import sql from 'sql-template-strings'
import { mapWebPushSubscriptionRow } from './shared.mts'

type PushSubscriptionInput = {
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  expirationTimeMs?: number | null
  userAgent?: string
}

export async function listWebPushSubscriptionsPage(
  userId: string,
  options: { limit?: number; after?: string } = {},
) {
  const limit = options.limit ?? 25
  const scope = `push-subscriptions:${userId}`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : null
  const query = sql`/* listWebPushSubscriptions */
    SELECT subscription.id, subscription.user_id, subscription.endpoint, subscription.p256dh,
      subscription.auth, subscription.expiration_time_ms::text AS expiration_time_ms,
      subscription.user_agent, subscription.last_success_at, subscription.last_failure_at,
      subscription.created_at, subscription.updated_at
    FROM web_push_subscriptions subscription
    INNER JOIN web_push_endpoint_owners owner
      ON owner.user_id = subscription.user_id
      AND owner.subscription_id = subscription.id
      AND owner.endpoint = subscription.endpoint
    WHERE subscription.user_id = ${userId}
      AND subscription.deleted_at IS NULL`
  if (afterId) query.append(sql` AND subscription.id < ${afterId}`)
  query.append(sql` ORDER BY subscription.id DESC LIMIT ${limit + 1}`)
  const { rows } = await write(query)
  const hasNextPage = rows.length > limit
  const results = rows
    .slice(0, limit)
    .map(row => mapWebPushSubscriptionRow(row as Record<string, unknown>))
  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results[0] ? encodeScopedUuidCursor(results[0].id, scope) : null,
      end_cursor:
        hasNextPage && results.at(-1) ? encodeScopedUuidCursor(results.at(-1)!.id, scope) : null,
    },
  }
}

/** Claims endpoint ownership and always creates a fresh browser activation generation. */
export async function upsertWebPushSubscription(input: PushSubscriptionInput) {
  const endpointDigest = createHash('sha256').update(input.endpoint).digest('hex')
  await using transaction = await beginTransaction()
  await transaction(sql`/* lockWebPushEndpointOwner */
    SELECT pg_advisory_xact_lock(hashtextextended(${`web-push-endpoint:${endpointDigest}`}, 0))`)
  const existing = await transaction<{ endpoint: string }>(sql`/* getWebPushEndpointOwner */
    SELECT endpoint
    FROM web_push_endpoint_owners
    WHERE endpoint_digest = decode(${endpointDigest}, 'hex')
    FOR UPDATE`)
  assertWebPushEndpointOwnerMatches(input.endpoint, existing.rows[0]?.endpoint)
  await transaction(sql`/* releaseWebPushEndpointOwner */
    UPDATE web_push_subscriptions subscription
    SET deleted_at = CURRENT_TIMESTAMP
    FROM web_push_endpoint_owners owner
    WHERE owner.endpoint_digest = decode(${endpointDigest}, 'hex')
      AND subscription.user_id = owner.user_id
      AND subscription.id = owner.subscription_id
      AND subscription.deleted_at IS NULL`)
  const { rows } = await transaction(sql`/* createWebPushSubscriptionGeneration */
    INSERT INTO web_push_subscriptions (
      user_id, endpoint, p256dh, auth, expiration_time_ms, user_agent
    ) VALUES (
      ${input.userId}, ${input.endpoint}, ${input.p256dh}, ${input.auth},
      ${input.expirationTimeMs ?? null}, ${input.userAgent ?? ''}
    ) RETURNING id, user_id, endpoint, p256dh, auth,
      expiration_time_ms::text AS expiration_time_ms, user_agent, last_success_at,
      last_failure_at, created_at, updated_at`)
  const subscription = rows[0] as Record<string, unknown>
  await transaction(sql`/* claimWebPushEndpointOwner */
    INSERT INTO web_push_endpoint_owners (endpoint_digest, endpoint, user_id, subscription_id)
    VALUES (decode(${endpointDigest}, 'hex'), ${input.endpoint}, ${input.userId}, ${subscription.id})
    ON CONFLICT (endpoint_digest) DO UPDATE
    SET endpoint = EXCLUDED.endpoint,
        user_id = EXCLUDED.user_id,
        subscription_id = EXCLUDED.subscription_id,
        updated_at = CURRENT_TIMESTAMP`)
  await transaction.commit()
  return mapWebPushSubscriptionRow(subscription)
}

/** Exact comparison is the second line of defense for a theoretical SHA-256 collision. */
export function assertWebPushEndpointOwnerMatches(endpoint: string, ownedEndpoint?: string) {
  if (ownedEndpoint !== undefined && ownedEndpoint !== endpoint)
    throw createCodedError(409, 'Web Push endpoint digest collision.', CONFLICT)
}

export async function deleteWebPushSubscription(userId: string, subscriptionId: string) {
  const { rowCount } = await write(sql`/* deleteWebPushSubscription */
    WITH removed_owner AS (
      DELETE FROM web_push_endpoint_owners
      USING web_push_subscriptions subscription
      WHERE web_push_endpoint_owners.user_id = ${userId}
        AND web_push_endpoint_owners.subscription_id = ${subscriptionId}::uuid
        AND subscription.user_id = web_push_endpoint_owners.user_id
        AND subscription.id = web_push_endpoint_owners.subscription_id
        AND subscription.endpoint = web_push_endpoint_owners.endpoint
      RETURNING web_push_endpoint_owners.user_id, web_push_endpoint_owners.subscription_id,
        web_push_endpoint_owners.endpoint
    )
    UPDATE web_push_subscriptions subscription
    SET deleted_at = CURRENT_TIMESTAMP
    FROM removed_owner owner
    WHERE subscription.user_id = owner.user_id
      AND subscription.id = owner.subscription_id
      AND subscription.endpoint = owner.endpoint
      AND subscription.deleted_at IS NULL`)
  return (rowCount ?? 0) > 0
}

/** A stale or foreign binding is deliberately a no-op so logout cannot revoke another owner. */
export async function deleteExactWebPushSubscription(
  userId: string,
  binding: { endpoint: string; subscriptionId: string },
): Promise<void> {
  await write(sql`/* deleteExactWebPushSubscription */
    WITH removed_owner AS (
      DELETE FROM web_push_endpoint_owners
      WHERE user_id = ${userId}
        AND subscription_id = ${binding.subscriptionId}::uuid
        AND endpoint = ${binding.endpoint}
      RETURNING user_id, subscription_id
    )
    UPDATE web_push_subscriptions subscription
    SET deleted_at = CURRENT_TIMESTAMP
    FROM removed_owner owner
    WHERE subscription.user_id = owner.user_id
      AND subscription.id = owner.subscription_id
      AND subscription.endpoint = ${binding.endpoint}
      AND subscription.deleted_at IS NULL`)
}
