import { write } from '@data-stores/psql'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import sql from 'sql-template-strings'
import type { ClaimedPostPublicationDirtyWork } from './types.mts'
import { publicationEligibilityFingerprintSql } from './fingerprint.mts'
import {
  publicationProjectionIdentitySql,
  type PublicationProjectionIdentity,
} from './projection-identity.mts'

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
  projection_identity: PublicationProjectionIdentity
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
      JOIN posts candidate ON candidate.id = retained.uuid_value OR candidate.root_id = retained.uuid_value
      WHERE retained.dirty_work_id = ${work.id} AND retained.kind = 'impact_post'
      UNION
      SELECT candidate.id
      FROM post_publication_dirty_work_keys retained
      JOIN posts root ON root.community_id = retained.uuid_value AND root.root_id IS NULL
      JOIN posts candidate ON candidate.id = root.id OR candidate.root_id = root.id
      WHERE retained.dirty_work_id = ${work.id} AND retained.kind = 'impact_community'
      UNION SELECT ${work.post_id}::uuid WHERE ${work.post_id}::uuid IS NOT NULL
      UNION
      SELECT candidate.id
      FROM posts candidate
      JOIN posts root ON root.id = COALESCE(candidate.root_id, candidate.id)
      WHERE (${work.post_id}::uuid IS NOT NULL AND (candidate.id = ${work.post_id}::uuid OR root.id = ${work.post_id}::uuid))
         OR (${work.author_user_id}::uuid IS NOT NULL AND (candidate.created_by_id = ${work.author_user_id}::uuid OR root.created_by_id = ${work.author_user_id}::uuid))
         OR (${work.community_id}::uuid IS NOT NULL AND root.community_id = ${work.community_id}::uuid)
         OR (${work.rss_feed_id}::uuid IS NOT NULL AND EXISTS (
              SELECT 1 FROM post__stories ps
              JOIN rss_feed_items item ON item.story_id = ps.story_id AND item.deleted_at IS NULL
              JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
              WHERE ps.post_id = root.id AND source.rss_feed_id = ${work.rss_feed_id}::uuid
            ))
      UNION
      SELECT source.post_id
      FROM (
      SELECT DISTINCT post_id
      FROM post_topic_alias_sources
      WHERE topic_alias_id = ${work.topic_alias_id}::uuid
      ) source
      UNION
      SELECT DISTINCT relation.subject_id
      FROM relation__post__category__topic_alias relation
      WHERE relation.object_id = ${work.topic_alias_id}::uuid
        AND relation.deleted_at IS NULL
        AND relation.votes_score_net > 0`
  const query = selectedPostIds
    ? sql`/* listPublicationCandidates */ WITH scoped_posts AS (`
    : sql`/* listPublicationCandidates */ WITH RECURSIVE directly_scoped_posts AS (`
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
  query.append(publicationProjectionIdentitySql()).append(sql` AS projection_identity,
      (`)
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
