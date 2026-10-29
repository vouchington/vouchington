import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { buildUnboundedUnpartitionedTables as buildPlatformUnboundedTables } from '@vouchington/utils/schema-growth'
import { LEGAL_IDENTITY_GROWTH_POLICIES } from './schema-growth-legal-identities.mts'
import { EXTRA_UNBOUNDED_TABLES } from './schema-growth-unbounded-extra.mts'
import { RETAINED_RELATION_GROWTH_POLICIES } from './schema-growth-retained-identities.mts'
import { AI_USAGE_GROWTH_POLICIES } from './schema-growth-ai-usage.mts'
import { COPYRIGHT_RETENTION_UNBOUNDED_TABLES } from './schema-growth-classification-copyright.mts'
const INDEFINITE_ENTITY_AND_CONTENT_TABLES = [
  'communities',
  'conversations',
  'images',
  'user_lists',
  'podcast_shows',
  'rss_category_identities',
  'rss_feeds',
  'topics',
  'url_hostnames',
  'urls',
  'users',
] as const
const UNBOUNDED_AUDIT_AND_WORKFLOW_TABLES = [
  'community_agent_prompt_revisions',
  'dynamic_configuration_revisions',
  'membership_changes',
  'membership_ineligible_purchase_reversal_refund_scans',
  'membership_ineligible_purchase_reversal_refund_observations',
  'membership_refund_operation_attempts',
  'membership_refund_operation_attempt_metadata_scans',
  'membership_refunds',
  'membership_verifications',
  'topic_merge_operations',
  'stripe_events',
  'user_import_requests',
  'identity_verification_attempts',
  'vote_integrity_flags',
] as const
const UNBOUNDED_MEMBERSHIP_WORK_ITEMS = [
  'membership_google_play_acknowledgment_work_items',
] as const
const INDEFINITE_EDGE_TABLES = [
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
        'copyright_repeat_infringer_reviews',
        'Review traffic has no fixed cardinality bound. Each whole review row expires six calendar years after its own latest opening or outcome; bounded daily pages commit deletion and independent cyclic cursor progress together.',
      ],
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
      [
        'oauth_native_session_token_mints',
        'Native session token issuance audit is retained for at most 12 months, with active account preservation holds extending the window; indexed UUIDv7 pages and a durable cursor bound cleanup work.',
      ],
      [
        'copyright_decision_rationales',
        'Admitted legal decision attempts grow with case and review activity; preservation holds can extend the six-calendar-year retention window, while target and retention indexes keep reads selective.',
      ],
      ...COPYRIGHT_RETENTION_UNBOUNDED_TABLES,
      [
        'oauth_grant_retention_anchors',
        'One non-authorizing retained identity per OAuth grant; live grants persist, and ended anchors remain until consent evidence expires.',
      ],
      [
        'oauth_client_grant_markers',
        'One insert-only usage marker per OAuth client persists with that client so never-used cleanup cannot erase a formerly granted registration.',
      ],
      [
        'remote_actor_identities',
        'Exact external actor URI replay identities survive signing-key cache eviction while live caches or retained Follow/Like activities reference them; a bounded root sweep removes unreferenced identities.',
      ],
      [
        'activitypub_post_like_activities',
        'Active Like identity cycles retain exact replay scope; indexed terminal transitions expire only beyond every supported replay horizon, after child payload deletion.',
      ],
      [
        'activitypub_post_likes',
        'Active remote Likes grow with live posts; bounded retention deletes undone tally payloads after 30 days.',
      ],
      [
        'remote_actors',
        'Live signing-key caches remain while follow, Like, or inbox work references them; a capped sweep removes unreferenced cache rows after 90 days.',
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
      ...LEGAL_IDENTITY_GROWTH_POLICIES,
      [
        'activitypub_remote_follow_activities',
        'Active Follow cycles track live domain edges; replaced and undone cycles expire in bounded indexed pages from their terminal timestamp beyond the supported replay age.',
      ],
      ...AI_USAGE_GROWTH_POLICIES,
      [
        'community_search_counts',
        'One projected row per community grows with community adoption; indexed count order and keyed hydration bound search reads.',
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
