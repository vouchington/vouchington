import { write } from '@data-stores/psql'
import { CRAWL_SEED_PREFIX, SEED_PREFIX } from './common.mts'

interface TableInfo {
  table: string
  column: string
  prefix?: string
  pattern?: string
}

export const SEEDED_ROW_COUNT_TARGETS: readonly TableInfo[] = [
  { table: 'users', column: 'id' },
  { table: 'follower_distributions', column: 'sender_user_id' },
  { table: 'follower_distribution_deliveries', column: 'recipient_user_id' },
  { table: 'user_email_addresses', column: 'user_id' },
  { table: 'oauth_clients', column: 'id' },
  { table: 'topics', column: 'id' },
  { table: 'individual_cards', column: 'id' },
  { table: 'individual_rewards_program_point_valuations', column: 'id' },
  { table: 'spending_entries', column: 'id' },
  { table: 'households', column: 'id' },
  { table: 'household_members', column: 'household_id' },
  { table: 'spending_category_topics', column: 'topic_id' },
  { table: 'individual_rewards_program_statuses', column: 'id' },
  { table: 'posts', column: 'id' },
  { table: 'post_clearance_changes', column: 'post_id' },
  { table: 'post_feed_shares', column: 'recipient_user_id' },
  { table: 'post_admission_reservations', column: 'route', pattern: 'explain-admission' },
  { table: 'user_topic_import_attempts', column: 'intent_sha256', pattern: '000%' },
  { table: 'url_hostnames', column: 'id' },
  { table: 'urls', column: 'id' },
  { table: 'rss_feeds', column: 'id' },
  { table: 'rss_feed_item_guids', column: 'guid', pattern: 'seed-item-guid-%' },
  { table: 'rss_feed_item_sources', column: 'rss_feed_id' },
  { table: 'rss_feed_item_categories', column: 'topic_id' },
  { table: 'relation__user__follow__user', column: 'subject_id' },
  { table: 'relation__user__mute__user', column: 'subject_id' },
  { table: 'relation__user__block__user', column: 'subject_id' },
  { table: 'remote_actors', column: 'id' },
  { table: 'relation__remote_actor__follow__user', column: 'subject_id' },
  { table: 'relation__post__category__topic', column: 'subject_id' },
  { table: 'relation__topic__parent__topic', column: 'subject_id' },
  { table: 'relation__user__follow__rss_feed', column: 'subject_id' },
  { table: 'relation__user__follow__topic', column: 'subject_id' },
  { table: 'notifications', column: 'user_id' },
  { table: 'conversations', column: 'id' },
  { table: 'conversation_messages', column: 'conversation_id' },
  { table: 'post_votes', column: 'user_id' },
  { table: 'topic_votes', column: 'user_id' },
  { table: 'crawls', column: 'id', prefix: CRAWL_SEED_PREFIX },
  { table: 'crawl_chunks', column: 'crawl_id', prefix: CRAWL_SEED_PREFIX },
  { table: 'post_slugs', column: 'post_id' },
  { table: 'topic_aliases', column: 'topic_id' },
  { table: 'user_profile_links', column: 'user_id' },
  { table: 'communities', column: 'id' },
  { table: 'community_members', column: 'community_id' },
  { table: 'community_post_reviews', column: 'community_id' },
  { table: 'community_list_topics', column: 'community_id' },
  { table: 'post_data_point_topics', column: 'post_id' },
  { table: 'post_review_topic_ratings', column: 'post_id' },
  { table: 'hostname_votes', column: 'hostname_id' },
  { table: 'relation__post__related__url', column: 'object_id' },
  { table: 'referral_program_topics', column: 'topic_id' },
  { table: 'user_referral_program_links', column: 'referral_program_topic_id' },
  { table: 'facebook_accounts', column: 'facebook_user_id', pattern: 'seed-fb-user-%' },
  { table: 'facebook_friends', column: 'facebook_friend_id', pattern: 'seed-fb-user-%' },
]

export const ANALYZE_TARGETS = [
  ...new Set([
    ...SEEDED_ROW_COUNT_TARGETS.map(({ table }) => table),
    'rss_feed_items',
    'api_keys',
    'blocklisted_domains',
    'bedrock_nova_multimodal_v1_embeddings',
    'domain_blocklist_sources',
    'user_agent_strings',
    'post_topic_alias_sources',
    'post_explicit_topic_categories',
    'post_images',
    'image_placements',
    'media_placements',
    'images',
    'media_delivery_registry_records',
    'media_delivery_registry_changes',
    'post_topic_recommendations',
    'relation__topic__category__topic',
    'relation__post__category__topic_alias',
    'relation__rss_feed_item__category__topic_alias',
  ]),
]

export function buildSeededRowCountQuery({ table, column, prefix, pattern }: TableInfo): {
  text: string
  values: readonly string[]
} {
  return {
    text: `/* printSeedRowCounts */ SELECT COUNT(*)::text AS count FROM "${table}" WHERE "${column}"::text LIKE $1`,
    values: [pattern ?? `${prefix ?? SEED_PREFIX}%`],
  }
}

export async function checkpointSeed(label: string): Promise<void> {
  console.log(`Checkpointing seed data after ${label}...`)
  await write('/* seedExplainData */ CHECKPOINT')
}

export async function printRowCounts(): Promise<void> {
  console.log('\nRow counts (seed data):')
  for (const target of SEEDED_ROW_COUNT_TARGETS) {
    const { text, values } = buildSeededRowCountQuery(target)
    const result = await write<{ count: string }>(text, values)
    const { table } = target
    console.log(`  ${table}: ${result.rows[0]?.count ?? '?'}`)
  }
}
export async function runAnalyze(): Promise<void> {
  console.log('\nRunning ANALYZE on seeded tables...')
  for (const table of ANALYZE_TARGETS) {
    await write(`/* seedExplainData */ ANALYZE "${table}"`).catch(err =>
      console.error(`seedExplainData: ANALYZE "${table}" failed`, err),
    )
  }
  // Paired CI captures changed scans on these seeded relations across fresh databases while
  // retaining their SQL and row counts. Settle their visibility maps and statistics before the
  // first capture, rather than letting autovacuum timing choose the measured plan. PostgreSQL
  // includes each partition's default child when vacuuming its parent.
  await write(
    '/* seedExplainData */ VACUUM (ANALYZE) "relation__post__category__topic", "rss_feeds", "rss_feed_item_categories", "topics", "post_review_topic_ratings", "post_data_point_topics"',
  )
  const relationNames = [
    'relation__post__category__topic',
    'relation__post__category__topic__default',
    'rss_feeds',
    'rss_feed_item_categories',
    'topics',
    'post_review_topic_ratings',
    'post_review_topic_ratings__default',
    'post_data_point_topics',
    'post_data_point_topics__default',
  ]
  const relationStats = await write(
    `/* seedExplainData */ SELECT c.relname, c.relpages, c.reltuples,
      c.relallvisible, s.last_autovacuum
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
    [relationNames, ['id', 'subject_id', 'object_id', 'topic_id', 'rss_feed_item_id', 'post_id']],
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
