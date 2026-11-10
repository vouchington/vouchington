import { getPostPublicationWorkLimit } from './work-limits.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import { POST_PUBLICATION_REASONS, type PostPublicationReason } from './types.mts'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'
import { impactPublicationKeys } from './captured-keys.mts'
import { enqueueCapturedPublicationChangeAfterCommit } from './direct-capture.mts'

const reasons = new Set<string>(POST_PUBLICATION_REASONS)

type PostPublicationBatchChange = {
  postId: string
  impactedPostIds?: readonly string[]
  impactedTopicIds?: readonly string[]
}

/** Captures one reason for a bounded set of post scopes without per-post SQL writes. */
export async function recordPostPublicationChanges(
  query: TransactionQuery,
  reason: PostPublicationReason,
  changes: readonly PostPublicationBatchChange[],
): Promise<void> {
  const POST_PUBLICATION_CAPTURE_BATCH_SIZE = getPostPublicationWorkLimit('capture_batch_size')
  if (!reasons.has(reason)) throw new TypeError(`Unsupported post publication reason: ${reason}`)
  const impactsByPost = new Map<string, { postIds: Set<string>; topicIds: Set<string> }>()
  for (const change of changes) {
    if (!change.postId) throw new TypeError('Post publication change requires an identifier')
    const impacts = impactsByPost.get(change.postId) ?? {
      postIds: new Set<string>(),
      topicIds: new Set<string>(),
    }
    for (const postId of normalizePostPublicationIdentifiers(change.impactedPostIds))
      impacts.postIds.add(postId)
    for (const topicId of normalizePostPublicationIdentifiers(change.impactedTopicIds))
      impacts.topicIds.add(topicId)
    impactsByPost.set(change.postId, impacts)
  }
  const normalized = normalizePostPublicationIdentifiers(impactsByPost.keys()).map(scopeId => ({
    scopeId,
    impacts: impactsByPost.get(scopeId)!,
  }))
  for (let offset = 0; offset < normalized.length; offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE) {
    for (const change of normalized.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)) {
      enqueueCapturedPublicationChangeAfterCommit(query, {
        scope: { type: 'post', postId: change.scopeId },
        reason,
        keys: impactPublicationKeys({
          postIds: [...change.impacts.postIds],
          topicIds: [...change.impacts.topicIds],
        }),
      })
    }
  }
}
