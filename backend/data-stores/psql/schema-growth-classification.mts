import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { EXTRA_BOUNDED_TABLES } from './schema-growth-bounded-extra.mts'
import { EXTRA_UNBOUNDED_TABLES } from './schema-growth-unbounded-extra.mts'
export const STATIC_IDENTITY_EXCEPTIONS = new Map<string, string>([
  ['countries', 'Small ISO country lookup populated from a fixed reference set.'],
  ['currencies', 'Small ISO currency lookup populated from a fixed reference set.'],
  ['domain_blacklist_sources', 'Small administrator-managed source lookup.'],
  ['url_content_types', 'Small MIME-type lookup shared by URL rows.'],
  ['user_permission_types', 'Small static RBAC permission lookup.'],
  ['user_roles_types', 'Small static RBAC role lookup.'],
])
export const EXPLICIT_BOUNDED_TABLES = new Map<string, string>([
  ...STATIC_IDENTITY_EXCEPTIONS,
  ...EXTRA_BOUNDED_TABLES,
  [
    'oauth_authorizations',
    'Authorization rows expire after ten minutes and data retention deletes terminal or expired rows, bounding cardinality to recent OAuth traffic.',
  ],
  ['migrations', 'The migration ledger has exactly one row per checked-in migration.'],
  [
    'election_vote_migration_claims',
    'One durable claim per one-shot election vote migration, bounded by checked-in migrations.',
  ],
  ['queue_reconciliation_checkpoints', 'One durable high-water mark per queue domain.'],
  [
    'openai_background_responses',
    'Rows are deleted by the compare-and-set claim as soon as usage is recorded, or by the sweeper reconciler once reconciled, bounding cardinality to recently in-flight background responses.',
  ],
  [
    'post_admission_claims',
    'One short-lived lease per in-flight admission reservation; release deletes the lease and reservation deletion cascades to it, bounding cardinality to concurrent admission work.',
  ],
  [
    'post_admission_reservations',
    'Committed replays expire after 48 hours, abandoned reservations are pruned after 48 hours, and bounded cleanup deletes both classes, bounding cardinality to recent admission traffic.',
  ],
  ['ap_inbox_delivery_storage_counters', 'A true primary key limits the ledger to one row.'],
])
type NonDefaultIdException = { policy: 'uuidv7' | 'natural-or-provider'; rationale: string }
const naturalOrProviderId = (rationale: string): NonDefaultIdException => ({
  policy: 'natural-or-provider',
  rationale,
})
export const NON_DEFAULT_ID_EXCEPTIONS = new Map<string, NonDefaultIdException>([
  ['membership_google_play_recovery_cursors', naturalOrProviderId('Singleton recovery scan.')],
  ['membership_microsoft_store_recovery_cursors', naturalOrProviderId('Singleton recovery scan.')],
  ['bedrock_embeddings_batches', naturalOrProviderId('Bedrock owns the batch job identifier.')],
  ['community_agent_prompts', sharedParentUuidv7('agent_prompts')],
  ['rss_feed_items', sharedParentUuidv7('rss_feed_item_ids')],
  ['migrations', naturalOrProviderId('The checked-in migration filename is the key.')],
  ['user_metrics', sharedParentUuidv7('users')],
  [
    'user_sessions',
    { policy: 'uuidv7', rationale: 'The application supplies the UUIDv7 JWT session id.' },
  ],
])
function sharedParentUuidv7(parentTable: string) {
  const rationale = `The id is shared with its UUIDv7 ${parentTable} parent row.`
  return { policy: 'uuidv7' as const, rationale }
}
const INDEFINITE_ENTITY_AND_CONTENT_TABLES = [
  'communities',
  'conversations',
  'images',
  'lists',
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
  'activitypub_distribution_checkpoints',
  'ap_inbox_activities',
  'community_activity_digest_dispatch_windows',
  'community_agent_prompt_changes',
  'crm_contact_lifecycle_changes',
  'dynamic_config_change_logs',
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
  'ses_bounce_events',
  'stripe_events',
  'support_message_lifecycle_changes',
  'support_thread_lifecycle_changes',
  'user_data_requests',
  'user_deletion_audit_logs',
  'user_engagement_email_sends',
  'user_import_requests',
  'user_moderation_email_sends',
  'user_rss_feed_import_batches',
  'user_rss_feed_import_rows',
  'identity_verification_attempts',
  'vote_integrity_flags',
] as const
const INDEFINITE_EDGE_TABLES = [
  'ap_post_likes',
  'bluesky_follow_records',
  'community_list_items__posts',
  'community_list_items__rss_feeds',
  'community_list_items__topics',
  'community_list_items__url_hostnames',
  'community_list_items__urls',
  'community_members',
  'community_pinned_posts',
  'conversation_participants',
  'facebook_friends',
  'github_friends',
  'household_members',
  'list_items__posts',
  'list_items__rss_feed_items',
  'linkedin_accounts',
  'post_images',
  'post_slugs',
  'post_topic_alias_sources',
  'rss_feed_item_categories',
  'rss_feed_item_ids',
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
        : ([
            [
              table_name,
              'Config-generated relationship edges grow with entities but remain index-selective.',
            ],
          ] as const),
    ),
    [
      'ap_inbox_deliveries',
      'Bounded ActivityPub inbox delivery queue: terminal outcomes delete rows, unverified rows expire after one hour, operational failures expire seven days after their immutable first failure, and bounded cleanup removes expired rows. Size tracks recent inbox backlog, not retained history.',
    ],
    [
      'ai_usage_openai_response_keys',
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
    ['support_agent_runs', 'Support automation history is retained for its thread lifetime.'],
    [
      'support_inbound_email_receipts',
      'One durable receipt is retained for every inbound support email; provider and support-message indexes keep replay checks selective.',
    ],
    ['support_messages', 'Support correspondence is retained for the lifetime of its thread.'],
  ])
}
