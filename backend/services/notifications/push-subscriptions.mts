import { createHash } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { isUniqueViolation } from '@vouchington/postgres'
import { createCodedError } from '@vouchington/sentry'
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
      subscription.auth, subscription.expiration_time_milliseconds::text AS expiration_time_milliseconds,
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
  try {
    return await createWebPushSubscriptionGeneration(input)
  } catch (err) {
    if (isUniqueViolation(err)) {
      const conflict = createCodedError(
        409,
        'Concurrent Web Push subscription registration.',
        CONFLICT,
      )
      conflict.cause = err
      throw conflict
    }
    throw err
  }
}

async function createWebPushSubscriptionGeneration(input: PushSubscriptionInput) {
  const endpointDigest = createHash('sha256').update(input.endpoint).digest('hex')
  await using transaction = await beginTransaction()
  const existing = await transaction<{
    endpoint: string
    user_id: string
    subscription_id: string
  }>(sql`/* getWebPushEndpointOwner */
    SELECT endpoint, user_id, subscription_id
    FROM web_push_endpoint_owners
    WHERE endpoint_digest = decode(${endpointDigest}, 'hex')`)
  assertWebPushEndpointOwnerMatches(input.endpoint, existing.rows[0]?.endpoint)
  await transaction(sql`/* releaseWebPushEndpointOwner */
    UPDATE web_push_subscriptions subscription
    SET deleted_at = CURRENT_TIMESTAMP
    FROM web_push_endpoint_owners owner
    WHERE owner.endpoint_digest = decode(${endpointDigest}, 'hex')
      AND owner.user_id = ${existing.rows[0]?.user_id ?? null}::uuid
      AND owner.subscription_id = ${existing.rows[0]?.subscription_id ?? null}::uuid
      AND subscription.user_id = owner.user_id
      AND subscription.id = owner.subscription_id
      AND subscription.deleted_at IS NULL`)
  const { rows } = await transaction(sql`/* createWebPushSubscriptionGeneration */
    INSERT INTO web_push_subscriptions (
      user_id, endpoint, p256dh, auth, expiration_time_milliseconds, user_agent
    ) VALUES (
      ${input.userId}, ${input.endpoint}, ${input.p256dh}, ${input.auth},
      ${input.expirationTimeMs ?? null}, ${input.userAgent ?? ''}
    ) RETURNING id, user_id, endpoint, p256dh, auth,
      expiration_time_milliseconds::text AS expiration_time_milliseconds, user_agent, last_success_at,
      last_failure_at, created_at, updated_at`)
  const subscription = rows[0] as Record<string, unknown>
  const owner = await transaction(sql`/* claimWebPushEndpointOwner */
    INSERT INTO web_push_endpoint_owners (endpoint_digest, endpoint, user_id, subscription_id)
    VALUES (decode(${endpointDigest}, 'hex'), ${input.endpoint}, ${input.userId}, ${subscription.id})
    ON CONFLICT (endpoint_digest) DO UPDATE
    SET endpoint = EXCLUDED.endpoint,
        user_id = EXCLUDED.user_id,
        subscription_id = EXCLUDED.subscription_id
    WHERE web_push_endpoint_owners.endpoint = EXCLUDED.endpoint
      AND web_push_endpoint_owners.user_id = ${existing.rows[0]?.user_id ?? null}::uuid
      AND web_push_endpoint_owners.subscription_id = ${existing.rows[0]?.subscription_id ?? null}::uuid
    RETURNING subscription_id`)
  if (owner.rowCount !== 1)
    throw createCodedError(409, 'Concurrent Web Push endpoint ownership change.', CONFLICT)
  await transaction.commit()
  return mapWebPushSubscriptionRow(subscription)
}

/** Exact comparison is the second line of defense for a theoretical SHA-256 collision. */
export function assertWebPushEndpointOwnerMatches(endpoint: string, ownedEndpoint?: string) {
  if (ownedEndpoint !== undefined && ownedEndpoint !== endpoint)
    throw createCodedError(409, 'Web Push endpoint digest collision.', CONFLICT)
}

export async function deleteWebPushSubscription(userId: string, subscriptionId: string) {
  const { rowCount } = await write(
    sql`/* deleteWebPushSubscription */
    WITH retired AS (
      UPDATE web_push_subscriptions subscription
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE subscription.user_id = ${userId}
        AND subscription.id = ${subscriptionId}::uuid
        AND subscription.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM web_push_endpoint_owners owner
          WHERE owner.user_id = subscription.user_id
            AND owner.subscription_id = subscription.id
            AND owner.endpoint = subscription.endpoint
        )
      RETURNING subscription.user_id, subscription.id, subscription.endpoint
    )
    DELETE FROM web_push_endpoint_owners owner
    USING retired
    WHERE owner.user_id = retired.user_id
      AND owner.subscription_id = retired.id
      AND owner.endpoint = retired.endpoint`,
  )
  return (rowCount ?? 0) > 0
}

/** A stale or foreign binding is deliberately a no-op so logout cannot revoke another owner. */
export async function deleteExactWebPushSubscription(
  userId: string,
  binding: { endpoint: string; subscriptionId: string },
): Promise<void> {
  await write(
    sql`/* deleteExactWebPushSubscription */
    WITH retired AS (
      UPDATE web_push_subscriptions subscription
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE subscription.user_id = ${userId}
        AND subscription.id = ${binding.subscriptionId}::uuid
        AND subscription.endpoint = ${binding.endpoint}
        AND subscription.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM web_push_endpoint_owners owner
          WHERE owner.user_id = subscription.user_id
            AND owner.subscription_id = subscription.id
            AND owner.endpoint = subscription.endpoint
        )
      RETURNING subscription.user_id, subscription.id, subscription.endpoint
    )
    DELETE FROM web_push_endpoint_owners owner
    USING retired
    WHERE owner.user_id = retired.user_id
      AND owner.subscription_id = retired.id
      AND owner.endpoint = retired.endpoint`,
  )
}
