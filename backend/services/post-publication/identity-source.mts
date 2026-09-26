import { snapshotKeyPayloadSql } from './concrete-key-columns.mts'
import sql, { type SQLStatement } from 'sql-template-strings'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'

export type PublicationSnapshotKey = {
  kind:
    | 'topic'
    | 'author'
    | 'author_username'
    | 'community'
    | 'community_slug'
    | 'post_slug'
    | 'rss_feed'
    | 'sitemap_target'
  uuidValue: string | null
  textValue: string | null
  postType: string | null
  day: string | null
}

/** The exact identity set, shared by capture, staging and SQL-side comparisons. */
export function publicationIdentityRowsSql(postId: SQLStatement): SQLStatement {
  const statement = sql`WITH candidate AS (SELECT * FROM posts WHERE id = `
  statement.append(postId).append(sql`), root AS (
    SELECT post.* FROM posts post JOIN candidate ON post.id = COALESCE(candidate.root_id, candidate.id)
  )
  SELECT 'topic'::text AS kind, topic_id AS uuid_value, NULL::text AS text_value,
    NULL::post_types AS post_type, NULL::date AS day
    FROM post_review_topic_ratings JOIN candidate ON post_id = candidate.id
  UNION SELECT 'topic', topic_id, NULL, NULL, NULL FROM post_data_point_topics JOIN candidate ON post_id = candidate.id
  UNION SELECT 'topic', relation.object_id, NULL, NULL, NULL FROM relation__post__category__topic relation JOIN candidate ON relation.subject_id = candidate.id WHERE relation.deleted_at IS NULL
  UNION SELECT 'topic', alias.topic_id, NULL, NULL, NULL FROM post_topic_alias_sources source
    JOIN candidate ON source.post_id = candidate.id JOIN topic_aliases alias ON alias.id = source.topic_alias_id WHERE alias.topic_id IS NOT NULL
  UNION SELECT 'topic', alias.topic_id, NULL, NULL, NULL FROM relation__post__category__topic_alias relation
    JOIN candidate ON relation.subject_id = candidate.id JOIN topic_aliases alias ON alias.id = relation.object_id
    WHERE relation.deleted_at IS NULL AND relation.votes_score_net > 0 AND alias.topic_id IS NOT NULL
  UNION SELECT 'author', created_by_id, NULL, NULL, NULL FROM candidate WHERE created_by_id IS NOT NULL
  UNION SELECT 'author_username', NULL, username, NULL, NULL FROM users JOIN candidate ON users.id = candidate.created_by_id WHERE username IS NOT NULL
  UNION SELECT 'community', community_id, NULL, NULL, NULL FROM candidate WHERE community_id IS NOT NULL
  UNION SELECT 'community', community_id, NULL, NULL, NULL FROM root WHERE community_id IS NOT NULL
  UNION SELECT 'community_slug', NULL, slug, NULL, NULL FROM communities JOIN candidate ON communities.id = candidate.community_id WHERE slug IS NOT NULL
  UNION SELECT 'community_slug', NULL, slug, NULL, NULL FROM communities JOIN root ON communities.id = root.community_id WHERE slug IS NOT NULL
  UNION SELECT 'post_slug', NULL, slug, NULL, NULL FROM post_slugs JOIN candidate ON post_id = candidate.id
  UNION SELECT 'rss_feed', source.rss_feed_id, NULL, NULL, NULL FROM post__stories ps JOIN root ON ps.post_id = root.id
    JOIN rss_feed_items item ON item.story_id = ps.story_id AND item.deleted_at IS NULL JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
  UNION SELECT 'sitemap_target', NULL, NULL, post_type, (created_at AT TIME ZONE 'UTC')::date
    FROM candidate WHERE post_type = ANY(${SITEMAP_CONFIG.POST_TYPES}::post_types[])`)
  return statement
}

export function publicationSnapshotMismatchSql(
  postId: SQLStatement,
  snapshotId: SQLStatement,
): SQLStatement {
  const statement = sql`EXISTS (WITH source AS (`
  statement
    .append(publicationIdentityRowsSql(postId))
    .append(sql`), stored AS (
    SELECT `)
    .append(snapshotKeyPayloadSql())
    .append(sql` FROM post_publication_identity_snapshot_keys key WHERE snapshot_id = `)
  statement.append(snapshotId).append(sql`)
    SELECT * FROM ((SELECT * FROM source EXCEPT SELECT * FROM stored)
      UNION ALL (SELECT * FROM stored EXCEPT SELECT * FROM source)) difference)`)
  return statement
}
