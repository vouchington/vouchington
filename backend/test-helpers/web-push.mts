import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type TestWebPushEndpointOwner = {
  user_id: string
  subscription_id: string
}

type TestWebPushEndpointOwnershipReplacement = {
  release: () => Promise<void>
  replace: (input: {
    userId: string
    endpoint: string
    staleSubscriptionId: string
  }) => Promise<string>
  [Symbol.asyncDispose]: () => Promise<void>
}

/** Holds an endpoint owner row until `replace` atomically replaces its generation. */
export async function holdTestWebPushEndpointOwnershipReplacement(
  endpoint: string,
): Promise<
  TestWebPushEndpointOwnershipReplacement & { hasBlockedOperation: () => Promise<boolean> }
> {
  const transaction = await beginTransaction()
  let settled = false
  async function rollbackIfUnsettled(): Promise<void> {
    if (settled) return
    settled = true
    await transaction.rollback()
  }
  async function release(): Promise<void> {
    if (settled) return
    await transaction.commit()
    settled = true
  }
  try {
    const { rows } = await transaction<{ pid: number }>(sql`
      /* holdTestWebPushEndpointOwnershipReplacement.pid */
      SELECT pg_backend_pid() AS pid
      FROM web_push_endpoint_owners
      WHERE endpoint = ${endpoint}
      FOR UPDATE`)
    const holderPid = rows[0]!.pid
    return {
      release,
      replace: async input => {
        try {
          await transaction(sql`/* replaceTestWebPushEndpointOwnershipReplacement.delete */
            UPDATE web_push_subscriptions
            SET deleted_at = CURRENT_TIMESTAMP
            WHERE user_id = ${input.userId} AND id = ${input.staleSubscriptionId}::uuid`)
          const { rows: inserted } = await transaction<{ id: string }>(sql`
            /* replaceTestWebPushEndpointOwnershipReplacement.insert */
            INSERT INTO web_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
            VALUES (${input.userId}, ${input.endpoint}, ${'c'.repeat(32)}, ${'d'.repeat(16)}, 'vitest')
            RETURNING id`)
          const subscriptionId = inserted[0]!.id
          await transaction(sql`/* replaceTestWebPushEndpointOwnershipReplacement.owner */
            UPDATE web_push_endpoint_owners
            SET subscription_id = ${subscriptionId}::uuid
            WHERE endpoint = ${input.endpoint}`)
          await release()
          return subscriptionId
        } catch (error) {
          await rollbackIfUnsettled()
          throw error
        }
      },
      hasBlockedOperation: async () => testWebPushTransactionHasWaiter(holderPid),
      [Symbol.asyncDispose]: rollbackIfUnsettled,
    }
  } catch (error) {
    await rollbackIfUnsettled()
    throw error
  }
}

export async function testWebPushSubscriptionRowLockAvailable(subscriptionId: string) {
  try {
    await write<{ id: string }>(sql`
      /* testWebPushSubscriptionRowLockAvailable */
      SELECT id
      FROM web_push_subscriptions
      WHERE id = ${subscriptionId}::uuid
      FOR UPDATE NOWAIT`)
    return true
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '55P03')
      return false
    throw error
  }
}

export async function getTestWebPushEndpointOwner(
  endpoint: string,
): Promise<TestWebPushEndpointOwner | undefined> {
  const { rows } = await read<TestWebPushEndpointOwner>(sql`/* getTestWebPushEndpointOwner */
    SELECT user_id, subscription_id FROM web_push_endpoint_owners WHERE endpoint = ${endpoint}`)
  return rows[0]
}

export async function getTestWebPushEndpointOwnerByDigest(
  endpointDigest: string,
): Promise<{ endpoint: string; subscription_id: string } | undefined> {
  const { rows } = await read<{ endpoint: string; subscription_id: string }>(sql`
    /* getTestWebPushEndpointOwnerByDigest */
    SELECT endpoint, subscription_id FROM web_push_endpoint_owners
    WHERE endpoint_digest = decode(${endpointDigest}, 'hex')`)
  return rows[0]
}

export async function getTestWebPushEndpointOwnershipCounts(endpoint: string): Promise<{
  ownerCount: number
  activeSubscriptionCount: number
}> {
  const { rows } = await read<{ owner_count: string; active_count: string }>(sql`
    /* getTestWebPushEndpointOwnershipCounts */
    SELECT
      (SELECT count(*)::text FROM web_push_endpoint_owners WHERE endpoint = ${endpoint}) AS owner_count,
      (SELECT count(*)::text FROM web_push_subscriptions
        WHERE endpoint = ${endpoint} AND deleted_at IS NULL) AS active_count`)
  return {
    ownerCount: Number(rows[0]!.owner_count),
    activeSubscriptionCount: Number(rows[0]!.active_count),
  }
}

async function testWebPushTransactionHasWaiter(holderPid: number): Promise<boolean> {
  const { rows } = await read<{ blocked: boolean }>(sql`
    /* testWebPushTransactionHasWaiter */
    SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity waiting
      WHERE ${holderPid} = ANY(pg_blocking_pids(waiting.pid))
    ) AS blocked`)
  return rows[0]?.blocked ?? false
}
