import { advisoryLockPool, type TransactionQuery } from '@data-stores/psql'
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
  return `${scope.type}:${postPublicationScopeIdentifier(scope)}`
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

/** Serializes attachment of an RSS feed to an existing topic with topic merges. */
export async function lockTopicRssFeedAttachmentLifecycle(
  query: TransactionQuery,
  topicId: string,
): Promise<void> {
  await query(
    `/* lockTopicRssFeedAttachmentLifecycle */
    SELECT pg_advisory_xact_lock(hashtextextended('topic-rss-feed-attachment:' || $1::text, 0))`,
    [topicId],
  )
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
    .sort()
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
    for (const key of [...keys].reverse()) {
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
