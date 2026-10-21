import { write } from '@data-stores/psql'

export async function printPlanDiagnostics(vacuumTargets: readonly string[]): Promise<void> {
  const relationNames = [
    // Heap size and `id` correlation decide the posts window-scan plans; CI logs never carried them.
    'posts__default',
    ...vacuumTargets,
    'idx_communities__search',
    'idx_community_search_counts__listed_virtual_subscriptions',
    'idx_community_members__unique',
    'idx_comm_post_reviews__approved_visible',
    'relation__post__category__topic__default',
    'post_review_topic_ratings__default',
    'post_data_point_topics__default',
  ]
  const relationStats = await write(
    `/* seedExplainData */ SELECT c.relname, c.relpages, c.reltuples,
      c.relallvisible, s.last_analyze, s.last_vacuum, s.last_autovacuum
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_all_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relname = ANY($1::name[])
    ORDER BY c.relname`,
    [relationNames],
  )
  const columnStats = await write(
    `/* seedExplainData */ SELECT tablename, attname, n_distinct, correlation,
      md5(COALESCE(most_common_vals::text, '')) AS mcv_md5
    FROM pg_stats
    WHERE schemaname = 'public' AND tablename = ANY($1::name[])
      AND attname = ANY($2::name[])
    ORDER BY tablename, attname`,
    [
      relationNames,
      [
        'id',
        'subject_id',
        'object_id',
        'topic_id',
        'rss_feed_item_id',
        'post_id',
        'community_id',
        'user_id',
        'list_item_count',
        'virtual_subscription_count',
        'search_vector',
      ],
    ],
  )
  const seededKeys = await write(
    `/* seedExplainData */
    SELECT 'relation__post__category__topic' AS relation, count(*) AS rows,
      md5(COALESCE(string_agg(id::text, ',' ORDER BY id), '')) AS key_md5
    FROM relation__post__category__topic
    UNION ALL SELECT 'rss_feeds', count(*), md5(COALESCE(string_agg(id::text, ',' ORDER BY id), ''))
    FROM rss_feeds
    UNION ALL SELECT 'rss_feed_item_categories', count(*),
      md5(COALESCE(string_agg(rss_feed_item_id::text || ':' || category_identity_id::text,
        ',' ORDER BY rss_feed_item_id, category_identity_id), ''))
    FROM rss_feed_item_categories
    UNION ALL SELECT 'topics', count(*), md5(COALESCE(string_agg(id::text, ',' ORDER BY id), ''))
    FROM topics
    UNION ALL SELECT 'post_review_topic_ratings', count(*),
      md5(COALESCE(string_agg(post_id::text || ':' || topic_id::text,
        ',' ORDER BY post_id, topic_id), ''))
    FROM post_review_topic_ratings
    UNION ALL SELECT 'post_data_point_topics', count(*),
      md5(COALESCE(string_agg(post_id::text || ':' || topic_id::text,
        ',' ORDER BY post_id, topic_id), ''))
    FROM post_data_point_topics`,
  )
  console.log(
    'EXPLAIN seed plan diagnostics:',
    JSON.stringify({
      relations: relationStats.rows,
      columns: columnStats.rows,
      keys: seededKeys.rows,
    }),
  )
}
