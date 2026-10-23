export type Source =
  | 'oauth_events'
  | 'oauth_native_mints'
  | 'oauth_grants'
  | 'oauth_grant_anchors'
  | 'oauth_clients'
  | 'api_keys_revoked'
  | 'api_keys_expired'
  | 'facebook_friends'
  | 'github_friends'
  | 'x_friends'
  | 'copyright_rationales_erased'
  | 'copyright_rationales_noncase'

export const SOURCES: readonly Source[] = [
  'oauth_events',
  'oauth_native_mints',
  'oauth_grants',
  'oauth_grant_anchors',
  'oauth_clients',
  'api_keys_revoked',
  'api_keys_expired',
  'facebook_friends',
  'github_friends',
  'x_friends',
  'copyright_rationales_erased',
  'copyright_rationales_noncase',
]

export type SourcePlan = {
  table: string
  keyAt: string
  predicate: string
  deletePredicate?: string
  deletePredicateUsesCutoff?: boolean
  cutoffAt: Date
}

export function sourcePlan(source: Source, now: Date): SourcePlan {
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000)
  switch (source) {
    case 'oauth_native_mints':
      return {
        table: 'oauth_native_session_token_mints',
        keyAt: 'target.occurred_at',
        cutoffAt: twelveMonthsAgo(now),
        predicate: 'target.id < $1::uuid',
        deletePredicate: `NOT EXISTS (
          SELECT 1 FROM user_legal_preservation_holds preservation_hold
          WHERE preservation_hold.account_user_id = target.user_id
            AND preservation_hold.released_at IS NULL
        )`,
      }
    case 'oauth_events':
      return {
        table: 'oauth_authorization_server_events',
        keyAt: 'target.occurred_at',
        cutoffAt: twelveMonthsAgo(now),
        predicate: 'target.id < $1::uuid',
        deletePredicate: `(
          target.event_type <> 'consent_approved' OR NOT EXISTS (
            SELECT 1 FROM oauth_grant_retention_anchors anchor
            WHERE anchor.id = target.grant_id
              AND (anchor.ended_at IS NULL OR anchor.ended_at >= $2)
              AND NOT EXISTS (
                SELECT 1 FROM oauth_authorization_server_events newer
                WHERE newer.grant_id = target.grant_id
                  AND newer.event_type = 'consent_approved' AND newer.id > target.id
              )
          )
        )`,
        deletePredicateUsesCutoff: true,
      }
    case 'oauth_grants':
      return {
        table: 'oauth_grants',
        keyAt: 'target.revoked_at',
        cutoffAt: ninetyDaysAgo,
        predicate: 'target.revoked_at < $1',
        // The parent page holds FOR UPDATE before this fresh DELETE predicate runs. A concurrent
        // child insert must finish before that lock or wait for the grant deletion; neither case
        // can turn one grant deletion into an unbounded ON DELETE CASCADE. The OAuth artifact
        // cleaner owns each child's expiry window and bounded physical deletion.
        deletePredicate: `NOT EXISTS (
            SELECT 1 FROM oauth_authorization_codes code WHERE code.grant_id = target.id
          ) AND NOT EXISTS (
            SELECT 1 FROM oauth_refresh_token_families family WHERE family.grant_id = target.id
          ) AND NOT EXISTS (
            SELECT 1 FROM oauth_access_tokens access_token WHERE access_token.grant_id = target.id
          )`,
      }
    case 'oauth_grant_anchors':
      return {
        table: 'oauth_grant_retention_anchors',
        keyAt: 'target.ended_at',
        cutoffAt: twelveMonthsAgo(now),
        predicate: 'target.ended_at < $1',
        deletePredicate: `NOT EXISTS (SELECT 1 FROM oauth_grants grant_row WHERE grant_row.id = target.id)
          AND NOT EXISTS (
            SELECT 1 FROM oauth_authorization_server_events event
            WHERE event.grant_id = target.id
          )`,
      }
    case 'oauth_clients':
      return {
        table: 'oauth_clients',
        keyAt: 'target.created_at',
        cutoffAt: ninetyDaysAgo,
        predicate: 'target.id < $1::uuid AND target.first_granted_at IS NULL',
        // The locked parent is checked again by DELETE. Requests and grants otherwise cascade;
        // moderator actions otherwise receive an unbounded ON DELETE SET NULL update. OAuth
        // artifact retention drains requests in capped expiry pages before this client is eligible.
        deletePredicate: `NOT EXISTS (
            SELECT 1 FROM oauth_authorization_requests request
            WHERE request.client_id = target.id
          )
          AND NOT EXISTS (SELECT 1 FROM oauth_grants grant_row WHERE grant_row.client_id = target.id)
          AND NOT EXISTS (SELECT 1 FROM moderator_actions action WHERE action.oauth_client_id = target.id)
          AND NOT EXISTS (
            SELECT 1 FROM mcp_call_audit_events audit
            WHERE audit.oauth_client_id = target.id
          )
          AND NOT EXISTS (SELECT 1 FROM communities WHERE created_via_oauth_client_id = target.id)
          AND NOT EXISTS (SELECT 1 FROM topics WHERE created_via_oauth_client_id = target.id)
          AND NOT EXISTS (SELECT 1 FROM user_lists WHERE created_via_oauth_client_id = target.id)
          AND NOT EXISTS (SELECT 1 FROM rss_feeds WHERE created_via_oauth_client_id = target.id)
          AND NOT EXISTS (SELECT 1 FROM moderation_reports WHERE created_via_oauth_client_id = target.id)
          AND NOT EXISTS (SELECT 1 FROM moderation_appeals WHERE created_via_oauth_client_id = target.id)
          AND NOT EXISTS (SELECT 1 FROM community_applications WHERE created_via_oauth_client_id = target.id)
          AND NOT EXISTS (SELECT 1 FROM user_referral_program_links WHERE created_via_oauth_client_id = target.id)
          AND NOT EXISTS (SELECT 1 FROM posts WHERE created_via_oauth_client_id = target.id)
          AND NOT EXISTS (SELECT 1 FROM user_rss_feed_import_batches WHERE created_via_oauth_client_id = target.id)
          AND NOT EXISTS (SELECT 1 FROM conversation_messages WHERE created_via_oauth_client_id = target.id)`,
      }
    case 'api_keys_revoked':
      return {
        table: 'api_keys',
        keyAt: 'target.revoked_at',
        cutoffAt: ninetyDaysAgo,
        predicate: 'target.revoked_at < $1',
      }
    case 'api_keys_expired':
      return {
        table: 'api_keys',
        keyAt: 'target.expires_at',
        cutoffAt: ninetyDaysAgo,
        predicate: 'target.expires_at < $1',
      }
    case 'facebook_friends':
    case 'github_friends':
    case 'x_friends':
      return {
        table: source,
        keyAt: 'target.last_observed_at',
        cutoffAt: ninetyDaysAgo,
        predicate: 'target.last_observed_at < $1',
      }
    case 'copyright_rationales_erased':
      return {
        table: 'copyright_decision_rationales',
        keyAt: 'target.created_at',
        cutoffAt: new Date(now.getTime() - 1_095 * 86_400_000),
        predicate: `target.id < $1::uuid AND target.rationale_ciphertext = 'erased'`,
        deletePredicate: 'fn_copyright_decision_rationale_retention_eligible(target, $2)',
        deletePredicateUsesCutoff: true,
      }
    case 'copyright_rationales_noncase':
      return {
        table: 'copyright_decision_rationales',
        keyAt: 'target.created_at',
        cutoffAt: new Date(now.getTime() - 1_095 * 86_400_000),
        predicate: `target.id < $1::uuid AND target.copyright_notice_id IS NULL
          AND target.rationale_ciphertext <> 'erased'`,
        deletePredicate: 'fn_copyright_decision_rationale_retention_eligible(target, $2)',
        deletePredicateUsesCutoff: true,
      }
  }
}

function twelveMonthsAgo(now: Date): Date {
  const year = now.getUTCFullYear() - 1
  const month = now.getUTCMonth()
  const day = Math.min(now.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate())
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  )
}
