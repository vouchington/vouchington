// Shrink-only prelaunch debt. The acceptance check rejects any key that is not already on
// origin/main. Remove a key only after that column no longer has the defect. Do not add keys.
//
// JSON documents are not debt. Structured documents, data points, and change history stay JSON.
// An entity id inside a document still needs its own foreign-key column; this inventory cannot
// see inside JSON. UUID arrays, missing foreign keys, and encoded keys remain.
// OAuth, membership, ActivityPub checkpoints, vote device/session ids, and story related-URL
// identities still lack foreign keys, so this audit does not mark them complete.
export const EXISTING_RELATIONAL_STORAGE_DEBT = {
  json: new Set<string>(),
  uuidArray: new Set([
    // #820
    'post_category_finalizations.actor_user_ids',
    'post_category_finalizations.admission_response_topic_ids',
    'review_successions.topic_ids',
  ]),
  missingForeignKey: new Set([
    'activitypub_distribution_checkpoints.activity_id',
    'activitypub_distribution_checkpoints.last_remote_actor_id',
    'agent_moderation_votes.device_id',
    'agent_moderation_votes.session_id',
    'agent_moderations.moderation_transparency_community_id',
    'classifier_decision_batches.scope_community_id',
    // #823
    'community_agent_prompt_changes.agent_prompt_id',
    'entity_relation_votes.device_id',
    'entity_relation_votes.session_id',
    'hostname_votes.device_id',
    'hostname_votes.session_id',
    'membership_administrator_refund_operation_requests.issued_by_id',
    'membership_administrator_refund_operation_requests.membership_id',
    'membership_changes.changed_by_id',
    'membership_changes.membership_id',
    'membership_changes.user_id',
    'membership_grants.granted_by_id',
    'membership_grants.revoked_by_id',
    'membership_refunds.issued_by_id',
    'membership_refunds.membership_id',
    'membership_refunds.user_id',
    'membership_sources.user_id',
    'moderation_appeals.moderation_transparency_community_id',
    'moderation_reports.moderation_transparency_community_id',
    'moderation_transparency_daily_rollups.community_id',
    'moderation_transparency_released_daily_rollups.community_id',
    // #823
    'moderator_actions.moderation_transparency_community_id',
    'oauth_authorization_server_events.access_token_id',
    'oauth_authorization_server_events.authorization_request_id',
    'oauth_authorization_server_events.client_id',
    'oauth_authorization_server_events.grant_id',
    'oauth_authorization_server_events.refresh_token_family_id',
    'oauth_authorization_server_events.user_id',
    'oauth_authorizations.initiating_device_id',
    'oauth_authorizations.initiating_session_id',
    'oauth_authorizations.result_device_id',
    'oauth_authorizations.result_session_id',
    // #823
    'post_admission_quota_consumptions.reservation_id',
    'post_admission_reservations.committed_post_id',
    'post_clearance_changes.changed_by_id',
    'post_clearance_changes.moderation_transparency_community_id',
    'post_moderation_dispositions.actor_user_id',
    'post_votes.device_id',
    'post_votes.outbound_ap_like_activity_id',
    'post_votes.session_id',
    'relation__user__follow__user.outbound_ap_follow_activity_id',
    'rss_feed_item_votes.device_id',
    'rss_feed_item_votes.session_id',
    'session_referral_attributions.session_id',
    'story_post_related_url_projection_relation_mutations.relation_id',
    'topic_alias_category_mapping_reconciliations.topic_alias_id',
    'topic_votes.device_id',
    'topic_votes.session_id',
    'user_referral_program_links.last_crawl_id',
    'user_sessions.device_id',
    'user_vouch_votes.device_id',
    'user_vouch_votes.session_id',
  ]),
  encodedReference: new Set(['user_deletion_external_works.work_key']),
}
