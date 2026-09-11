import sql from 'sql-template-strings'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'

export type PublicationProjectionIdentity = {
  topicIds: string[]
  identityKeys: Array<{ kind: string; value: string }>
  sitemapTargets: Array<{ postType: string; day: string }>
}

/**
 * Current projection identities persisted in receipts for compensating shadow repair.
 * `topicIds` is authorship ∪ membership (source rows ∪ positive alias relations) — every post that
 * could plausibly be projected under a topic, not only currently-visible membership. Over-inclusion
 * here is safe: shadow repair un-writes a stale identity idempotently, while a missing identity would
 * leak a stale projection.
 */
export function publicationProjectionIdentitySql() {
  return sql`jsonb_build_object(
    'topicIds', COALESCE((
      SELECT jsonb_agg(topic_id ORDER BY topic_id) FROM (
        SELECT topic_id FROM post_review_topic_ratings WHERE post_id = candidate.id
        UNION SELECT topic_id FROM post_data_point_topics WHERE post_id = candidate.id
        UNION SELECT object_id FROM relation__post__category__topic
          WHERE subject_id = candidate.id AND deleted_at IS NULL
        UNION SELECT alias.topic_id FROM post_topic_alias_sources source
          JOIN topic_aliases alias ON alias.id = source.topic_alias_id
          WHERE source.post_id = candidate.id AND alias.topic_id IS NOT NULL
        UNION SELECT alias.topic_id FROM relation__post__category__topic_alias relation
          JOIN topic_aliases alias ON alias.id = relation.object_id
          WHERE relation.subject_id = candidate.id
            AND relation.deleted_at IS NULL
            AND relation.votes_score_net > 0
            AND alias.topic_id IS NOT NULL
        ORDER BY topic_id
      ) current_topics
    ), '[]'::jsonb),
    'identityKeys', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kind', kind, 'value', value) ORDER BY kind, value)
      FROM (
        SELECT 'author' AS kind, candidate.created_by_id::text AS value
        UNION SELECT 'author', author.username FROM users author WHERE author.id = candidate.created_by_id
        UNION SELECT 'community', candidate.community_id::text
        UNION SELECT 'community', root.community_id::text
        UNION SELECT 'community_slug', community.slug FROM communities community
          WHERE community.id IN (candidate.community_id, root.community_id)
        UNION SELECT 'post_slug', post_slug.slug FROM post_slugs post_slug
          WHERE post_slug.post_id = candidate.id
        UNION SELECT 'rss_feed', source.rss_feed_id::text FROM post__stories post_story
          JOIN rss_feed_items item ON item.story_id = post_story.story_id AND item.deleted_at IS NULL
          JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
          WHERE post_story.post_id = root.id
        ORDER BY kind, value
      ) current_identity WHERE value IS NOT NULL
    ), '[]'::jsonb),
    'sitemapTargets', CASE
      WHEN candidate.post_type::text = ANY(${SITEMAP_CONFIG.POST_TYPES}::text[])
      THEN jsonb_build_array(jsonb_build_object(
        'postType', candidate.post_type,
        'day', to_char(candidate.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      )) ELSE '[]'::jsonb END
  )`
}
