import { write } from '@data-stores/psql'
import { CRAWL_SEED_PREFIX, SEED_PREFIX } from './common.mts'
import { SUPPORT_MESSAGE_SEED } from './support-messages.mts'

interface TableInfo {
  table: string
  column: string
  prefix?: string
  pattern?: string
}

export const SEEDED_ROW_COUNT_TARGETS: readonly TableInfo[] = [
  { table: 'users', column: 'id' },
  { table: 'topics', column: 'id' },
  { table: 'individual_cards', column: 'id' },
  { table: 'individual_rewards_program_point_valuations', column: 'id' },
  { table: 'spending_entries', column: 'id' },
  { table: 'households', column: 'id' },
  { table: 'household_members', column: 'household_id' },
  { table: 'topics__spending_categories', column: 'topic_id' },
  { table: 'individual_rewards_program_statuses', column: 'id' },
  { table: 'posts', column: 'id' },
  { table: 'post_admission_reservations', column: 'route', pattern: 'explain-admission' },
  { table: 'user_topic_import_attempts', column: 'intent_sha256', pattern: '000%' },
  { table: 'url_hostnames', column: 'id' },
  { table: 'urls', column: 'id' },
  { table: 'rss_feeds', column: 'id' },
  { table: 'rss_feed_item_ids', column: 'guid', pattern: 'seed-item-guid-%' },
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
  { table: 'community_list_items__topics', column: 'community_id' },
  { table: 'post_data_point_topics', column: 'post_id' },
  { table: 'post_review_topic_ratings', column: 'post_id' },
  { table: 'hostname_votes', column: 'hostname_id' },
  { table: 'relation__post__related__url', column: 'object_id' },
  { table: 'topics__referral_programs', column: 'topic_id' },
  { table: 'user_referral_program_links', column: 'referral_program_id' },
  { table: 'facebook_accounts', column: 'facebook_user_id', pattern: 'seed-fb-user-%' },
  { table: 'facebook_friends', column: 'facebook_user_id', pattern: 'seed-fb-user-%' },
  {
    table: 'support_messages',
    column: 'support_thread_id',
    pattern: SUPPORT_MESSAGE_SEED.threadId,
  },
]

export const ANALYZE_TARGETS = [
  ...new Set([...SEEDED_ROW_COUNT_TARGETS.map(({ table }) => table), 'rss_feed_items']),
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
    await write(`/* seedExplainData */ ANALYZE "${table}"`).catch(error =>
      console.error(`seedExplainData: ANALYZE "${table}" failed`, error),
    )
  }
}
