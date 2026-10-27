import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { buildUnboundedUnpartitionedTables as buildPlatformUnboundedTables } from '@vouchington/utils/schema-growth'
import { EXTRA_UNBOUNDED_TABLES } from './schema-growth-unbounded-extra.mts'
import { RETAINED_RELATION_GROWTH_POLICIES } from './schema-growth-retained-identities.mts'
const INDEFINITE_ENTITY_AND_CONTENT_TABLES = [
  'communities',
  'conversations',
  'images',
  'user_lists',
  'podcast_shows',
  'remote_actors',
  'rss_category_identities',
  'rss_feeds',
  'topics',
  'url_hostnames',
  'urls',
  'users',
] as const
const UNBOUNDED_AUDIT_AND_WORKFLOW_TABLES = [
  'admin_import_batches',
  'admin_import_rows',
  'activitypub_inbox_activities',
  'community_agent_prompt_revisions',
  'dynamic_configuration_revisions',
  'follower_distribution_deliveries',
  'follower_distributions',
  'membership_changes',
  'membership_ineligible_purchase_reversal_refund_scans',
  'membership_ineligible_purchase_reversal_refund_observations',
  'membership_refund_operation_attempts',
  'membership_refund_operation_attempt_metadata_scans',
  'membership_refunds',
  'membership_verifications',
  'stripe_events',
  'user_data_requests',
  'user_engagement_email_sends',
  'user_import_requests',
  'user_rss_feed_import_batches',
  'user_rss_feed_import_rows',
  'user_rss_feed_import_row_discoveries',
  'identity_verification_attempts',
  'vote_integrity_flags',
] as const
const UNBOUNDED_MEMBERSHIP_WORK_ITEMS = [
  'membership_google_play_acknowledgment_work_items',
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
  return buildPlatformUnboundedTables({
    partitionedTables,
    groups: [
      {
        tables: INDEFINITE_ENTITY_AND_CONTENT_TABLES,
        reason:
          'Durable entity/content rows grow with product adoption; indexed access remains selective.',
      },
      {
        tables: UNBOUNDED_AUDIT_AND_WORKFLOW_TABLES,
        reason:
          'Append-oriented audit/workflow rows currently have no enforced retention window; each needs an owner and window before launch.',
      },
      {
        tables: UNBOUNDED_MEMBERSHIP_WORK_ITEMS,
        reason:
          'Terminal work remains until its owning parent is removed; no time-based retention applies.',
      },
      {
        tables: INDEFINITE_EDGE_TABLES,
        reason: 'Relationship edges grow with entities but remain index-selective.',
      },
      {
        tables: EXTRA_UNBOUNDED_TABLES,
        reason: 'Rows grow with their owning entity or workflow.',
      },
    ],
    entries: [
      [
        'moderation_reports',
        'Unresolved reports remain available for staff action, with one pending report per reporter and target; resolved reports expire after 24 months. The open backlog has no time cap.',
      ],
      [
        'moderation_report_judgements',
        'The latest judgement per entity and undispatched work remain; only older dispatched judgements with a newer dispatched successor expire after 90 days.',
      ],
      [
        'moderation_training_feedbacks',
        'Ordinary feedback expires after 180 days, but false-positive labels for still-flagged posts remain. Repeated retained labels per live post have no enforced cardinality cap.',
      ],
      [
        'report_abuse_penalties',
        'Revoked penalties expire after 180 days; active penalties remain until explicitly revoked without automatic expiry or a unique current-row cap after source flags are deleted.',
      ],
      [
        'vote_weight_penalties',
        'Revoked penalties expire after 180 days; active penalties remain until explicitly revoked without automatic expiry or a unique current-row cap after source links are deleted.',
      ],
      [
        'user_moderator_notes',
        'Soft-deleted notes expire after 30 days, while live moderator-authored notes remain until explicitly removed; repeated live notes per user are not capped.',
      ],
      [
        'amazon_ses_address_suppressions',
        'One durable row per normalized address with a permanent bounce or complaint; address-key reads remain selective.',
      ],
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
        'community_search_counts',
        'One projected row per community grows with community adoption; indexed count order and keyed hydration bound search reads.',
      ],
      [
        'activitypub_inbox_envelopes',
        'Bounded signed ActivityPub envelope storage (maximum envelopes exceed GlideMQ job data): terminal outcomes delete rows, unverified rows expire after one hour, operational failures expire seven days after their immutable first failure, and bounded cleanup removes expired rows. Size tracks recent inbox backlog, not retained history.',
      ],
      [
        'ai_usage_provider_response_keys',
        'Permanent global response-id idempotency keys cannot be partitioned without weakening cross-partition uniqueness; the primary-key lookup remains selective.',
      ],
      [
        'ai_agent_call_receipts',
        'Permanent paid-call idempotency receipts require global operation-key uniqueness; the unique-key lookup remains selective.',
      ],
      [
        'classifier_run_requests',
        'Minimal request identity survives run payload retirement for pending recovery and exact deduplication while its real subject exists; bounded cleanup removes requests whose subject is gone before retained identity roots retire.',
      ],
      [
        'notification_push_intents',
        'Pending delivery work is retained until terminal and can grow without a time bound; terminal intents are deleted after 90 days, while the composite notification key and pending-work index keep recovery selective.',
      ],
      [
        'notification_push_intent_subscription_receipts',
        'Generation receipts retained with pending push intents; terminal intents expire after 90 days. Tombstone cleanup preserves subscriptions while any receipt survives.',
      ],
      ['web_push_endpoint_owners', 'Global claim key preserves cross-user endpoint uniqueness.'],
    ],
  })
}
