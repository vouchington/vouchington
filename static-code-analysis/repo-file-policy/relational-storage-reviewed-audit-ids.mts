import { electedVoteTables, reviewed } from './relational-storage-reviewed-id-groups.mts'

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
  ...reviewed('Session id recorded at vote time; sessions live outside PostgreSQL.', [
    'agent_moderation_votes.session_id',
    ...electedVoteTables.map(table => `${table}.session_id`),
    'hostname_votes.session_id',
    'post_votes.session_id',
    'rss_feed_item_votes.session_id',
    'topic_votes.session_id',
    'user_vouch_votes.session_id',
  ]),
])
