import type { TransactionQuery } from '@data-stores/psql'
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
  await lockPostPublicationScopes(query, [scope])
}

/** Acquires every scope fence in one ordered statement. */
export async function lockPostPublicationScopes(
  query: TransactionQuery,
  scopes: readonly PostPublicationScope[],
): Promise<void> {
  await postPublicationScopeLocks.lock(query, scopes.map(postPublicationScopeLockKey))
}

/** Records keys acquired by an ordered SQL batch on this same transaction query. */
export function markPostPublicationScopeLocksHeld(
  query: TransactionQuery,
  scopes: readonly PostPublicationScope[],
): void {
  postPublicationScopeLocks.markHeld(query, scopes.map(postPublicationScopeLockKey))
}
export async function lockAuthorPublicationLifecycles(
  query: TransactionQuery,
  authorUserIds: readonly string[],
): Promise<void> {
  await lockPostPublicationScopes(
    query,
    authorUserIds.map(authorUserId => ({ type: 'author' as const, authorUserId })),
  )
}
export async function lockAuthorPublicationLifecycle(
  query: TransactionQuery,
  authorUserId: string,
): Promise<void> {
  await lockAuthorPublicationLifecycles(query, [authorUserId])
}
export async function lockPostPublication(query: TransactionQuery, postId: string): Promise<void> {
  await lockPostPublicationScope(query, { type: 'post', postId })
}
