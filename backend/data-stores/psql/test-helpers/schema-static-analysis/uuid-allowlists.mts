/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
import { POST_PUBLICATION_UUID_COLUMNS_WITHOUT_KEYS } from './post-publication-allowlists.mts'
import { ALLOWED_MEMBERSHIP_UUID_COLUMNS_WITHOUT_KEYS } from './membership-uuid-allowlists.mts'
import { STORY_POST_RELATED_URL_PROJECTION_UUID_COLUMNS_WITHOUT_KEYS } from './story-post-related-url-projection-uuid-allowlists.mts'
import { USER_DELETION_UUID_COLUMNS_WITHOUT_KEYS } from './user-deletion-uuid-allowlists.mts'

export const ALLOWED_UNCOMMENTED_RELATIONS = new Map<string, string>([])
export const ALLOWED_UNCOMMENTED_COLUMNS = new Map<string, string>([])
export const ALLOWED_UUID_COLUMNS_WITHOUT_KEYS = new Map<string, string>([
  ...POST_PUBLICATION_UUID_COLUMNS_WITHOUT_KEYS,
  ...ALLOWED_MEMBERSHIP_UUID_COLUMNS_WITHOUT_KEYS,
  ...STORY_POST_RELATED_URL_PROJECTION_UUID_COLUMNS_WITHOUT_KEYS,
  ...USER_DELETION_UUID_COLUMNS_WITHOUT_KEYS,
  ['post_admission_claims.lease_id', 'Fencing token, not a durable relation.'],
  ['post_admission_reservations.committed_post_id', 'Replay snapshot; no foreign key.'],
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
    'ap_inbox_deliveries.processing_attempt_id',
    'Ephemeral fencing token rotated for each queue dispatch lease; it intentionally identifies no durable relation.',
  ],
  [
    'activitypub_distribution_checkpoints.last_remote_actor_id',
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
    'oauth_authorizations.exchange_claim_id',
    'Ephemeral fencing token rotated for each provider exchange claim; it intentionally identifies no durable relation.',
  ],
  [
    'oauth_authorizations.initiating_device_id',
    'Device JWT claim bound to completion; no devices table exists and the authorization is rejected when the caller claim differs.',
  ],
  [
    'oauth_authorizations.initiating_session_id',
    'Session JWT claim bound at authorization begin, including anonymous sessions that have no persisted user_sessions row.',
  ],
  [
    'oauth_authorizations.login_attempt_id',
    'Opaque MFA attempt identifier returned by the authentication flow; MFA attempt state is not a PostgreSQL relation.',
  ],
  [
    'openai_background_responses.lease_token',
    'Opaque fencing token rotated on ownership transfer; it intentionally identifies no durable relation.',
  ],
  [
    'oauth_authorizations.result_device_id',
    'Durable authenticated device-token claim; no devices table exists, and replay requires the exact stored claim.',
  ],
  [
    'oauth_authorizations.result_session_id',
    'Session identity is persisted before token issuance so a lost response remains recoverable; it intentionally cannot reference a user_sessions row that may not exist yet or may later be revoked.',
  ],
  [
    'post_votes.outbound_ap_like_activity_id',
    'ActivityPub protocol identity for the current Like generation; it intentionally identifies no database row.',
  ],
  [
    'relation__user__follow__user.outbound_ap_follow_activity_id',
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
    'community_agent_prompt_changes.agent_prompt_id',
    'Audit snapshot intentionally survives prompt deletion; no FK on purpose.',
  ],
  [
    'crm_contact_lifecycle_changes.changed_by_id',
    'Audit snapshot intentionally survives user deletion.',
  ],
  [
    'dynamic_config_change_logs.changed_by_id',
    'Audit snapshot intentionally survives user deletion.',
  ],
  [
    'moderation_report_judgements.triggering_report_id',
    'Optional FK to the report that triggered this judgement; survives report deletion.',
  ],
  [
    'moderation_report_judgements.rerun_by_id',
    'Optional FK to moderator who requested re-run; audit snapshot survives user deletion.',
  ],
  ['post_clearance_changes.changed_by_id', 'Audit records intentionally survive user deletion.'],
  ['post_moderation_dispositions.actor_user_id', 'Staff audit snapshot survives user deletion.'],
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
  [
    'support_message_lifecycle_changes.approved_by_id',
    'Audit snapshot intentionally survives user deletion.',
  ],
  [
    'support_message_lifecycle_changes.changed_by_id',
    'Audit snapshot intentionally survives user deletion.',
  ],
  [
    'support_message_lifecycle_changes.edited_by_id',
    'Audit snapshot intentionally survives user deletion.',
  ],
  [
    'support_thread_lifecycle_changes.assigned_to_id',
    'Audit snapshot intentionally survives user deletion.',
  ],
  [
    'support_thread_lifecycle_changes.changed_by_id',
    'Audit snapshot intentionally survives user deletion.',
  ],
  [
    'support_thread_lifecycle_changes.resolved_by_id',
    'Audit snapshot intentionally survives user deletion.',
  ],
  [
    'user_deletion_audit_logs.requested_by_id',
    'Compliance audit records intentionally survive user deletion.',
  ],
  [
    'user_deletion_audit_logs.user_id',
    'Compliance audit records intentionally survive user deletion.',
  ],
  ['user_referral_program_links.last_crawl_id', 'Optional pointer to latest crawl record.'],
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
  /^search_vector$/,
  /^votes_(?:count|score)_/,
]
/* v8 ignore stop */
