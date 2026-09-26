import type { TransactionQuery } from '@data-stores/psql/types'
import {
  POST_PUBLICATION_REASONS,
  type PostPublicationDirtyWork,
  type PostPublicationReason,
} from './types.mts'
import {
  retainPostPublicationImpacts,
  type PostPublicationImpactsByScope,
} from './capture-impacts.mts'
import { retainPostPublicationPostScopeContext } from './capture-post-context.mts'
import { POST_PUBLICATION_CAPTURE_BATCH_SIZE } from './constants.mts'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'
import { upsertPostPublicationDirtyWork } from './upsert-dirty-work.mts'
import { preparePostPublicationIdentityBridges } from './prepare-identity-bridges.mts'

const reasons = new Set<string>(POST_PUBLICATION_REASONS)

type PostPublicationBatchChange = {
  postId: string
  impactedPostIds?: readonly string[]
  impactedTopicIds?: readonly string[]
}

/** Records one reason for bounded, de-duplicated post scopes without per-post round trips. */
export async function recordPostPublicationChanges(
  query: TransactionQuery,
  reason: PostPublicationReason,
  changes: readonly PostPublicationBatchChange[],
): Promise<PostPublicationDirtyWork[]> {
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
  const work: PostPublicationDirtyWork[] = []
  await preparePostPublicationIdentityBridges(
    query,
    normalized.map(change => ({
      scope: { type: 'post' as const, postId: change.scopeId },
      reason,
      impactedPostIds: [...change.impacts.postIds],
    })),
  )
  for (let offset = 0; offset < normalized.length; offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE) {
    const batch = normalized.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- globally sorted, bounded batches preserve publication lock order.
    work.push(...(await recordPostPublicationChangeBatch(query, reason, batch)))
  }
  return work
}

async function recordPostPublicationChangeBatch(
  query: TransactionQuery,
  reason: PostPublicationReason,
  batch: readonly PostPublicationImpactsByScope[],
): Promise<PostPublicationDirtyWork[]> {
  const postIds = batch.map(change => change.scopeId)
  await lockPostPublicationPostScopes(query, postIds)
  const work = await upsertPostPublicationDirtyWork(query, 'post', postIds, [reason])
  const workByPostId = new Map(
    work.flatMap(row => (row.post_id ? [[row.post_id, row.id] as const] : [])),
  )
  await retainPostPublicationPostScopeContext(
    query,
    work.flatMap(row => (row.post_id ? [{ dirtyWorkId: row.id, postId: row.post_id }] : [])),
  )
  await retainPostPublicationImpacts(query, workByPostId, batch)
  return work
}

/** Pre-locks a set of post scopes in one global order before split capture paths run. */
export async function lockPostPublicationPostScopes(
  query: TransactionQuery,
  postIds: readonly string[],
): Promise<void> {
  const ids = normalizePostPublicationIdentifiers(postIds)
  for (let offset = 0; offset < ids.length; offset += POST_PUBLICATION_CAPTURE_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + POST_PUBLICATION_CAPTURE_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- ascending batches preserve global advisory-lock order.
    await query(
      `/* lockPostPublicationCaptures */
      SELECT pg_advisory_xact_lock(hashtextextended('post:' || post_id::text, 0))
      FROM unnest($1::uuid[]) AS input(post_id) ORDER BY post_id`,
      [batch],
    )
  }
}
