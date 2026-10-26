import type { TransactionQuery } from '@data-stores/psql'
import { DELETED_USER_ID } from '@voucha/types/entities/user-constants'
import {
  getAuthoredPostIds,
  getContributedSources,
  getInitiatedStoryPostIds,
  type SourceCandidate,
} from './capture-author-deletion-candidates.mts'
import { lockPostPublicationPostScopes } from './capture-posts.mts'
import { lockAuthorPublicationLifecycle } from './lock.mts'
import { recordPostPublicationChange } from './capture.mts'
import { recordAuthorDeletionWork } from './capture-author-deletion-work.mts'

/** Removes one mutation-backed source or authored-post page per committed transaction. */
export async function processAuthorDeletionPublicationBatch(
  query: TransactionQuery,
  authorUserId: string,
  priorAuthorUsername: string | null,
  batchSize: number,
): Promise<{ processed: number; hasMore: boolean }> {
  await lockAuthorForDeletion(query, authorUserId)
  const sources = await getContributedSources(query, authorUserId, batchSize)
  if (sources.length > 0) {
    return processContributedSources(query, authorUserId, priorAuthorUsername, sources).then(
      () => ({
        processed: sources.length,
        hasMore: true,
      }),
    )
  }
  const initiatedStoryPostIds = await getInitiatedStoryPostIds(query, authorUserId, batchSize)
  if (initiatedStoryPostIds.length > 0) {
    await lockAuthoredPostScopes(query, initiatedStoryPostIds)
    await query(
      `/* processAuthorDeletionPublicationBatch:lockInitiatedStoryPosts */
      SELECT post_id FROM story_posts
      WHERE initiated_by_id = $1::uuid AND post_id = ANY($2::uuid[])
      ORDER BY post_id FOR UPDATE`,
      [authorUserId, initiatedStoryPostIds],
    )
    await recordAuthorDeletionWork(query, authorUserId, priorAuthorUsername, initiatedStoryPostIds)
    await query(
      `/* processAuthorDeletionPublicationBatch:reassignInitiatedStoryPosts */
      UPDATE story_posts SET initiated_by_id = $2::uuid
      WHERE initiated_by_id = $1::uuid AND post_id = ANY($3::uuid[])`,
      [authorUserId, DELETED_USER_ID, initiatedStoryPostIds],
    )
    return { processed: initiatedStoryPostIds.length, hasMore: true }
  }
  const postIds = await getAuthoredPostIds(query, authorUserId, batchSize)
  if (postIds.length === 0) {
    await recordPostPublicationChange(query, {
      scope: { type: 'author', authorUserId },
      reason: 'author_deleted',
      footprint: { priorAuthorUsername: priorAuthorUsername ?? undefined },
    })
    return { processed: 0, hasMore: false }
  }
  await processAuthoredPostBatch(query, authorUserId, priorAuthorUsername, postIds)
  return { processed: postIds.length, hasMore: postIds.length === batchSize }
}

async function lockAuthorForDeletion(query: TransactionQuery, authorUserId: string): Promise<void> {
  await lockAuthorPublicationLifecycle(query, authorUserId)
  await query(
    `/* processAuthorDeletionPublicationBatch:lockAuthor */ SELECT id FROM users WHERE id = $1::uuid FOR UPDATE`,
    [authorUserId],
  )
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
  await recordAuthorDeletionWork(query, authorUserId, priorAuthorUsername, postIds)
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
  const topicIdsByPost = new Map<string, Set<string>>()
  for (const source of sources) {
    if (!source.topic_id) continue
    const topicIds = topicIdsByPost.get(source.post_id) ?? new Set<string>()
    topicIds.add(source.topic_id)
    topicIdsByPost.set(source.post_id, topicIds)
  }
  await recordAuthorDeletionWork(query, userId, priorUsername, postIds, topicIdsByPost)
}

async function reassignContributedSources(
  query: TransactionQuery,
  sources: SourceCandidate[],
): Promise<void> {
  await query(
    `/* processAuthorDeletionPublicationBatch:reassignSources */
      UPDATE post_topic_alias_sources SET contributor_user_id = $2::uuid
      WHERE id = ANY($1::uuid[])`,
    [sources.map(source => source.id), DELETED_USER_ID],
  )
}
