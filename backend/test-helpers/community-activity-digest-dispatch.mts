import { beginTransaction, read, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createOwnedSqlFixtureLifetime } from './owned-sql-fixture-lifetime.mts'
import { acquireTestPostgresAdvisoryLock } from './postgres-advisory-lock.mts'

import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'

const DIGEST_LOCK_NAMESPACE = 2_135_042
const DIGEST_LOCK_KEY = 1

/** Owns one rollback-only singleton projection and each admitted SQL operation. */
export async function withTestCommunityActivityDigestCursor<T>(
  sentThrough: Date | null,
  run: (
    query: QueryExecutor,
    owner: ReturnType<typeof createOwnedSqlFixtureLifetime>,
  ) => Promise<T>,
): Promise<T> {
  let lock: Awaited<ReturnType<typeof acquireTestPostgresAdvisoryLock>> | undefined
  let transaction: Awaited<ReturnType<typeof beginTransaction>> | undefined
  const owner = createOwnedSqlFixtureLifetime(async () => {
    try {
      await transaction?.[Symbol.asyncDispose]()
    } finally {
      await lock?.release()
    }
  })
  return owner.withBody(async () => {
    await owner.prepare(async () => {
      lock = await acquireTestPostgresAdvisoryLock({
        namespace: DIGEST_LOCK_NAMESPACE,
        key: DIGEST_LOCK_KEY,
        timeout: '20s',
      })
      transaction = await beginTransaction()
    })
    const query = new Proxy(transaction!, {
      apply(target, thisArgument, parameters: Parameters<QueryExecutor>) {
        return owner.run(() => Reflect.apply(target, thisArgument, parameters))
      },
    })
    if (sentThrough) {
      await query(sql`/* withTestCommunityActivityDigestCursor:seed */
        INSERT INTO community_activity_digest_cursors (is_singleton, sent_through_at)
        VALUES (TRUE, ${sentThrough})
        ON CONFLICT (is_singleton) DO UPDATE SET sent_through_at = EXCLUDED.sent_through_at`)
    } else {
      await query(sql`/* withTestCommunityActivityDigestCursor:vacate */
        DELETE FROM community_activity_digest_cursors WHERE is_singleton`)
    }
    return run(query, owner)
  })
}

export function getTestCommunityActivityDigestQueueConnection() {
  return { connection: workerQueueConnection, prefix: workerQueuePrefix }
}

export async function readTestCommunityActivityDigestCursor(query: QueryExecutor): Promise<Date> {
  const { rows } = await query<{ sent_through_at: Date }>(sql`
    /* readTestCommunityActivityDigestCursor */
    SELECT sent_through_at FROM community_activity_digest_cursors WHERE is_singleton`)
  if (!rows[0]) throw new Error('Expected digest cursor singleton')
  return rows[0].sent_through_at
}

export async function readTestCommunityActivityDigestDelivery(userId: string, windowStart: Date) {
  const { rows } = await read<{ notification_count: number; intent_count: number }>(sql`
    /* readTestCommunityActivityDigestDelivery */
    SELECT COUNT(DISTINCT n.id)::integer AS notification_count,
      COUNT(DISTINCT i.notification_id)::integer AS intent_count
    FROM notifications n
    LEFT JOIN notification_push_intents i ON i.user_id = n.user_id AND i.notification_id = n.id
    WHERE n.user_id = ${userId}::uuid
      AND n.event_key = ${`community-activity-digest:${windowStart.toISOString()}`}
  `)
  return rows[0] ?? { notification_count: 0, intent_count: 0 }
}

export function beforeTestDigestUserId(userId: string): string {
  const hex = (BigInt(`0x${userId.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
