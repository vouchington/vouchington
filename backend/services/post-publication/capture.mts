import type { TransactionQuery } from '@data-stores/psql'
import { POST_PUBLICATION_REASONS, type PostPublicationChange } from './types.mts'
import { capturedPublicationKeys } from './captured-keys.mts'
import { enqueueCapturedPublicationChangeAfterCommit } from './direct-capture.mts'
import { lockPostPublicationScopes, postPublicationScopeIdentifier } from './lock.mts'

const reasons = new Set<string>(POST_PUBLICATION_REASONS)

export async function recordPostPublicationChange(
  query: TransactionQuery,
  change: PostPublicationChange,
): Promise<string> {
  const [changeId] = await recordPostPublicationChangeBatch(query, [change])
  return changeId!
}

/** Fences every scope in one ordered statement, then registers each captured change. */
export async function recordPostPublicationChangeBatch(
  query: TransactionQuery,
  changes: readonly PostPublicationChange[],
): Promise<string[]> {
  for (const change of changes) {
    if (!reasons.has(change.reason))
      throw new TypeError(`Unsupported post publication reason: ${change.reason}`)
    const id = postPublicationScopeIdentifier(change.scope)
    if (typeof id !== 'string' || id.length === 0)
      throw new TypeError('Post publication scope requires an identifier')
  }
  await lockPostPublicationScopes(
    query,
    changes.map(change => change.scope),
  )
  return changes.map(change =>
    enqueueCapturedPublicationChangeAfterCommit(query, {
      scope: change.scope,
      reason: change.reason,
      keys: capturedPublicationKeys(change),
    }),
  )
}
