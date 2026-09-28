// Every exception is an exact table.column from the committed PostgreSQL schema snapshot.
// Remove a remediation entry as its owning domain is normalized. New entries require plan review.
// Opaque documents retain their external wire shape or exact replay bytes; application-owned facts
// and relationships belong in typed columns and child tables.
export const ALLOWED_OPAQUE_JSON = new Set([
  'agent_moderations.results',
  'apple_accounts.apple_user_data',
  'communities.lingua_rs_results',
  'conversation_message_agentic_runs.input',
  'conversation_message_agentic_runs.output',
  'conversation_message_agentic_runs.error',
  'conversation_message_agentic_runs_events.input',
  'conversation_message_agentic_runs_events.output',
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
  'post_admission_reservations.retryable_failure',
  'post_classifier_applications.configuration_json',
  'posts.lingua_rs_results',
  'rss_feed_crawls.feed_data',
  'rss_feed_items.data',
  'rss_feed_items.lingua_rs_results',
  'ses_bounce_events.raw_message',
  'story_classifier_results.raw_response',
  'stripe_events.payload',
  'topic_classifier_results.raw_response',
  'topics.lingua_rs_results',
  'topics__fediverse_instances.nodeinfo_raw',
  'user_topic_import_attempts.response',
  'users.lingua_rs_results',
  'x_accounts.x_user_data',
])

// Tokens, traversal cursors, and a retained table's own primary identity are not foreign references.
export const ALLOWED_NONRELATION_UUID = new Set([
  'ap_inbox_deliveries.processing_attempt_id',
  'autotagger_receipts.batch_id',
  'follower_distribution_deliveries.delivery_id',
  'membership_google_play_recovery_cursors.last_evidence_id',
  'membership_google_play_recovery_cursors.sweep_upper_bound_id',
  'membership_microsoft_store_recovery_cursors.last_source_id',
  'membership_microsoft_store_recovery_cursors.sweep_upper_bound_id',
  'oauth_authorizations.exchange_claim_id',
  'oauth_authorizations.login_attempt_id',
  'post_admission_claims.lease_id',
  'post_publication_dirty_work.cursor_key_id',
  'post_publication_dirty_work.cursor_post_id',
  'post_publication_dirty_work.cursor_topic_id',
  'post_publication_identity_bridge_cleanup_progress.cursor_identity_id',
  'post_publication_identity_cleanup_progress.cursor_snapshot_id',
  'post_publication_reconciliation_audit_checkpoints.cursor_post_id',
  'retained_identity_cleanup_progress.cursor_identity_id',
  // This is the retained binding's primary key, not a pointer to the deletable live placement.
  'retained_image_placement_bindings.placement_id',
  'retained_relation_identity_cleanup_progress.cursor_relation_id',
  'retained_relation_identity_cleanup_progress.cursor_subject_id',
  'story_post_related_url_projection_jobs.prune_cursor_id',
  'story_post_related_url_projection_jobs.relation_high_water_id',
  'story_post_related_url_projection_jobs.source_cursor_id',
  'story_post_related_url_projection_jobs.source_high_water_id',
  'stripe_events.processing_attempt_id',
  'user_data_request_attempts.processing_attempt_id',
  'user_data_requests.processing_attempt_id',
  'user_deletion_requests.processing_attempt_id',
])

// The parent table cannot carry a single FK to differently named relation tables. Each generated
// LIST partition has the concrete composite FK; partition-foreign-key-proof.mts verifies them all.
export const PARTITION_FOREIGN_KEY_COLUMNS = new Set([
  'entity_relation_votes.entity_relation_id',
  'entity_relation_votes.subject_id',
])

// Sole UUID primary keys without a generator are shared identities unless listed here. Retained
// roots, publication bridges that mint their own id, and the session JWT sid are their own identity.
// Extension tables such as user_metrics.id must keep the target FK instead of joining this set.
export const ALLOWED_OWN_PRIMARY_UUID = new Set([
  'post_publication_community_identities.id',
  'post_publication_rss_feed_identities.id',
  'post_publication_story_identities.id',
  'post_publication_topic_alias_identities.id',
  'retained_image_identities.id',
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
