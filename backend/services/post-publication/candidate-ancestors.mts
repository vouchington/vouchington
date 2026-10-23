import { write } from '@data-stores/psql'
import type { ClaimedPostPublicationDirtyWork } from './types.mts'

/** One indexed parent chain, capped for each reconciliation invocation. */
export async function readPublicationCandidateAncestors(
  work: ClaimedPostPublicationDirtyWork,
  firstAncestorId: string,
  budget: number,
): Promise<{ matched: boolean; nextAncestorId: string | null; rowsRead: number }> {
  if (budget < 1) return { matched: false, nextAncestorId: firstAncestorId, rowsRead: 0 }
  const { rows } = await write<{
    id: string
    parent_post_id: string | null
    post_type: string
    is_seed: boolean
  }>(
    `/* readPublicationCandidateAncestors */
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_post_id, created_by_id, post_type, 1 AS depth
      FROM posts WHERE id = $1::uuid
      UNION ALL
      SELECT parent.id, parent.parent_post_id, parent.created_by_id, parent.post_type,
             prior.depth + 1
      FROM ancestors prior JOIN posts parent ON parent.id = prior.parent_post_id
      WHERE prior.post_type = 'comment' AND prior.parent_post_id IS NOT NULL
        AND prior.depth < $4::integer
    ), live_scope AS (
      SELECT post.post_id, author.user_id AS author_user_id, alias.topic_alias_id
      FROM post_publication_dirty_work work
      LEFT JOIN post_publication_post_identities post ON post.id = work.post_identity_id
      LEFT JOIN post_publication_author_identities author ON author.id = work.author_identity_id
      LEFT JOIN post_publication_topic_alias_identities alias ON alias.id = work.topic_alias_identity_id
      WHERE work.id = $2::uuid AND work.generation = $3::bigint
    )
    SELECT ancestor.id, ancestor.parent_post_id, ancestor.post_type,
      (ancestor.id = scope.post_id OR ancestor.created_by_id = scope.author_user_id
        OR EXISTS (
          SELECT 1 FROM post_publication_dirty_work_keys retained
          JOIN post_publication_post_identities identity ON identity.id = retained.impact_post_identity_id
          WHERE retained.dirty_work_id = $2::uuid AND identity.post_id = ancestor.id
        )
        OR EXISTS (
          SELECT 1 FROM post_topic_alias_sources source
          WHERE source.post_id = ancestor.id AND source.topic_alias_id = scope.topic_alias_id
        )
        OR EXISTS (
          SELECT 1 FROM relation__post__category__topic_alias relation
          WHERE relation.subject_id = ancestor.id AND relation.object_id = scope.topic_alias_id
            AND relation.deleted_at IS NULL AND relation.votes_score_net > 0
        )) AS is_seed
    FROM ancestors ancestor CROSS JOIN live_scope scope
    ORDER BY ancestor.depth`,
    [firstAncestorId, work.id, work.generation, budget],
  )
  const matched = rows.some(row => row.is_seed)
  const last = rows.at(-1)
  return {
    matched,
    nextAncestorId:
      !matched && rows.length === budget && last?.post_type === 'comment'
        ? last.parent_post_id
        : null,
    rowsRead: rows.length,
  }
}
