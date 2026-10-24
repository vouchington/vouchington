import {
  advisoryLockPool,
  beginTransaction,
  withTransactionOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { PostPublicationScope } from './types.mts'

export function postPublicationScopeIdentifier(scope: PostPublicationScope): string {
  switch (scope.type) {
    case 'post':
      return scope.postId
    case 'author':
      return scope.authorUserId
    case 'community':
      return scope.communityId
    case 'rss_feed':
      return scope.rssFeedId
    case 'topic_alias':
      return scope.topicAliasId
    case 'story':
      return scope.storyId
  }
}

export function postPublicationScopeLockKey(scope: PostPublicationScope): string {
  return `${scope.type}:${postPublicationScopeIdentifier(scope).toLowerCase()}`
}
export async function lockPostPublicationScope(
  query: TransactionQuery,
  scope: PostPublicationScope,
): Promise<void> {
  await query(
    `/* lockPostPublicationScope */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [postPublicationScopeLockKey(scope)],
  )
}
export async function lockAuthorPublicationLifecycle(
  query: TransactionQuery,
  authorUserId: string,
): Promise<void> {
  await lockPostPublicationScope(query, { type: 'author', authorUserId })
}
export async function lockPostPublication(query: TransactionQuery, postId: string): Promise<void> {
  await lockPostPublicationScope(query, { type: 'post', postId })
}

// A query object must not be reused to re-fence after rolling back a savepoint taken on it.
const topicRssFeedAttachmentIdsLockedInQuery = new WeakMap<TransactionQuery, Set<string>>()
const pendingTopicRssFeedAttachmentLocks = new WeakMap<TransactionQuery, Promise<void>>()

/** Serializes attachment of an RSS feed to an existing topic with topic merges. */
export async function lockTopicRssFeedAttachmentLifecycles(
  query: TransactionQuery,
  topicIds: readonly string[],
): Promise<void> {
  if (topicIds.length === 0) return
  const previous = pendingTopicRssFeedAttachmentLocks.get(query)
  const pending = (async () => {
    await previous?.catch(continueAfterAttachmentFenceFailure)
    const held = topicRssFeedAttachmentIdsLockedInQuery.get(query) ?? new Set<string>()
    const ids = [...new Set(topicIds.map(id => id.toLowerCase()))]
      .toSorted()
      .filter(id => !held.has(id))
    if (ids.length === 0) return
    await query(
      `/* lockTopicRssFeedAttachmentLifecycles */
      WITH ordered_ids AS MATERIALIZED (
        SELECT DISTINCT topic_id
        FROM UNNEST($1::uuid[]) AS ids(topic_id)
        ORDER BY topic_id
      )
      SELECT pg_advisory_xact_lock(hashtextextended('topic-rss-feed-attachment:' || topic_id::text, 0))
      FROM ordered_ids
      ORDER BY topic_id`,
      [ids],
    )
    for (const id of ids) held.add(id)
    topicRssFeedAttachmentIdsLockedInQuery.set(query, held)
  })()
  pendingTopicRssFeedAttachmentLocks.set(query, pending)
  try {
    await pending
  } finally {
    if (pendingTopicRssFeedAttachmentLocks.get(query) === pending)
      pendingTopicRssFeedAttachmentLocks.delete(query)
  }
}

// The failed caller owns its rejection; a later attempt must still execute and acquire its fence.
function continueAfterAttachmentFenceFailure(): undefined {
  return undefined
}

export async function lockTopicRssFeedAttachmentLifecycle(
  query: TransactionQuery,
  topicId: string,
): Promise<void> {
  await lockTopicRssFeedAttachmentLifecycles(query, [topicId])
}

/** Takes topic attachment fences in the writer's transaction before a guarded reference write. */
export async function withTopicReferenceAttachmentFences<Result>(
  topicIds: readonly string[],
  options: QueryOptions,
  writeReference: (query: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  const run = async (query: TransactionQuery) => {
    await lockTopicRssFeedAttachmentLifecycles(query, topicIds)
    return writeReference(query)
  }
  if (options.query || options.client) return withTransactionOptions(options, run)
  await using query = await beginTransaction()
  const result = await run(query)
  await query.commit()
  return result
}

export async function withPostPublicationReconciliationLock<Result>(
  scopeKey: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  const client = await advisoryLockPool.connect()
  let released = false
  try {
    await client.query(
      '/* withPostPublicationReconciliationLock.lock */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
      [scopeKey],
    )
    const result = await operation()
    const { rows } = await client.query<{ unlocked: boolean }>(
      '/* withPostPublicationReconciliationLock.unlock */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
      [scopeKey],
    )
    if (!rows[0]?.unlocked)
      throw new Error('Post publication reconciliation advisory lock was not held at release')
    client.release()
    released = true
    return result
  } finally {
    if (!released) client.release(true)
  }
}

/** Acquires distinct post keys in UUID order, preventing cross-scope deadlocks. */
export async function withPostPublicationReconciliationLocks<Result>(
  postIds: readonly string[],
  operation: () => Promise<Result>,
): Promise<Result> {
  const keys = [...new Set(postIds)]
    .toSorted()
    .map(postId => postPublicationScopeLockKey({ type: 'post', postId }))
  if (keys.length === 0) return operation()
  const client = await advisoryLockPool.connect()
  let released = false
  try {
    for (const key of keys) {
      // oxlint-disable-next-line no-await-in-loop -- advisory keys must be acquired in total order.
      await client.query(
        '/* withPostPublicationReconciliationLocks.lock */ SELECT pg_advisory_lock(hashtextextended($1, 0))',
        [key],
      )
    }
    const result = await operation()
    for (const key of [...keys].toReversed()) {
      // oxlint-disable-next-line no-await-in-loop -- release in reverse acquisition order.
      const { rows } = await client.query<{ unlocked: boolean }>(
        '/* withPostPublicationReconciliationLocks.unlock */ SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
        [key],
      )
      if (!rows[0]?.unlocked)
        throw new Error('Post publication reconciliation advisory lock was not held at release')
    }
    client.release()
    released = true
    return result
  } finally {
    if (!released) client.release(true)
  }
}
