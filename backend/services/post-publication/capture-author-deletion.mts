import type { TransactionQuery } from '@data-stores/psql'
import { retainPostPublicationImpactKeys } from './capture-keys.mts'
import { retainPostPublicationImpacts } from './capture-impacts.mts'
import { recordPostPublicationChange } from './capture.mts'
import { recordPostPublicationChanges } from './capture-posts.mts'
import { POST_PUBLICATION_CAPTURE_BATCH_SIZE } from './constants.mts'
import { lockAuthorPublicationLifecycle } from './lock.mts'
import { retainPublicationIdentityBridges } from './identity-bridges.mts'
import { getAuthorDeletionPublicationTargets } from './capture-author-deletion-candidates.mts'
export type PreparedAuthorDeletionPublicationCapture = {
  authorUsername: string | null
}

/** Acquires a bounded deletion preimage in lifecycle -> post -> relation order. */
export async function prepareAuthorDeletionBeforePostReassignment(
  query: TransactionQuery,
  authorUserId: string,
): Promise<PreparedAuthorDeletionPublicationCapture> {
  await lockAuthorPublicationLifecycle(query, authorUserId)
  const { rows: authors } = await query<{ username: string | null }>(
    `/* getAuthorDeletionPublicationUsername */
    SELECT username FROM users WHERE id = $1::uuid FOR UPDATE`,
    [authorUserId],
  )
  await lockAuthorDeletionPosts(query, authorUserId)
  await lockAuthorDeletionContributedHashtagSources(query, authorUserId)
  return { authorUsername: authors[0]?.username ?? null }
}

export async function recordPreparedAuthorDeletionPublicationWork(
  query: TransactionQuery,
  authorUserId: string,
  capture: PreparedAuthorDeletionPublicationCapture,
): Promise<void> {
  const authorWork = await recordPostPublicationChange(query, {
    scope: { type: 'author', authorUserId },
    reason: 'author_deleted',
    footprint: { priorAuthorUsername: capture.authorUsername ?? undefined },
  })
  let afterPostId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- each preimage page is bounded and ordered.
    const changes = await getAuthorDeletionPublicationTargets(query, authorUserId, afterPostId)
    if (changes.length === 0) return
    // oxlint-disable-next-line no-await-in-loop -- source rows were locked before this bounded dirty-work write.
    const postWork = await recordPostPublicationChanges(
      query,
      'author_deleted',
      changes.map(change => ({ postId: change.postId })),
    )
    // oxlint-disable-next-line no-await-in-loop -- retain the author scope's exact page preimage durably.
    await retainPostPublicationImpactKeys(query, authorWork.id, {
      postIds: changes.map(change => change.postId),
    })
    const contributedPostIds: string[] = []
    for (const change of changes) {
      if (!change.isAuthored) contributedPostIds.push(change.postId)
    }
    // oxlint-disable-next-line no-await-in-loop -- each source-key page is bounded and follows its post page.
    await retainAuthorDeletionContributedTopicImpacts(
      query,
      authorUserId,
      contributedPostIds,
      new Map(postWork.flatMap(work => (work.post_id ? [[work.post_id, work.id] as const] : []))),
    )
    afterPostId = changes.at(-1)!.postId
  }
}

async function lockAuthorDeletionPosts(
  query: TransactionQuery,
  authorUserId: string,
): Promise<void> {
  let afterPostId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- pages acquire every affected post in one global order.
    const result = await query<{ id: string }>(
      `/* lockAuthorDeletionPosts */
      SELECT post.id
      FROM posts post
      WHERE (
        post.created_by_id = $1::uuid
        OR EXISTS (
          SELECT 1
          FROM post_topic_alias_sources source
          WHERE source.post_id = post.id AND source.contributor_id = $1::uuid
        )
      )
        AND ($2::uuid IS NULL OR post.id > $2::uuid)
      ORDER BY post.id
      LIMIT $3
      FOR UPDATE OF post`,
      [authorUserId, afterPostId, POST_PUBLICATION_CAPTURE_BATCH_SIZE],
    )
    const rows: Array<{ id: string }> = result.rows
    if (rows.length === 0) return
    // oxlint-disable-next-line no-await-in-loop -- prepare all post bridges before the later author scope bridge.
    await retainPublicationIdentityBridges(
      query,
      'post',
      rows.map(row => row.id),
    )
    afterPostId = rows.at(-1)!.id
  }
}

async function lockAuthorDeletionContributedHashtagSources(
  query: TransactionQuery,
  authorUserId: string,
): Promise<void> {
  let afterSourceId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- source-row pages follow the globally locked posts.
    const result = await query<{ id: string }>(
      `/* lockAuthorDeletionContributedHashtagSources */
      SELECT source.id
      FROM post_topic_alias_sources source
      JOIN posts post ON post.id = source.post_id
      WHERE source.contributor_id = $1::uuid
        AND post.created_by_id IS DISTINCT FROM $1::uuid
        AND ($2::uuid IS NULL OR source.id > $2::uuid)
      ORDER BY source.id
      LIMIT $3
      FOR UPDATE OF source`,
      [authorUserId, afterSourceId, POST_PUBLICATION_CAPTURE_BATCH_SIZE],
    )
    const rows: Array<{ id: string }> = result.rows
    if (rows.length === 0) return
    afterSourceId = rows.at(-1)!.id
  }
}

export async function retainAuthorDeletionContributedTopicImpacts(
  query: TransactionQuery,
  authorUserId: string,
  postIds: readonly string[],
  workByPostId: ReadonlyMap<string, string>,
): Promise<void> {
  if (postIds.length === 0) return
  let afterSourceId: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- source relation rows and retained keys are both page-bounded.
    const result = await query<{
      post_id: string
      source_id: string
      topic_id: string | null
    }>(
      `/* getAuthorDeletionContributedTopicImpacts */
      SELECT source.post_id, source.id AS source_id, alias.topic_id
      FROM post_topic_alias_sources source
      LEFT JOIN topic_aliases alias ON alias.id = source.topic_alias_id
      WHERE source.contributor_id = $1::uuid
        AND source.post_id = ANY($2::uuid[])
        AND ($3::uuid IS NULL OR source.id > $3::uuid)
      ORDER BY source.id
      LIMIT $4`,
      [authorUserId, postIds, afterSourceId, POST_PUBLICATION_CAPTURE_BATCH_SIZE],
    )
    const rows: Array<{ post_id: string; source_id: string; topic_id: string | null }> = result.rows
    if (rows.length === 0) return
    const impactsByPost = new Map<string, Set<string>>()
    for (const row of rows) {
      if (!row.topic_id) continue
      const topicIds = impactsByPost.get(row.post_id) ?? new Set<string>()
      topicIds.add(row.topic_id)
      impactsByPost.set(row.post_id, topicIds)
    }
    // oxlint-disable-next-line no-await-in-loop -- each source-key page is bounded.
    await retainPostPublicationImpacts(
      query,
      workByPostId,
      [...impactsByPost].map(([scopeId, topicIds]) => ({
        scopeId,
        impacts: { postIds: new Set<string>(), topicIds },
      })),
    )
    afterSourceId = rows.at(-1)!.source_id
  }
}
