import type { TransactionQuery } from '@data-stores/psql/types'
import { recordPostPublicationChanges } from '@services/post-publication'
import type { ReviewSuccessionArchive, ReviewSuccessionRestoration } from './types.mts'

type ChangedTopicsByPost = Map<string, Set<string>>

/** Applies a planned handoff in two bounded SQL statements, then captures every changed post. */
export async function applyReviewSuccessionMutations(
  query: TransactionQuery,
  input: {
    archives: readonly ReviewSuccessionArchive[]
    restorations: readonly ReviewSuccessionRestoration[]
  },
): Promise<string[]> {
  const changedTopicsByPost = new Map<string, Set<string>>()
  const restoredPostIds = await restoreAutomaticPredecessors(query, input.restorations)
  for (const restoration of input.restorations) {
    if (!restoredPostIds.has(restoration.postId)) continue
    retainChangedTopics(
      changedTopicsByPost,
      restoration.postId,
      restoration.topicIds,
      restoration.successionTopicIds,
    )
  }
  const archivedPostIds = await archiveAutomaticPredecessors(query, input.archives)
  for (const archive of input.archives) {
    if (!archivedPostIds.has(archive.predecessorPostId)) continue
    retainChangedTopics(changedTopicsByPost, archive.predecessorPostId, archive.topicIds)
  }
  await recordPostPublicationChanges(
    query,
    'post_archived',
    [...changedTopicsByPost]
      .map(([postId, topicIds]) => ({ postId, impactedTopicIds: [...topicIds].toSorted() }))
      .toSorted((left, right) => left.postId.localeCompare(right.postId)),
  )
  return [...changedTopicsByPost.keys()].toSorted()
}

async function restoreAutomaticPredecessors(
  query: TransactionQuery,
  restorations: readonly ReviewSuccessionRestoration[],
): Promise<Set<string>> {
  if (restorations.length === 0) return new Set()
  const { rows } = await query<{ id: string }>(
    `/* restoreAutomaticReviewSuccessionPredecessors */
    WITH requested AS (
      SELECT post_id, succession_id
      FROM jsonb_to_recordset($1::jsonb) AS input(post_id uuid, succession_id uuid)
    ), terminalized AS (
      UPDATE review_successions succession
      SET automatically_restored_at = CURRENT_TIMESTAMP
      FROM requested
      WHERE succession.id = requested.succession_id
        AND succession.predecessor_post_id = requested.post_id
        AND succession.automatically_restored_at IS NULL
        AND succession.manual_override_at IS NULL
      RETURNING succession.predecessor_post_id
    ), restored AS (
      UPDATE posts
      SET archived_at = NULL, archived_by_id = NULL
      FROM terminalized
      WHERE posts.id = terminalized.predecessor_post_id
        AND posts.archived_at IS NOT NULL
      RETURNING posts.id
    )
    SELECT id FROM restored ORDER BY id`,
    [
      JSON.stringify(
        restorations.map(restoration => ({
          post_id: restoration.postId,
          succession_id: restoration.successionId,
        })),
      ),
    ],
  )
  return new Set(rows.map(row => row.id))
}

async function archiveAutomaticPredecessors(
  query: TransactionQuery,
  archives: readonly ReviewSuccessionArchive[],
): Promise<Set<string>> {
  if (archives.length === 0) return new Set()
  const { rows } = await query<{ predecessor_post_id: string }>(
    `/* archiveAutomaticReviewSuccessionPredecessors */
    WITH requested AS (
      SELECT predecessor_post_id, successor_post_id, author_user_id, topic_ids
      FROM jsonb_to_recordset($1::jsonb) AS input(
        predecessor_post_id uuid, successor_post_id uuid, author_user_id uuid, topic_ids uuid[]
      )
    ), archive_epochs AS (
      SELECT requested.*, CURRENT_TIMESTAMP AS predecessor_archived_at
      FROM requested
      JOIN posts predecessor ON predecessor.id = requested.predecessor_post_id
        AND predecessor.archived_at IS NULL
    ), inserted AS (
      INSERT INTO review_successions (
        predecessor_post_id, successor_post_id, author_user_id, topic_ids, predecessor_archived_at
      )
      SELECT predecessor_post_id, successor_post_id, author_user_id, topic_ids, predecessor_archived_at
      FROM archive_epochs
      ON CONFLICT (predecessor_post_id, predecessor_archived_at) DO NOTHING
      RETURNING predecessor_post_id, predecessor_archived_at
    ), archived AS (
      UPDATE posts
      SET archived_at = inserted.predecessor_archived_at, archived_by_id = NULL
      FROM inserted
      WHERE posts.id = inserted.predecessor_post_id
        AND posts.archived_at IS NULL
      RETURNING posts.id
    )
    SELECT id AS predecessor_post_id FROM archived ORDER BY id`,
    [
      JSON.stringify(
        archives.map(archive => ({
          predecessor_post_id: archive.predecessorPostId,
          successor_post_id: archive.successorPostId,
          author_user_id: archive.authorUserId,
          topic_ids: archive.topicIds,
        })),
      ),
    ],
  )
  return new Set(rows.map(row => row.predecessor_post_id))
}

function retainChangedTopics(
  changedTopicsByPost: ChangedTopicsByPost,
  postId: string,
  ...topicSets: readonly string[][]
): void {
  const topicIds = changedTopicsByPost.get(postId) ?? new Set<string>()
  for (const topicSet of topicSets) for (const topicId of topicSet) topicIds.add(topicId)
  changedTopicsByPost.set(postId, topicIds)
}
