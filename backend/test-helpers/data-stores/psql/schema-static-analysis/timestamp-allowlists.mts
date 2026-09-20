/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
import * as postPublication from './post-publication-allowlists.mts'
import * as postModeration from './moderation-ledger-allowlists.mts'
import { ALLOWED_MEMBERSHIP_MISSING_UPDATED_AT } from './membership-timestamp-allowlists.mts'
import { AUTHORIZATION_TABLES_WITHOUT_CREATED_AT } from './oauth-authorization-allowlists.mts'
import { MEDIA_PLACEMENT_MISSING_UPDATED_AT } from './media-placement-allowlists.mts'

export const ALLOWED_NON_UUIDV7_CREATED_AT = new Map<string, string>([])
export const ALLOWED_MISSING_CREATED_AT = new Map<string, string>([
  ...postPublication.POST_PUBLICATION_TABLES_WITHOUT_CREATED_AT,
  ...AUTHORIZATION_TABLES_WITHOUT_CREATED_AT,
  [
    'rss_feed_item_ids',
    'Permanent identity lookup; creation time remains derivable from its UUIDv7 id and is never queried from the lookup.',
  ],
  [
    'rss_feed_item_read_states',
    'Composite-PK read-state table; read_at serves as the single lifecycle timestamp.',
  ],
  [
    'post_read_states',
    'Composite-PK read-state table; read_at serves as the single lifecycle timestamp.',
  ],
  ...postModeration.POST_MODERATION_TABLES_WITHOUT_CREATED_AT,
  ['boilerplate_removal_urls', 'Pure join table keyed by boilerplate removal and URL.'],
  ['categories__related_categories', 'Pure relation table; relation timing is not queried.'],
  ['categories__related_topics', 'Pure relation table; relation timing is not queried.'],
  [
    'community_agent_prompts',
    'Extension table keyed by agent_prompts.id; timestamps live on the base prompt.',
  ],
  ['community_application_questions', 'Configuration child rows ordered inside a community.'],
  [
    'community_list_items__posts',
    'Pure list membership table with added/removed lifecycle timestamps.',
  ],
  [
    'community_list_items__rss_feeds',
    'Pure list membership table with added/removed lifecycle timestamps.',
  ],
  [
    'community_list_items__topics',
    'Pure list membership table with added/removed lifecycle timestamps.',
  ],
  [
    'community_list_items__url_hostnames',
    'Pure list membership table with added/removed lifecycle timestamps.',
  ],
  [
    'community_list_items__urls',
    'Pure list membership table with added/removed lifecycle timestamps.',
  ],
  ['community_pinned_posts', 'Pure ordered pin table.'],
  ['community_post_reviews', 'Review lifecycle timestamps model moderation state.'],
  ['currencies', 'Static lookup table.'],
  ['migrations', 'Internal migration ledger.'],
  ['pending_user_import_requests', 'Pending request table keyed by provider request ID.'],
  ['retailer_countries', 'Pure retailer-country join table.'],
  ['rss_feed_followers_by_session', 'Session follow join table without entity lifecycle.'],
  ['rss_feed_followers_by_user', 'User follow join table without entity lifecycle.'],
  [
    'support_message_approvals',
    'Composite-key side table; message timestamps live on support_messages.',
  ],
  ['totp_recovery_codes', 'Recovery code lifecycle is represented by used_at.'],
  ['user_followers', 'Pure user-follow join table.'],
  ['user_topic_follows', 'Pure user-topic follow join table.'],
  ['user_topic_mutes', 'Pure user-topic mute join table.'],
])

export const ALLOWED_MISSING_UPDATED_AT = new Map<string, string>([
  ...ALLOWED_MISSING_CREATED_AT,
  ...postPublication.POST_PUBLICATION_TABLES_WITHOUT_UPDATED_AT,
  ...ALLOWED_MEMBERSHIP_MISSING_UPDATED_AT,
  ...MEDIA_PLACEMENT_MISSING_UPDATED_AT,
  [
    'post_admission_quota_consumptions',
    'Immutable committed-admission quota ledger; rows are inserted once and only later deleted by retention pruning.',
  ],
  [
    'moderation_transparency_daily_rollups',
    'Trigger-maintained aggregate projection; latest_occurred_at is the only lifecycle timestamp used by its release contract.',
  ],
  [
    'moderation_transparency_released_daily_rollups',
    'Immutable aggregate projection; released_at records the only lifecycle transition and rows never update.',
  ],
  [
    'election_vote_migration_claims',
    'Durable migration claims are inserted once and never updated after the owning transaction commits.',
  ],
  [
    'ai_usage_openai_response_keys',
    'Permanent response-id reservation rows are inserted atomically with one ledger row and never updated.',
  ],
  [
    'rss_feed_item_ids',
    'Permanent identity rows have no semantic updates; conflict tuple bumps exist only to return the established id.',
  ],
  [
    'openai_background_responses',
    'Lease mutations carry their own lease_expires_at lifecycle timestamp; a generic updated_at would not participate in ownership decisions.',
  ],
  [
    'app_attestation_keys',
    'last_used_at tracks the meaningful mutation (assertion sign-count bump); a generic updated_at would be redundant.',
  ],
  [
    'rss_feed_item_read_states',
    'Read-state rows use composite PK; read_at is the only timestamp and is set once on insert.',
  ],
  [
    'post_read_states',
    'Read-state rows use composite PK; read_at is the only timestamp and is set once on insert.',
  ],
  [
    'list_items__posts',
    'Append-only list membership rows; item fields are never updated, only soft-deleted via removed_at.',
  ],
  [
    'list_items__rss_feed_items',
    'Append-only list membership rows; item fields are never updated, only soft-deleted via removed_at.',
  ],
  ['community_agent_prompt_changes', 'Append-only audit log of community agent prompt changes.'],
  ['dynamic_config_change_logs', 'Append-only audit log of dynamic configuration changes.'],
  ['agent_moderations', 'Append-only moderation output keyed by post and agent.'],
  ['ai_usage_records', 'Append-only LLM cost ledger; rows are never updated after insertion.'],
  ['conversation_messages', 'Append-only conversation message log.'],
  ['crm_contact_lifecycle_changes', 'Append-only lifecycle audit log.'],
  ['email_referral_attributions', 'Append-only referral attribution event.'],
  [
    'fediverse_instance_integration_changes',
    'Append-only fediverse instance integration status audit log.',
  ],
  ['moderation_report_judgements', 'Append-only AI judgement log; no updates after insertion.'],
  [
    'moderation_reports',
    'Report review state changes are tracked by reviewed/resolved timestamps.',
  ],
  ['post_clearance_changes', 'Append-only clearance audit log.'],
  ...postModeration.POST_MODERATION_TABLES_WITHOUT_UPDATED_AT,
  ['post_revisions', 'Append-only post revision history.'],
  ['rss_feed_crawls', 'Append-only crawl history partitioned by UUIDv7 id.'],
  ['rss_feed_discoverability_changes', 'Append-only discoverability audit log.'],
  ['rss_feed_enablement_changes', 'Append-only feed enablement audit log.'],
  ['rss_feed_items', 'Feed item content is immutable after ingestion.'],
  [
    'rss_feed_item_category_rejections',
    'Insert-only rejection log; rows are deleted (not updated) when a category is un-rejected.',
  ],
  ['rss_feed_item_sources', 'Composite source mapping for feed items.'],
  ['rss_feed_urls', 'Feed URL alias table; crawl state lives elsewhere.'],
  ['session_referral_attributions', 'Append-only referral attribution event.'],
  ['ses_bounce_events', 'Append-only SES bounce event log.'],
  ['stripe_events', 'Append-only Stripe event log.'],
  ['post_dispute_annotations', 'Append-only annotation; removal tracked by removed_at.'],
  ['moderation_appeal_lifecycle_changes', 'Append-only lifecycle audit log.'],
  ['review_dispute_lifecycle_changes', 'Append-only lifecycle audit log.'],
  ['support_message_lifecycle_changes', 'Append-only lifecycle audit log.'],
  ['support_thread_lifecycle_changes', 'Append-only lifecycle audit log.'],
  ['topic_history', 'Append-only topic lifecycle history.'],
  ['topic_revisions', 'Append-only topic revision history.'],
  ['user_deletion_audit_logs', 'Append-only compliance audit log.'],
  ['user_history', 'Append-only user lifecycle history.'],
  [
    'user_mod_notes',
    'Append-only moderator note log; deletion tracked by deleted_at, notes are never edited.',
  ],
  ['user_import_requests', 'Import request lifecycle uses explicit state timestamps.'],
  ['user_warnings', 'Append-only warning records; no fields change after issuance.'],
  [
    'user_aside_preferences',
    'dismissed_at is the meaningful timestamp; upsert-on-conflict refreshes dismissed_at, so a generic updated_at would be redundant.',
  ],
  [
    'curated_aside_items',
    'position reorders and soft-deletes are the only mutations; deleted_at tracks the deletion lifecycle; no generic updated_at needed.',
  ],
  ['moderator_actions', 'Append-only unified moderator action log; no updates after insertion.'],
  [
    'moderation_media_reveals',
    'Append-only audit log of disturbing-media reveals by moderators; rows are never updated.',
  ],
  [
    'moderation_queue_claims',
    'Claim lifecycle uses claimed_at / released_at; the only mutation is releasing a claim (writing released_at), so a generic updated_at is redundant.',
  ],
  [
    'ap_inbox_activities',
    'Append-only replay-dedup ledger; rows are inserted once by the inbox receiver and never updated.',
  ],
  [
    'ap_post_likes',
    'Mutation is limited to toggling deleted_at (Undo/resurrect) and refreshing like_ap_id on redelivery; a generic updated_at is redundant.',
  ],
  [
    'bluesky_follow_records',
    'Receipt row for "does a follow record exist on Bluesky"; the only mutation is refreshing record_uri on a redelivered createRecord, and rows are deleted outright on unfollow rather than soft-updated.',
  ],
])
/* v8 ignore stop */
