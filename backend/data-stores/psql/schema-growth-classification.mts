import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { EXTRA_UNBOUNDED_TABLES } from './schema-growth-unbounded-extra.mts'
import { RETAINED_RELATION_GROWTH_POLICIES } from './schema-growth-retained-identities.mts'
const INDEFINITE_ENTITY_AND_CONTENT_TABLES = [
  'communities',
  'conversations',
  'images',
  'user_lists',
  'podcast_shows',
  'remote_actors',
  'rss_feeds',
  'topics',
  'url_hostnames',
  'urls',
  'users',
] as const
const INDEFINITE_AUDIT_AND_WORKFLOW_TABLES = [
  'admin_import_batches',
  'admin_import_rows',
  'activitypub_distribution_work_items',
  'activitypub_inbox_activities',
  'community_activity_digest_work_items',
  'community_agent_prompt_revisions',
  'dynamic_configuration_revisions',
  'follower_distribution_deliveries',
  'follower_distributions',
  'membership_changes',
  'membership_entitlement_effects',
  'membership_ineligible_purchase_reversal_refund_scans',
  'membership_ineligible_purchase_reversal_refund_observations',
  'membership_purchase_intents',
  'membership_refund_operation_attempts',
  'membership_refund_operation_attempt_metadata_scans',
  'membership_refunds',
  'membership_verifications',
  'moderation_appeal_lifecycle_changes',
  'moderation_appeals',
  'moderation_cases',
  'moderation_report_judgements',
  'moderation_reports',
  'moderator_actions',
  'report_integrity_flags',
  'review_dispute_lifecycle_changes',
  'review_disputes',
  'amazon_ses_bounce_events',
  'stripe_events',
  'user_data_requests',
  'user_engagement_email_sends',
  'user_import_requests',
  'user_moderation_email_sends',
  'user_rss_feed_import_batches',
  'user_rss_feed_import_rows',
  'identity_verification_attempts',
  'vote_integrity_flags',
] as const
const INDEFINITE_EDGE_TABLES = [
  'activitypub_post_likes',
  'bluesky_follow_records',
  'community_list_posts',
  'community_list_rss_feeds',
  'community_list_topics',
  'community_list_url_hostnames',
  'community_list_urls',
  'community_members',
  'community_pinned_posts',
  'conversation_participants',
  'facebook_friends',
  'github_friends',
  'household_members',
  'user_list_posts',
  'user_list_rss_feed_items',
  'linkedin_accounts',
  'post_images',
  'post_slugs',
  'post_topic_alias_sources',
  'rss_feed_item_categories',
  'rss_feed_item_guids',
  'rss_feed_item_sources',
  'topic_aliases',
  'x_friends',
] as const
export function buildUnboundedUnpartitionedTables(
  partitionedTables: ReadonlySet<string>,
): Map<string, string> {
  return new Map([
    ...INDEFINITE_ENTITY_AND_CONTENT_TABLES.map(table =>
      typeof table === 'string'
        ? ([
            table,
            'Durable entity/content rows grow with product adoption; indexed access remains selective.',
          ] as const)
        : table,
    ),
    ...INDEFINITE_AUDIT_AND_WORKFLOW_TABLES.map(
      table => [table, 'Append-oriented audit/workflow history is retained indefinitely.'] as const,
    ),
    ...INDEFINITE_EDGE_TABLES.map(
      table =>
        [table, 'Relationship edges grow with entities but remain index-selective.'] as const,
    ),
    ...EXTRA_UNBOUNDED_TABLES.map(
      table => [table, 'Rows grow with their owning entity or workflow.'] as const,
    ),
    ...entityRelationMetadatum.flatMap(({ table_name }) =>
      partitionedTables.has(table_name)
        ? []
        : [
            [
              table_name,
              'Config-generated relationship edges grow with entities but remain index-selective.',
            ] as const,
          ],
    ),
    ...RETAINED_RELATION_GROWTH_POLICIES,
    [
      'activitypub_inbox_delivery_work_items',
      'Bounded ActivityPub inbox delivery queue: terminal outcomes delete rows, unverified rows expire after one hour, operational failures expire seven days after their immutable first failure, and bounded cleanup removes expired rows. Size tracks recent inbox backlog, not retained history.',
    ],
    [
      'ai_usage_provider_response_keys',
      'Permanent global response-id idempotency keys cannot be partitioned without weakening cross-partition uniqueness; the primary-key lookup remains selective.',
    ],
    [
      'notification_push_intents',
      'Pending delivery work is retained until terminal and can grow without a time bound; terminal intents are deleted after 90 days, while the composite notification key and pending-work index keep recovery selective.',
    ],
    [
      'notification_push_intent_subscription_receipts',
      'Generation receipts retained with pending push intents; terminal intents expire after 90 days.',
    ],
    ['web_push_endpoint_owners', 'Global claim key preserves cross-user endpoint uniqueness.'],
  ])
}
