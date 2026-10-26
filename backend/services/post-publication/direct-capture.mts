import { randomUUID } from 'node:crypto'
import { registerPostCommitAction, type TransactionQuery } from '@data-stores/psql'
import { enqueuePostPublicationEffects } from '@queues/post-publication/enqueues'
import type { PublicationCapturedKey } from '@voucha/types/post-publication'
import { hashCapturedPublicationKeys, splitCapturedPublicationKeys } from './captured-keys.mts'
import { postPublicationScopeIdentifier } from './lock.mts'
import type { PostPublicationReason, PostPublicationScope } from './types.mts'

/** Registers one immutable captured change on the caller's transaction scope. */
export function enqueueCapturedPublicationChangeAfterCommit(
  query: TransactionQuery,
  capture: {
    scope: PostPublicationScope
    reason: PostPublicationReason
    keys: readonly PublicationCapturedKey[]
    /** Reuse only when a bounded page belongs to this same logical mutation. */
    changeId?: string
  },
): string {
  const changeId = capture.changeId ?? randomUUID()
  const id = postPublicationScopeIdentifier(capture.scope)
  const scope = { type: capture.scope.type, id }
  const postId = capture.scope.type === 'post' ? capture.scope.postId : null
  for (const [chunkIndex, keys] of splitCapturedPublicationKeys(capture.keys).entries()) {
    const payload = {
      changeId,
      postId,
      scope,
      reason: capture.reason,
      keys,
      keyHash: hashCapturedPublicationKeys(keys),
      chunkIndex,
    }
    // Register on this query's action scope, so a rolled-back nested transaction drops its jobs.
    registerPostCommitAction(query, async () => {
      await enqueuePostPublicationEffects(payload)
    })
  }
  return changeId
}
