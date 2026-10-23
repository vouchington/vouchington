import { write } from '@data-stores/psql'
import { CRAWL_SEED_PREFIX, SEED_PREFIX } from './common.mts'
import { printPlanDiagnostics } from './plan-diagnostics.mts'

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
  { table: 'user_data_requests', column: 'id', pattern: '019e0000-9100-%' },
  { table: 'facebook_accounts', column: 'id', pattern: '019e0000-9200-%' },
  { table: 'bedrock_embedding_batches', column: 'id', pattern: '019e0000-9300-%' },
  { table: 'crawls', column: 'id', pattern: `${CRAWL_SEED_PREFIX}-1300-%` },
  { table: 'crawls', column: 'id', pattern: `${CRAWL_SEED_PREFIX}-1400-%` },
  { table: 'membership_provider_evidence_records', column: 'id', pattern: '019e0000-9800-%' },
  { table: 'membership_provider_lineages', column: 'id', pattern: '019e0000-9700-%' },
  { table: 'membership_provider_contexts', column: 'id', pattern: '019e0000-9600-%' },
  { table: 'membership_provider_contexts', column: 'id', pattern: '019e0000-9601-%' },
  { table: 'membership_provider_evidence_records', column: 'id', pattern: '019e0000-9a00-%' },
  { table: 'membership_provider_evidence_records', column: 'id', pattern: '019e0000-99ff-%' },
  { table: 'membership_verifications', column: 'id', pattern: '019e0000-a500-%' },
  {
    table: 'membership_verification_processing_work_items',
    column: 'membership_verification_id',
    pattern: '019e0000-a500-%',
  },
  { table: 'copyright_notice_email_intakes', column: 'id', pattern: '019e0000-9b00-%' },
  { table: 'copyright_notice_storage_objects', column: 'id', pattern: '019e0000-9d00-%' },
  { table: 'notification_push_intents', column: 'notification_id' },
  { table: 'membership_sources', column: 'id', pattern: '019e0000-b500-%' },
  { table: 'membership_grants', column: 'id', pattern: '019e0000-b600-%' },
  { table: 'membership_source_states', column: 'membership_source_id', pattern: '019e0000-b500-%' },
  { table: 'memberships', column: 'id', pattern: '019e0000-b700-%' },
  { table: 'copyright_notice_email_intake_parses', column: 'id', pattern: '019e0000-9c00-%' },
  { table: 'membership_sources', column: 'id', pattern: '019e0000-2000-%' },
  { table: 'membership_sources', column: 'id', pattern: '019e0000-2100-%' },
  { table: 'membership_google_play_purchase_tokens', column: 'id', pattern: '019e0000-a300-%' },
  { table: 'membership_microsoft_store_credentials', column: 'id', pattern: '019e0000-a400-%' },
  {
    table: 'topic_alias_category_mapping_reconciliations',
    column: 'topic_alias_id',
    pattern: '019e0000-ad00-%',
  },
  { table: 'rss_feed_item_category_snapshot_reconciliations', column: 'rss_feed_item_id' },
  { table: 'rss_feed_item_source_category_snapshots', column: 'rss_feed_item_id' },
  {
    table: 'story_post_related_url_projection_jobs',
    column: 'story_id',
    pattern: '019e0000-1700-%',
  },
  { table: 'facebook_friends', column: 'facebook_friend_id', pattern: 'seed-fb-user-%' },
]

export const ANALYZE_TARGETS = [
  ...new Set([
    ...SEEDED_ROW_COUNT_TARGETS.map(({ table }) => table),
    'rss_feed_items',
    'user_engagement_email_candidates',
    'user_engagement_email_sends',
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
    // Triggers populate counts while the community seed runs; it has no direct row-count target.
    'community_search_counts',
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
  console.log('\nRunning VACUUM (ANALYZE) on seeded tables...')
  // Settle first-capture statistics and visibility before autovacuum can choose the plan.
  // PostgreSQL includes default children when vacuuming partitioned parents.
  for (const table of ANALYZE_TARGETS)
    await write(`/* seedExplainData */ VACUUM (ANALYZE) "${table}"`)
  await printPlanDiagnostics(ANALYZE_TARGETS)
}
