// Every exception is an exact table.column from the committed PostgreSQL schema snapshot.
// Remove an entry once its column no longer needs the exception. New entries require plan review.
// JSON documents are allowed. This list records reviewed opaque provider, protocol, and replay
// payloads. Structured documents and change history stay JSON too. An entity id inside any of
// them is a foreign-key column; the rest of the document stays JSON.
export const ALLOWED_OPAQUE_JSON = new Set([
  'agent_moderations.results',
  'apple_accounts.apple_user_data',
  'classifier_runs.configuration_json',
  'communities.lingua_rs_results',
  'community_prompt_classifier_results.raw_response',
  'crawls.lingua_rs_results',
  'crawls.meta_tags',
  'crawls.request_headers',
  'crawls.response_headers',
  'facebook_accounts.facebook_user_data',
  'github_accounts.github_user_data',
  'google_accounts.google_user_data',
  'images.openai_omni_moderation_results',
  'images.data',
  'linkedin_accounts.linkedin_user_data',
  'microsoft_accounts.microsoft_user_data',
  'post_admission_reservations.response',
  'post_admission_attempt_results.failure',
  'posts.lingua_rs_results',
  'rss_feed_crawls.feed_data',
  'rss_feed_items.data',
  'rss_feed_items.lingua_rs_results',
  'amazon_ses_bounce_events.raw_message',
  'story_classifier_results.raw_response',
  'stripe_events.payload',
  'topic_classifier_results.raw_response',
  'topics.lingua_rs_results',
  'fediverse_instance_topics.nodeinfo_raw',
  'user_topic_import_attempts.response',
  'users.lingua_rs_results',
  'x_accounts.x_user_data',
])

// Two further reviewed categories carry one reason per entry: token, cursor or protocol
// identifiers, and audit snapshot identifiers. Both are defined in the schema rules.
export {
  ALLOWED_AUDIT_SNAPSHOT_ID,
  ALLOWED_TOKEN_CURSOR_PROTOCOL_ID,
} from './relational-storage-reviewed-ids.mts'

// Tokens, traversal cursors, and a retained table's own primary identity are not foreign references.
export const ALLOWED_NONRELATION_UUID = new Set([
  'follower_distribution_deliveries.delivery_id',
  'membership_google_play_recovery_cursors.cursor_evidence_id',
  'membership_google_play_recovery_cursors.sweep_upper_bound_evidence_id',
  'membership_microsoft_store_recovery_cursors.cursor_source_id',
  'membership_microsoft_store_recovery_cursors.sweep_upper_bound_source_id',
  'oauth_authorizations.exchange_claim_id',
  'oauth_authorization_exchange_attempts.exchange_claim_id',
  'oauth_authorizations.login_attempt_id',
  'follower_distributions.cursor_recipient_id',
  'post_publication_dirty_work.cursor_key_id',
  'post_publication_dirty_work.cursor_post_id',
  'post_publication_dirty_work.cursor_topic_id',
  'post_publication_identity_bridge_cleanup_cursors.cursor_identity_id',
  'post_publication_identity_snapshot_cleanup_cursors.cursor_snapshot_id',
  'post_publication_reconciliation_audit_cursors.cursor_post_id',
  'retained_identity_cleanup_cursors.cursor_identity_id',
  'retained_image_placement_binding_cleanup_cursors.cursor_placement_id',
  // This is the retained binding's primary key, not a pointer to the deletable live placement.
  'retained_image_placement_bindings.placement_id',
  'retained_relation_identity_cleanup_cursors.cursor_relation_id',
  'retained_relation_identity_cleanup_cursors.cursor_subject_id',
  'story_post_related_url_projection_jobs.prune_cursor_id',
  'story_post_related_url_projection_jobs.relation_high_water_id',
  'story_post_related_url_projection_jobs.source_cursor_id',
  'story_post_related_url_projection_jobs.source_high_water_id',
  'user_data_request_attempts.processing_attempt_id',
  'user_data_requests.processing_attempt_id',
  'user_deletion_requests.processing_attempt_id',
])

// Sole UUID primary keys without a generator are shared identities unless listed here. Retained
// roots, publication bridges that mint their own id, and the session JWT sid are their own identity.
// Extension tables such as user_metrics.id must keep the target FK instead of joining this set.
export const ALLOWED_OWN_PRIMARY_UUID = new Set([
  'post_publication_community_identities.id',
  'post_publication_rss_feed_identities.id',
  'post_publication_story_identities.id',
  'post_publication_topic_alias_identities.id',
  'retained_api_key_identities.id',
  'retained_image_identities.id',
  'retained_membership_identities.id',
  'retained_post_identities.id',
  'retained_rss_feed_item_identities.id',
  'retained_topic_identities.id',
  'retained_user_identities.id',
  'user_sessions.id',
])

export type GeneratedFkAlias = {
  expression: string
  oneTargetCheck: string
  sourceColumns: readonly string[]
}

// The sole generated UUID alias combines three concrete target FKs and the exact one-target check.
// Match the whole COALESCE expression and num_nonnulls(...) = 1 body; a similar check is not enough.
export const GENERATED_FK_ALIASES = new Map<string, GeneratedFkAlias>([
  [
    'curated_aside_items.entity_id',
    {
      expression: 'COALESCE(topic_id, rss_feed_id, community_id)',
      oneTargetCheck: 'num_nonnulls(topic_id, rss_feed_id, community_id) = 1',
      sourceColumns: ['topic_id', 'rss_feed_id', 'community_id'],
    },
  ],
])
