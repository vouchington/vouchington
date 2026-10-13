import { read } from '@data-stores/psql'
import type { ScenarioPlanContract } from './plan-expectations.mts'
import { seedUuid } from './seed-data/common.mts'

// Both forced plan modes: maximum measured processed rows, plus 20% rounded up.
const measuredBudgets = {
  'feed-posts-batch': {
    posts: 240,
    post_moderation_versions: 0,
    post_moderation_dispositions: 0,
    post_locks: 0,
    post_slugs: 62,
    post_clearance_changes: 60,
    users: 60,
    facebook_accounts: 0,
    apple_accounts: 0,
    google_accounts: 0,
    x_accounts: 0,
    linkedin_accounts: 0,
    microsoft_accounts: 0,
    github_accounts: 0,
    image_surface_placements: 0,
    images: 120,
    media_delivery_registry_records: 120,
    media_placements: 120,
    media_delivery_registry_changes: 240,
    agents: 0,
    user_roles: 0,
    user_role_types: 0,
    post_review_topic_ratings: 21,
    topics: 143,
    relation__topic__category__topic: 124,
    relation__post__category__topic: 60,
    post_topic_alias_sources: 120,
    topic_aliases: 60,
    post_explicit_topic_categories: 60,
    post_images: 120,
    image_placements: 120,
    post_topic_recommendations: 2,
    url_hostnames: 0,
    post_topic_recommendation_hostnames: 0,
    urls: 0,
    post_topic_recommendation_landing_page_urls: 0,
  },
  'post-by-slug': {
    post_slugs: 3,
    posts: 3,
    post_clearance_changes: 2,
    post_moderation_versions: 0,
    post_moderation_dispositions: 0,
    post_locks: 0,
    users: 2,
    facebook_accounts: 0,
    apple_accounts: 0,
    google_accounts: 0,
    x_accounts: 0,
    linkedin_accounts: 0,
    microsoft_accounts: 0,
    github_accounts: 0,
    image_surface_placements: 0,
    images: 3,
    media_delivery_registry_records: 3,
    media_placements: 3,
    media_delivery_registry_changes: 5,
    agents: 0,
    user_roles: 0,
    user_role_types: 0,
    post_review_topic_ratings: 0,
    topics: 4,
    relation__topic__category__topic: 0,
    relation__post__category__topic: 2,
    post_topic_alias_sources: 3,
    topic_aliases: 2,
    post_explicit_topic_categories: 2,
    post_images: 3,
    image_placements: 3,
    post_topic_recommendations: 2,
    url_hostnames: 0,
    post_topic_recommendation_hostnames: 0,
    urls: 0,
    post_topic_recommendation_landing_page_urls: 0,
  },
} as const

/** Resolve the fixture leaf indexes rather than pinning the current calendar month. */
export async function getViewPostsHydrationContract(
  scenario: keyof typeof measuredBudgets,
): Promise<ScenarioPlanContract> {
  const { rows } = await read<{ index_name: string }>(
    `/* getViewPostsHydrationContract */ SELECT index_class.relname AS index_name
     FROM pg_index index_metadata
     JOIN pg_class index_class ON index_class.oid = index_metadata.indexrelid
     WHERE index_metadata.indisprimary AND index_metadata.indrelid IN (
       SELECT tableoid FROM post_explicit_topic_categories WHERE post_id = $1
       UNION SELECT tableoid FROM post_review_topic_ratings WHERE post_id = $2
       UNION SELECT tableoid FROM post_topic_recommendations WHERE post_id = $3
     )`,
    [seedUuid(0, '05'), seedUuid(1, '05'), seedUuid(3, '05')],
  )
  if (rows.length !== 3)
    throw new Error('Post hydration fixtures must have all three child indexes')
  return {
    expectations: [
      ...Object.entries(measuredBudgets[scenario]).map(([relation, max]) => ({
        kind: 'maxProcessedRows' as const,
        relation,
        max,
      })),
      {
        kind: 'usesIndexes',
        indexes: [
          'idx_post_slugs__post_id__created_at_desc',
          'idx_post_images__post_id__order_index',
          'post_topic_alias_sources_post_id_topic_alias_id_source_key',
          ...rows.map(row => row.index_name),
        ],
      },
    ],
  }
}
