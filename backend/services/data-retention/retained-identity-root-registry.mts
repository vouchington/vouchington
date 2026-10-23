import { electedRelationMetadata } from '@services/users/relation-impact-targets'

function retainedRelationReferences(subjectType: string): [string, string][] {
  return electedRelationMetadata.flatMap(metadata =>
    metadata.subject_type === subjectType
      ? [[`retained_${metadata.table_name}`, 'subject_id']]
      : [],
  )
}

export const ROOT_FAMILIES = {
  user: {
    table: 'retained_user_identities',
    references: [
      ['users', 'id'],
      ['images', 'created_by_id'],
      ['retained_image_identities', 'created_by_id'],
      ['image_surface_placement_activations', 'bound_by_id'],
      ['image_surface_placement_activations', 'uploaded_by_id'],
      ['user_deletion_requests', 'user_id'],
      ['user_deletion_requests', 'requested_by_id'],
      ['post_publication_author_identities', 'id'],
      ['membership_changes', 'user_id'],
      ['membership_changes', 'changed_by_id'],
      ['membership_grants', 'granted_by_id'],
      ['membership_grants', 'revoked_by_id'],
      ['membership_refunds', 'user_id'],
      ['membership_refunds', 'issued_by_id'],
      ['membership_administrator_refund_operation_requests', 'issued_by_id'],
      ['membership_sources', 'user_id'],
      ['oauth_authorization_server_events', 'user_id'],
      ['oauth_native_session_token_mints', 'user_id'],
      ['oauth_grant_retention_anchors', 'user_id'],
      ['copyright_decision_rationales', 'account_user_id'],
      ['copyright_decision_rationales', 'recorded_by_id'],
      ['post_moderation_dispositions', 'actor_user_id'],
      ['post_clearance_changes', 'changed_by_id'],
      ['posts', 'clearance_changed_by_id'],
      ['community_post_review_changes', 'changed_by_id'],
      ['copyright_notice_lifecycle_changes', 'changed_by_id'],
      ['fediverse_instance_integration_changes', 'changed_by_id'],
      ['media_delivery_registry_changes', 'changed_by_id'],
      ['moderation_appeal_lifecycle_changes', 'changed_by_id'],
      ['moderation_appeals', 'original_decided_by_id'],
      ['review_dispute_lifecycle_changes', 'changed_by_id'],
      ['rss_feed_setting_changes', 'changed_by_id'],
      ['mcp_call_audit_events', 'actor_user_id'],
      ['user_legal_preservation_holds', 'account_user_id'],
      ['user_legal_preservation_holds', 'placed_by_id'],
      ['user_legal_preservation_holds', 'released_by_id'],
      ['copyright_repeat_infringer_incidents', 'account_user_id'],
      ['copyright_repeat_infringer_reviews', 'account_user_id'],
      ['copyright_notice_targets', 'surface_owner_user_id'],
      ['copyright_territorial_notice_receipts', 'requester_user_id'],
      ['copyright_territorial_redress_requests', 'submitted_by_id'],
      ['copyright_trusted_flaggers', 'created_by_id'],
      ['copyright_trusted_flagger_changes', 'changed_by_id'],
      ['copyright_dsa_statement_submission_attempts', 'replayed_by_id'],
      ...retainedRelationReferences('user'),
    ],
  },
  membership: {
    table: 'retained_membership_identities',
    references: [
      ['memberships', 'id'],
      ['membership_changes', 'membership_id'],
      ['membership_refunds', 'membership_id'],
      ['membership_administrator_refund_operation_requests', 'membership_id'],
    ],
  },
  api_key: {
    table: 'retained_api_key_identities',
    references: [
      ['api_keys', 'id'],
      ['mcp_call_audit_events', 'api_key_id'],
    ],
  },
  topic: {
    table: 'retained_topic_identities',
    references: [
      ['topics', 'id'],
      ['review_succession_topics', 'topic_id'],
      ...retainedRelationReferences('topic'),
    ],
  },
  post: {
    table: 'retained_post_identities',
    references: [
      ['posts', 'id'],
      ['post_publication_post_identities', 'id'],
      ['notifications', 'publication_post_id'],
      ['post_admission_reservations', 'committed_post_id'],
      ...retainedRelationReferences('post'),
    ],
  },
  post_clearance_change: {
    table: 'retained_post_clearance_change_identities',
    references: [
      ['post_clearance_changes', 'id'],
      ['posts', 'latest_clearance_change_id'],
      ['moderation_training_feedbacks', 'post_clearance_change_id'],
    ],
  },
  rss_feed_item: {
    table: 'retained_rss_feed_item_identities',
    references: [
      ['rss_feed_items', 'id'],
      ['post_publication_rss_feed_item_identities', 'id'],
      ['notifications', 'publication_rss_feed_item_id'],
      ...retainedRelationReferences('rss_feed_item'),
    ],
  },
  image: {
    table: 'retained_image_identities',
    references: [
      ['images', 'id'],
      ['retained_image_placement_bindings', 'image_id'],
      ['copyright_notice_target_images', 'image_id'],
      ['copyright_staydown_entries', 'image_id'],
      ['copyright_staydown_matches', 'image_id'],
    ],
  },
} as const
