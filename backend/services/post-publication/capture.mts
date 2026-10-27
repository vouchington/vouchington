import type { TransactionQuery } from '@data-stores/psql'
import { POST_PUBLICATION_REASONS, type PostPublicationChange } from './types.mts'
import { capturedPublicationKeys } from './captured-keys.mts'
import { enqueueCapturedPublicationChangeAfterCommit } from './direct-capture.mts'
import { lockPostPublicationScope, postPublicationScopeIdentifier } from './lock.mts'

const reasons = new Set<string>(POST_PUBLICATION_REASONS)

export async function recordPostPublicationChange(
  query: TransactionQuery,
  change: PostPublicationChange,
): Promise<string> {
  if (!reasons.has(change.reason))
    throw new TypeError(`Unsupported post publication reason: ${change.reason}`)
  const id = postPublicationScopeIdentifier(change.scope)
  if (typeof id !== 'string' || id.length === 0)
    throw new TypeError('Post publication scope requires an identifier')
  await lockPostPublicationScope(query, change.scope)
  return enqueueCapturedPublicationChangeAfterCommit(query, {
    scope: change.scope,
    reason: change.reason,
    keys: capturedPublicationKeys(change),
  })
}
