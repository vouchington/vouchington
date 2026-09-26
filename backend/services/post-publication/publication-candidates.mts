import { write } from '@data-stores/psql'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import sql from 'sql-template-strings'
import type { ClaimedPostPublicationDirtyWork } from './types.mts'
import { publicationEligibilityFingerprintSql } from './fingerprint.mts'

export type ReconciliationPost = {
  id: string
  parent_id: string | null
  root_id: string | null
  created_by_id: string | null
  community_id: string | null
  post_type: string
  sitemap_day: string
  is_public: boolean
  eligibility_fingerprint: string
  identity_snapshot_id?: string
}

export async function listPublicationCandidates(
  work: ClaimedPostPublicationDirtyWork,
  limit: number,
  selectedPostIds?: readonly string[],
): Promise<ReconciliationPost[]> {
  const scopedPosts = selectedPostIds
    ? sql`SELECT UNNEST(${selectedPostIds}::uuid[]) AS id`
    : sql`
      SELECT candidate.id
      FROM post_publication_dirty_work_keys retained
      JOIN post_publication_post_identities identity ON identity.id = retained.impact_post_identity_id
      JOIN posts candidate ON candidate.id = identity.post_id OR candidate.root_id = identity.post_id
      WHERE retained.dirty_work_id = ${work.id} AND retained.impact_post_identity_id IS NOT NULL
      UNION
      SELECT candidate.id
      FROM post_publication_dirty_work_keys retained
      JOIN post_publication_community_identities identity ON identity.id = retained.impact_community_identity_id
      JOIN posts root ON root.community_id = identity.community_id AND root.root_id IS NULL
      JOIN posts candidate ON candidate.id = root.id OR candidate.root_id = root.id
      WHERE retained.dirty_work_id = ${work.id} AND retained.impact_community_identity_id IS NOT NULL
      UNION SELECT post_id FROM live_scope WHERE post_id IS NOT NULL
      UNION
      SELECT candidate.id
      FROM posts candidate
      JOIN posts root ON root.id = COALESCE(candidate.root_id, candidate.id) CROSS JOIN live_scope scope
      WHERE (scope.post_id IS NOT NULL AND (candidate.id = scope.post_id OR root.id = scope.post_id))
         OR (scope.author_user_id IS NOT NULL AND (candidate.created_by_id = scope.author_user_id OR root.created_by_id = scope.author_user_id))
         OR (scope.community_id IS NOT NULL AND root.community_id = scope.community_id)
         OR (scope.rss_feed_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM post__stories ps
              JOIN rss_feed_items item ON item.story_id = ps.story_id AND item.deleted_at IS NULL
              JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
              WHERE ps.post_id = root.id AND source.rss_feed_id = scope.rss_feed_id
            ))
      UNION
      SELECT source.post_id
      FROM (
      SELECT DISTINCT post_id
      FROM post_topic_alias_sources
      WHERE topic_alias_id = (SELECT topic_alias_id FROM live_scope)
      ) source
      UNION
      SELECT DISTINCT relation.subject_id
      FROM relation__post__category__topic_alias relation
      WHERE relation.object_id = (SELECT topic_alias_id FROM live_scope)
        AND relation.deleted_at IS NULL
        AND relation.votes_score_net > 0`
  const query = selectedPostIds
    ? sql`/* listPublicationCandidates */ WITH scoped_posts AS (`
    : sql`/* listPublicationCandidates */ WITH RECURSIVE live_scope AS (
      SELECT post.post_id, author.user_id AS author_user_id, community.community_id, feed.rss_feed_id, alias.topic_alias_id, story.story_id
      FROM post_publication_dirty_work work
      LEFT JOIN post_publication_post_identities post ON post.id = work.post_id
      LEFT JOIN post_publication_author_identities author ON author.id = work.author_user_id
      LEFT JOIN post_publication_community_identities community ON community.id = work.community_id
      LEFT JOIN post_publication_rss_feed_identities feed ON feed.id = work.rss_feed_id
      LEFT JOIN post_publication_topic_alias_identities alias ON alias.id = work.topic_alias_id
      LEFT JOIN post_publication_story_identities story ON story.id = work.story_id
      WHERE work.id = ${work.id} AND work.generation = ${work.generation}
    ), directly_scoped_posts AS (`
  query.append(scopedPosts)
  if (selectedPostIds) query.append(sql`)`)
  else
    query.append(sql`), scoped_posts AS (
      SELECT id FROM directly_scoped_posts
      UNION
      SELECT child.id FROM posts child
      JOIN scoped_posts ancestor ON child.parent_id = ancestor.id
      WHERE child.post_type = 'comment'
    )`)
  query.append(sql` SELECT candidate.id, candidate.parent_id, candidate.root_id,
      candidate.created_by_id,
      candidate.community_id, candidate.post_type,
      to_char(candidate.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS sitemap_day, `)
  query.append(publicationEligibilityFingerprintSql()).append(sql` AS eligibility_fingerprint, `)
  query.append(sql` (`)
  query.append(buildPublicPostEligibilityFilter('candidate', 'root')).append(sql`) AS is_public
    FROM scoped_posts scoped
    JOIN posts candidate ON candidate.id = scoped.id
    JOIN posts root ON root.id = COALESCE(candidate.root_id, candidate.id)`)
  if (!selectedPostIds)
    query.append(
      sql` WHERE (${work.cursor_post_id}::uuid IS NULL OR candidate.id > ${work.cursor_post_id}::uuid)`,
    )
  query.append(sql` ORDER BY candidate.id LIMIT ${limit}`)
  const { rows } = await write<ReconciliationPost>(query)
  return rows
}
