import type { TransactionQuery } from '@data-stores/psql'
import { DELETED_USER_ID } from '@voucha/types/entities/user-constants'
import {
  getAuthoredPostIds,
  getContributedSources,
  type SourceCandidate,
} from './capture-author-deletion-candidates.mts'
import { retainPostPublicationImpactKeys } from './capture-keys.mts'
import { retainPostPublicationImpacts } from './capture-impacts.mts'
import { recordPostPublicationChange } from './capture.mts'
import { lockPostPublicationPostScopes, recordPostPublicationChanges } from './capture-posts.mts'
import { lockAuthorPublicationLifecycle } from './lock.mts'

/** Removes one mutation-backed source or authored-post page per committed transaction. */
export async function processAuthorDeletionPublicationBatch(
  query: TransactionQuery,
  authorUserId: string,
  priorAuthorUsername: string | null,
  batchSize: number,
): Promise<{ processed: number; hasMore: boolean }> {
  const sources = await getLockedContributedSources(query, authorUserId, batchSize)
  if (sources.length > 0) {
    return processContributedSources(query, authorUserId, priorAuthorUsername, sources).then(
      () => ({
        processed: sources.length,
        hasMore: true,
      }),
    )
  }
  const postIds = await getAuthoredPostIds(query, authorUserId, batchSize)
  if (postIds.length === 0) return { processed: 0, hasMore: false }
  await processAuthoredPostBatch(query, authorUserId, priorAuthorUsername, postIds)
  return { processed: postIds.length, hasMore: postIds.length === batchSize }
}

async function getLockedContributedSources(
  query: TransactionQuery,
  userId: string,
  batchSize: number,
): Promise<SourceCandidate[]> {
  await lockAuthorPublicationLifecycle(query, userId)
  return getContributedSources(query, userId, batchSize)
}

async function processAuthoredPostBatch(
  query: TransactionQuery,
  authorUserId: string,
  priorAuthorUsername: string | null,
  postIds: string[],
): Promise<void> {
  await lockAuthoredPostScopes(query, postIds)
  return recordAndReassignAuthoredPosts(query, authorUserId, priorAuthorUsername, postIds)
}

async function lockAuthoredPostScopes(query: TransactionQuery, postIds: string[]): Promise<void> {
  await lockPostPublicationPostScopes(query, postIds)
  await query(
    `/* processAuthorDeletionPublicationBatch:lockAuthoredPosts */
      SELECT id FROM posts WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [postIds],
  )
}

async function recordAndReassignAuthoredPosts(
  query: TransactionQuery,
  authorUserId: string,
  priorAuthorUsername: string | null,
  postIds: string[],
): Promise<void> {
  await recordDeletionWork(query, authorUserId, priorAuthorUsername, postIds)
  await query(
    `/* processAuthorDeletionPublicationBatch:reassignPosts */
      UPDATE posts SET created_by_id = $2::uuid
      WHERE created_by_id = $1::uuid AND id = ANY($3::uuid[])`,
    [authorUserId, DELETED_USER_ID, postIds],
  )
}

async function processContributedSources(
  query: TransactionQuery,
  userId: string,
  priorUsername: string | null,
  sources: SourceCandidate[],
): Promise<void> {
  const postIds = [...new Set(sources.map(source => source.post_id))]
  await lockContributedSourcePosts(query, postIds)
  await lockContributedSourceRows(query, sources)
  return recordContributedSourceWork(query, userId, priorUsername, postIds, sources).then(() =>
    reassignContributedSources(query, sources),
  )
}

async function lockContributedSourcePosts(
  query: TransactionQuery,
  postIds: string[],
): Promise<void> {
  await lockPostPublicationPostScopes(query, postIds)
  await query(
    `/* processAuthorDeletionPublicationBatch:lockSourcePosts */
      SELECT id FROM posts WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [postIds],
  )
}

async function lockContributedSourceRows(
  query: TransactionQuery,
  sources: SourceCandidate[],
): Promise<void> {
  await query(
    `/* processAuthorDeletionPublicationBatch:lockSources */
      SELECT id FROM post_topic_alias_sources
      WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [sources.map(source => source.id)],
  )
}

async function recordContributedSourceWork(
  query: TransactionQuery,
  userId: string,
  priorUsername: string | null,
  postIds: string[],
  sources: SourceCandidate[],
) {
  const postWork = await recordDeletionWork(query, userId, priorUsername, postIds)
  const topicIdsByPost = new Map<string, Set<string>>()
  for (const source of sources) {
    if (!source.topic_id) continue
    const topicIds = topicIdsByPost.get(source.post_id) ?? new Set<string>()
    topicIds.add(source.topic_id)
    topicIdsByPost.set(source.post_id, topicIds)
  }
  await retainPostPublicationImpacts(
    query,
    new Map(postWork.map(work => [work.post_id!, work.id])),
    [...topicIdsByPost].map(([scopeId, topicIds]) => ({
      scopeId,
      impacts: { postIds: new Set<string>(), topicIds },
    })),
  )
  return postWork
}

async function reassignContributedSources(
  query: TransactionQuery,
  sources: SourceCandidate[],
): Promise<void> {
  await query(
    `/* processAuthorDeletionPublicationBatch:reassignSources */
      UPDATE post_topic_alias_sources SET contributor_id = $2::uuid
      WHERE id = ANY($1::uuid[])`,
    [sources.map(source => source.id), DELETED_USER_ID],
  )
}

async function recordDeletionWork(
  query: TransactionQuery,
  userId: string,
  priorUsername: string | null,
  postIds: string[],
) {
  const { authorWork, postWork } = await recordPostPublicationWork(
    query,
    userId,
    priorUsername,
    postIds,
  )
  await retainPostPublicationImpactKeys(query, authorWork.id, { postIds })
  return postWork
}

async function recordPostPublicationWork(
  query: TransactionQuery,
  userId: string,
  priorUsername: string | null,
  postIds: string[],
) {
  const authorWork = await recordPostPublicationChange(query, {
    scope: { type: 'author', authorUserId: userId },
    reason: 'author_deleted',
    footprint: { priorAuthorUsername: priorUsername ?? undefined },
  })
  const postWork = await recordPostPublicationChanges(
    query,
    'author_deleted',
    postIds.map(postId => ({ postId })),
  )
  return { authorWork, postWork }
}
