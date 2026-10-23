import { write } from '@data-stores/psql'
import type { ClaimedPostPublicationDirtyWork } from './types.mts'
import { readPublicationCandidateAncestors } from './candidate-ancestors.mts'
import { readPublicationAncestorRootHints } from './candidate-root-hints.mts'

const DEFAULT_RAW_PAGE_SIZE = 500
const ANCESTOR_READ_BUDGET = 100

/**
 * Read a bounded slice of the global post-ID order before testing a broad scope. The
 * returned cursor belongs to the raw slice, including when no post is eligible.
 */
export async function readRawPublicationCandidatePage(
  work: ClaimedPostPublicationDirtyWork,
  eligibleLimit: number,
): Promise<{
  postIds: string[]
  cursorPostId: string | null
  hasMore: boolean
  pendingPostId: string | null
  pendingAncestorId: string | null
}> {
  if (work.pending_post_identity_id && work.pending_ancestor_post_identity_id) {
    // A retained identity preserves the cursor key after deletion, but does not
    // authorize a deleted post. Resolve both live links on the writer before
    // resuming the bounded parent walk.
    const { rows: pending } = await write<{
      post_id: string | null
      ancestor_post_id: string | null
    }>(
      `/* resolvePendingPublicationPostIdentities */
      SELECT candidate.post_id, ancestor.post_id AS ancestor_post_id
      FROM post_publication_dirty_work work
      JOIN post_publication_post_identities candidate
        ON candidate.id = work.pending_post_identity_id
      JOIN post_publication_post_identities ancestor
        ON ancestor.id = work.pending_ancestor_post_identity_id
      WHERE work.id = $1::uuid AND work.generation = $2::bigint`,
      [work.id, work.generation],
    )
    if (!pending[0])
      return {
        postIds: [],
        cursorPostId: work.cursor_post_id,
        hasMore: true,
        pendingPostId: work.pending_post_identity_id,
        pendingAncestorId: work.pending_ancestor_post_identity_id,
      }
    if (!pending[0].post_id || !pending[0].ancestor_post_id)
      return {
        postIds: [],
        cursorPostId: work.pending_post_identity_id,
        hasMore: true,
        pendingPostId: null,
        pendingAncestorId: null,
      }
    const ancestry = await readPublicationCandidateAncestors(
      work,
      pending[0].ancestor_post_id,
      ANCESTOR_READ_BUDGET,
    )
    if (ancestry.nextAncestorId)
      return {
        postIds: [],
        cursorPostId: work.cursor_post_id,
        hasMore: true,
        pendingPostId: work.pending_post_identity_id,
        pendingAncestorId: ancestry.nextAncestorId,
      }
    return {
      postIds: ancestry.matched ? [work.pending_post_identity_id] : [],
      cursorPostId: work.pending_post_identity_id,
      hasMore: true,
      pendingPostId: null,
      pendingAncestorId: null,
    }
  }
  const ancestorRoots = await readPublicationAncestorRootHints(work)
  const rawLimit = Math.max(DEFAULT_RAW_PAGE_SIZE, eligibleLimit)
  // A claimed work generation and its captured keys live on the writer. Reading a
  // lagging replica could make an absent page look like EOF and acknowledge it.
  const { rows } = await write<{
    id: string
    parent_post_id: string | null
    post_type: string
    root_id: string
    is_seed: boolean
  }>(
    `/* readRawPublicationCandidatePage */
    WITH RECURSIVE live_scope AS (
      SELECT post.post_id, author.user_id AS author_user_id,
             community.community_id, feed.rss_feed_id, alias.topic_alias_id
      FROM post_publication_dirty_work work
      LEFT JOIN post_publication_post_identities post ON post.id = work.post_identity_id
      LEFT JOIN post_publication_author_identities author ON author.id = work.author_identity_id
      LEFT JOIN post_publication_community_identities community ON community.id = work.community_identity_id
      LEFT JOIN post_publication_rss_feed_identities feed ON feed.id = work.rss_feed_identity_id
      LEFT JOIN post_publication_topic_alias_identities alias ON alias.id = work.topic_alias_identity_id
      WHERE work.id = $1::uuid AND work.generation = $2::bigint
    ), raw_page AS MATERIALIZED (
      -- Keep the optional cursor in the generic plan's btree range condition.
      -- DISTINCT FROM removes the cursor row while retaining an all-zero UUID at EOF start.
      SELECT id, parent_post_id, root_post_id, created_by_id, post_type FROM posts
      WHERE id >= COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND id IS DISTINCT FROM $3::uuid
      ORDER BY id LIMIT $4::integer + 1
    )
    SELECT candidate.id, candidate.parent_post_id, candidate.post_type, root.id AS root_id,
      (
        (scope.author_user_id IS NOT NULL AND
          (candidate.created_by_id = scope.author_user_id OR root.created_by_id = scope.author_user_id))
        OR (scope.community_id IS NOT NULL AND root.community_id = scope.community_id)
        OR (scope.rss_feed_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM story_posts story_post
          JOIN rss_feed_items item ON item.story_id = story_post.story_id AND item.deleted_at IS NULL
          JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
          WHERE story_post.post_id = root.id AND source.rss_feed_id = scope.rss_feed_id
        ))
        OR candidate.id = scope.post_id
        OR EXISTS (
          SELECT 1 FROM post_publication_dirty_work_keys retained
          JOIN post_publication_post_identities identity
            ON identity.id = retained.impact_post_identity_id
          WHERE retained.dirty_work_id = $1::uuid
            AND (identity.post_id = candidate.id OR identity.post_id = root.id)
        )
        OR EXISTS (
          SELECT 1 FROM post_publication_dirty_work_keys retained
          JOIN post_publication_community_identities identity
            ON identity.id = retained.impact_community_identity_id
          WHERE retained.dirty_work_id = $1::uuid
            AND identity.community_id = root.community_id
        )
        OR EXISTS (
          SELECT 1 FROM post_topic_alias_sources source
          WHERE source.post_id = candidate.id AND source.topic_alias_id = scope.topic_alias_id
        )
        OR EXISTS (
          SELECT 1 FROM relation__post__category__topic_alias relation
          WHERE relation.subject_id = candidate.id AND relation.object_id = scope.topic_alias_id
            AND relation.deleted_at IS NULL AND relation.votes_score_net > 0
        )) AS is_seed
    FROM raw_page candidate
    -- Keep root lookup inside the bounded raw page under generic prepared plans.
    JOIN LATERAL (
      SELECT id, community_id, created_by_id
      FROM posts root
      WHERE root.id = COALESCE(candidate.root_post_id, candidate.id)
      LIMIT 1
    ) root ON TRUE
    CROSS JOIN live_scope scope
    ORDER BY candidate.id`,
    [work.id, work.generation, work.cursor_post_id, rawLimit],
  )
  const postIds: string[] = []
  let inspectedCount = 0
  let remainingAncestorReads = ANCESTOR_READ_BUDGET
  for (const row of rows.slice(0, rawLimit)) {
    if (
      !row.is_seed &&
      row.post_type === 'comment' &&
      row.parent_post_id &&
      (ancestorRoots === null || ancestorRoots.has(row.root_id))
    ) {
      /* oxlint-disable no-await-in-loop -- the shared ancestry budget and ordered raw cursor require sequential reads. */
      // no-mistakes-disable-next-line query-reached-per-item: one strict 100-ancestor budget spans ordered raw candidates; unresolved work checkpoints before cursor advance.
      const ancestry = await readPublicationCandidateAncestors(
        work,
        row.parent_post_id,
        remainingAncestorReads,
      )
      /* oxlint-enable no-await-in-loop */
      remainingAncestorReads -= ancestry.rowsRead
      if (ancestry.nextAncestorId)
        return {
          postIds,
          cursorPostId: rows[inspectedCount - 1]?.id ?? work.cursor_post_id,
          hasMore: true,
          pendingPostId: row.id,
          pendingAncestorId: ancestry.nextAncestorId,
        }
      if (ancestry.matched) postIds.push(row.id)
    } else if (row.is_seed) postIds.push(row.id)
    inspectedCount++
    if (postIds.length === eligibleLimit) break
  }
  return {
    postIds,
    cursorPostId: rows[inspectedCount - 1]?.id ?? work.cursor_post_id,
    hasMore: rows.length > inspectedCount,
    pendingPostId: null,
    pendingAncestorId: null,
  }
}
