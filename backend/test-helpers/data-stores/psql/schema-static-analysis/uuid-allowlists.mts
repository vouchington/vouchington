import { DSA_SUBMISSION_UUID_COLUMNS_WITHOUT_KEYS } from './dsa-submission-uuid-allowlists.mts'
/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
import { POST_PUBLICATION_UUID_COLUMNS_WITHOUT_KEYS } from './post-publication-allowlists.mts'
import { ALLOWED_MEMBERSHIP_UUID_COLUMNS_WITHOUT_KEYS } from './membership-uuid-allowlists.mts'
import { OAUTH_AUTHORIZATION_UUID_COLUMNS_WITHOUT_KEYS } from './oauth-authorization-allowlists.mts'
import { STORY_POST_RELATED_URL_PROJECTION_UUID_COLUMNS_WITHOUT_KEYS } from './story-post-related-url-projection-uuid-allowlists.mts'
import { USER_DELETION_UUID_COLUMNS_WITHOUT_KEYS } from './user-deletion-uuid-allowlists.mts'
export const ALLOWED_UNCOMMENTED_RELATIONS = new Map<string, string>([])
export const ALLOWED_UNCOMMENTED_COLUMNS = new Map<string, string>([])
export const ALLOWED_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  ...DSA_SUBMISSION_UUID_COLUMNS_WITHOUT_KEYS,
  [
    'copyright_notice_form_screening_work_items.lease_token',
    'Opaque current screening ownership fence.',
  ],
  [
    'copyright_notice_action_attempts.lease_token',
    'Immutable opaque execution fence; not a relationship.',
  ],
  [
    'copyright_notice_delivery_attempts.lease_token',
    'Immutable opaque execution fence; not a relationship.',
  ],
  [
    'media_delivery_registry_projection_work_items.lease_token',
    'Opaque projection ownership token; not a relationship.',
  ],
  [
    'follower_distributions.cursor_recipient_id',
    'Deletion-stable recipient UUIDv7 keyset position, not a relationship.',
  ],
  [
    'retained_identity_cleanup_cursors.cursor_identity_id',

    'Operational keyset scan position can outlive its prior root row; it is not a relationship.',
  ],
  [
    'retained_image_placement_binding_cleanup_cursors.cursor_placement_id',
    'Operational placement UUIDv7 position survives deletion of the swept binding; it is not a relationship.',
  ],
  [
    'retained_relation_identity_cleanup_cursors.cursor_subject_id',
    'Operational composite keyset scan position can outlive its prior owner; it is not a relationship.',
  ],
  [
    'retained_relation_identity_cleanup_cursors.cursor_relation_id',
    'Operational composite keyset scan position can outlive its prior owner; it is not a relationship.',
  ],
  ...POST_PUBLICATION_UUID_COLUMNS_WITHOUT_KEYS,
  ...ALLOWED_MEMBERSHIP_UUID_COLUMNS_WITHOUT_KEYS,
  ...OAUTH_AUTHORIZATION_UUID_COLUMNS_WITHOUT_KEYS,
  ...STORY_POST_RELATED_URL_PROJECTION_UUID_COLUMNS_WITHOUT_KEYS,
  ...USER_DELETION_UUID_COLUMNS_WITHOUT_KEYS,
  [
    'copyright_notice_action_work_items.lease_token',
    'Opaque worker fencing token, not a durable relation.',
  ],
  [
    'copyright_notice_form_screening_attempts.execution_token',
    'Opaque worker fencing token, not a durable relation.',
  ],
  [
    'copyright_notice_delivery_work_items.lease_token',
    'Opaque worker fencing token, not a durable relation.',
  ],
  [
    'community_activity_digest_work_items.lease_token',
    'Opaque batch-chain fencing token, not a relationship.',
  ],
  ['post_admission_claims.lease_token', 'Fencing token, not a durable relation.'],
  [
    'post_admission_attempts.lease_token',
    'Immutable attempt fencing token, not a durable relation.',
  ],
  ['agent_moderations.moderation_transparency_community_id', 'Trigger-maintained scope snapshot.'],
  ['moderation_appeals.moderation_transparency_community_id', 'Immutable scope snapshot.'],
  [
    'moderation_reports.moderation_transparency_community_id',
    'Immutable scope snapshot intentionally survives post and community deletion so global release eligibility cannot change.',
  ],
  [
    'moderator_actions.moderation_transparency_community_id',
    'Immutable scope snapshot intentionally survives community deletion so global release eligibility cannot change.',
  ],
  [
    'post_clearance_changes.moderation_transparency_community_id',
    'Immutable scope snapshot intentionally survives post and community deletion so global release eligibility cannot change.',
  ],
  [
    'activitypub_inbox_delivery_work_items.lease_token',
    'Ephemeral fencing token rotated for each queue dispatch lease; it intentionally identifies no durable relation.',
  ],
  [
    'activitypub_distribution_work_items.lease_token',
    'Opaque worker fencing token, not a relationship.',
  ],
  [
    'activitypub_distribution_work_items.cursor_remote_actor_id',
    'Durable keyset cursor intentionally survives remote actor deletion so completed fan-out progress cannot rewind.',
  ],
  [
    'app_attestation_keys.did',
    "No devices table exists; did is an ephemeral dt device-token claim, not a durable identity. Assertion verification rejects a mismatch against the caller's current did.",
  ],
  [
    'moderation_appeal_lifecycle_changes.changed_by_id',
    'Audit snapshot intentionally survives user deletion.',
  ],
  [
    'openai_background_responses.lease_token',
    'Opaque fencing token rotated on ownership transfer; it intentionally identifies no durable relation.',
  ],
  [
    'classifier_runs.lease_token',
    'Opaque fencing token rotated for the current exclusive claimant; it intentionally identifies no durable relation.',
  ],
  [
    'user_mcp_create_attempts.lease_token',
    'Opaque fencing token rotated on each claim and takeover; it intentionally identifies no durable relation.',
  ],
  [
    'post_votes.outbound_activitypub_like_activity_id',
    'ActivityPub protocol identity for the current Like generation; it intentionally identifies no database row.',
  ],
  [
    'relation__user__follow__user.outbound_activitypub_follow_activity_id',
    'ActivityPub protocol identity for the active Follow generation; it intentionally identifies no database row.',
  ],
  ['moderation_appeals.approved_by_id', 'Audit ownership survives moderator deletion.'],
  [
    'moderation_appeals.edited_by_id',
    'Lifecycle ownership FK; survives moderator deletion as audit record.',
  ],
  [
    'moderation_appeals.latest_lifecycle_change_id',
    'Denormalized pointer to latest lifecycle change row; no FK needed.',
  ],
  [
    'moderation_appeals.resolved_by_id',
    'Lifecycle ownership FK; survives moderator deletion as audit record.',
  ],
  [
    'moderation_report_judgements.triggering_report_id',
    'Optional FK to the report that triggered this judgement; survives report deletion.',
  ],
  [
    'moderation_report_judgements.rerun_by_id',
    'Optional FK to moderator who requested re-run; audit snapshot survives user deletion.',
  ],
  [
    'session_referral_attributions.session_id',
    'Session attribution UUID from the auth cookie, not a persisted table key.',
  ],
  [
    'user_sessions.device_id',
    'No devices table exists; did is an ephemeral dt device-token claim paired with the persisted session id.',
  ],
  [
    'post_dispute_annotations.removed_by_id',
    'Audit snapshot intentionally survives user deletion.',
  ],
  [
    'review_dispute_lifecycle_changes.changed_by_id',
    'Audit snapshot intentionally survives user deletion.',
  ],
  [
    'review_disputes.approved_by_id',
    'Lifecycle ownership FK; survives moderator deletion as audit record.',
  ],
  [
    'review_disputes.edited_by_id',
    'Lifecycle ownership FK; survives moderator deletion as audit record.',
  ],
  [
    'review_disputes.latest_lifecycle_change_id',
    'Denormalized pointer to latest lifecycle change row; no FK needed.',
  ],
  [
    'review_disputes.resolved_by_id',
    'Lifecycle ownership FK; survives moderator deletion as audit record.',
  ],
])
export const COMMENT_EXEMPT_COLUMN_NAMES = [
  'id',
  'created_at',
  'updated_at',
  'created_by_id',
  'updated_by_id',
  'deleted_at',
  'deleted_by_id',
]
export const COMMENT_EXEMPT_COLUMN_PATTERNS = [
  /^bedrock_nova_multimodal_v1_/,
  /^lingua_rs_/,
  /^llm_moderation_/,
  /^openai_omni_moderation_/,
  /^(?:search_vector$|votes_(?:count|score)_)/,
]
/* v8 ignore stop */
