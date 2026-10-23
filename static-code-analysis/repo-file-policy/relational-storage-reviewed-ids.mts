// Reviewed non-relationship ids. Each key is an exact table.column from the committed PostgreSQL
// schema snapshot with a one-line reason. The two categories are defined in
// docs/development/postgres-schema-rules.md#prelaunch-relational-storage. A key that gains a
// foreign key, or leaves the schema, is stale and must be removed.

type ReviewedIds = [string, string][]

function reviewed(reason: string, keys: readonly string[]): ReviewedIds {
  return keys.map(key => [key, reason])
}

// Opaque ids with no owning row to reference: client tokens, traversal cursors, protocol ids.
export const ALLOWED_TOKEN_CURSOR_PROTOCOL_ID = new Map<string, string>([
  [
    'copyright_dsa_statement_submissions.transparency_database_uuid',
    'Commission statement UUID returned by the external DSA protocol; no Voucha row owns it.',
  ],
  ...reviewed('Client-issued device token; no devices table exists.', ['user_sessions.device_id']),
  [
    'session_referral_attributions.session_id',
    'Anonymous session id from the auth cookie; sessions live outside PostgreSQL.',
  ],
  [
    'oauth_authorizations.initiating_device_id',
    'Device JWT id that must still match at completion; no devices table exists.',
  ],
  [
    'oauth_authorizations.initiating_session_id',
    'Session JWT id that must still match at completion; sessions live outside PostgreSQL.',
  ],
  [
    'oauth_authorizations.result_device_id',
    'Device id allocated for replayable token issuance; no devices table exists.',
  ],
  [
    'oauth_authorizations.result_session_id',
    'Session id allocated before token issuance so replay reuses it; no row exists yet.',
  ],
  [
    'activitypub_distribution_work_items.activity_id',
    'Stable ActivityPub activity identity used as a protocol cursor key.',
  ],
  [
    'activitypub_distribution_work_items.cursor_remote_actor_id',
    'Traversal cursor position; deleting the actor must not rewind a completed cursor.',
  ],
  [
    'notification_push_intent_retention_cursors.cursor_notification_push_intent_id',
    'UUIDv7 traversal position survives deletion of the scanned intent so a sweep cannot rewind.',
  ],
  [
    'user_agent_string_cleanup_cursors.cursor_user_agent_string_id',
    'UUIDv7 traversal position survives deletion of the scanned user-agent row; it is not a joined identity.',
  ],
  [
    'vote_ballot_cleanup_cursors.cursor_vote_id',
    'UUIDv7 traversal position survives deletion of the scanned ballot; it is not a joined identity.',
  ],
  [
    'vote_integrity_flag_detail_cleanup_cursors.cursor_flag_id',
    'UUIDv7 traversal position survives deletion of the scanned flag; it is not a joined identity.',
  ],
  [
    'notification_push_intent_retention_cursors.sweep_upper_bound_notification_push_intent_id',
    'Frozen UUIDv7 age bound is a timestamp boundary, not a pointer to a persisted intent.',
  ],
  [
    'post_votes.outbound_activitypub_like_activity_id',
    'Identity of the outbound ActivityPub Like; no activities table exists.',
  ],
  [
    'relation__user__follow__user.outbound_activitypub_follow_activity_id',
    'Identity of the outbound ActivityPub Follow; no activities table exists.',
  ],
  [
    'user_deletion_external_works.work_key',
    'Provider idempotency key while work is pending; it names no Voucha entity.',
  ],
  [
    'mcp_call_audit_events.correlation_id',
    'Server-minted id shared by the audit rows of one MCP request; it names no Voucha entity.',
  ],
  [
    'moderation_report_judgements.run_id',
    'GlideMQ report-judgement run identity; queue jobs live outside PostgreSQL, while this unique correlation key supports exact result polling and retry replay.',
  ],
])

// Ids recorded at write time and never joined for authorization. They outlive their source row.
export const ALLOWED_AUDIT_SNAPSHOT_ID = new Map<string, string>([
  [
    'oauth_native_session_token_mints.client_id',
    'Native client id at mint time; the append-only audit record survives client deletion.',
  ],
  [
    'oauth_native_session_token_mints.grant_id',
    'Session grant id at mint time; the append-only audit record survives grant deletion.',
  ],
  [
    'oauth_native_session_token_mints.session_id',
    'Authenticating session id at mint time; the append-only audit record survives session deletion.',
  ],
  [
    'oauth_native_session_token_mints.access_token_id',
    'Issued access token id at mint time; the append-only audit record survives token deletion.',
  ],
  [
    'oauth_authorization_server_events.client_id',
    'Client id at event time; the audit record survives client deletion.',
  ],
  [
    'oauth_authorization_server_events.grant_id',
    'Grant id at event time; the audit record survives grant deletion.',
  ],
  [
    'oauth_authorization_server_events.authorization_request_id',
    'Short-lived consent request id; the audit record outlives the request.',
  ],
  [
    'oauth_authorization_server_events.access_token_id',
    'Short-lived access token id; the audit record outlives the token.',
  ],
  [
    'oauth_authorization_server_events.refresh_token_family_id',
    'Short-lived refresh family id; the audit record outlives the family.',
  ],
  ...reviewed('Community scope stamped at write time; aggregate history survives the community.', [
    'agent_moderations.moderation_transparency_community_id',
    'moderation_appeals.moderation_transparency_community_id',
    'moderation_reports.moderation_transparency_community_id',
    'moderator_actions.moderation_transparency_community_id',
    'post_clearance_changes.moderation_transparency_community_id',
    'moderation_transparency_daily_rollups.community_id',
    'moderation_transparency_released_daily_rollups.community_id',
  ]),
  [
    'topic_alias_category_mapping_reconciliations.topic_alias_id',
    'Alias id at transition time; the pending work is keyed by it and outlives the alias.',
  ],
])
