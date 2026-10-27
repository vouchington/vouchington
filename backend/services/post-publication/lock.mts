import { beginTransaction, withTransactionOptions, type TransactionQuery } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { createTransactionLockOnce } from '@vouchington/postgres'
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
    case 'topic':
      return scope.topicId
  }
}

export function postPublicationScopeLockKey(scope: PostPublicationScope): string {
  return `${scope.type}:${postPublicationScopeIdentifier(scope).toLowerCase()}`
}
const postPublicationScopeLocks = createTransactionLockOnce({
  namespace: '',
  annotation: 'lockPostPublicationScope',
})
export async function lockPostPublicationScope(
  query: TransactionQuery,
  scope: PostPublicationScope,
): Promise<void> {
  await postPublicationScopeLocks.lock(query, [postPublicationScopeLockKey(scope)])
}

/** Records keys acquired by an ordered SQL batch on this same transaction query. */
export function markPostPublicationScopeLocksHeld(
  query: TransactionQuery,
  scopes: readonly PostPublicationScope[],
): void {
  postPublicationScopeLocks.markHeld(query, scopes.map(postPublicationScopeLockKey))
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
const topicRssFeedAttachmentLocks = createTransactionLockOnce({
  namespace: 'topic-rss-feed-attachment:',
  annotation: 'lockTopicRssFeedAttachmentLifecycles',
})

/** Serializes attachment of an RSS feed to an existing topic with topic merges. */
export async function lockTopicRssFeedAttachmentLifecycles(
  query: TransactionQuery,
  topicIds: readonly string[],
): Promise<void> {
  await topicRssFeedAttachmentLocks.lock(query, topicIds)
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
