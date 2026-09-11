export const POSTGRES_SCHEMA_GUARDRAIL_ALLOWLIST_FILE =
  'static-code-analysis/repo-file-policy/postgres-schema-guardrail-allowlist.mts'

export const ALLOWED_POLYMORPHIC_TARGET_TABLES = new Set<string>()

// Pre-launch checked-in debt: these files still carry the retired
// `-- edited-in-place: pre-launch, never deployed to production` marker wording instead of the
// current `-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)` wording
// mandated by backend/data-stores/psql/CLAUDE.md#migration-rules. edited-in-place-marker-guard.mts
// rejects that retired wording in any file NOT listed here, so this set can only shrink -- new files must use
// the current wording, and an entry becomes stale (CI-rejected) the moment its file's wording is
// updated or the file stops existing. Emptying this set only means every file has moved onto the
// current wording -- it does NOT retire the pre-launch in-place-edit convention itself; that is
// PRE_LAUNCH_IN_PLACE_EDITS below. Do not add new entries to this set.
export const LEGACY_EDITED_IN_PLACE_MARKER_MIGRATIONS = new Set<string>([
  'backend/data-stores/psql/migrations/0000-00-00-core-functions-sites.sql',
  'backend/data-stores/psql/migrations/0010-00-00-users-auth-oauth.sql',
  'backend/data-stores/psql/migrations/0010-00-01-session-referral-attributions-partition-repair.sql',
  'backend/data-stores/psql/migrations/0030-00-00-user-security-mfa-api-keys.sql',
  'backend/data-stores/psql/migrations/0040-00-00-images.sql',
  'backend/data-stores/psql/migrations/0050-00-00-urls-hostnames-crawlers.sql',
  'backend/data-stores/psql/migrations/0060-00-00-topics-taxonomy.sql',
  'backend/data-stores/psql/migrations/0065-00-00-user-profiles-households.sql',
  'backend/data-stores/psql/migrations/0070-00-00-posts-feed-content.sql',
  'backend/data-stores/psql/migrations/0080-00-00-rss-feeds-items.sql',
  'backend/data-stores/psql/migrations/0100-00-00-bedrock-embeddings-autotagger.sql',
  'backend/data-stores/psql/migrations/0110-00-00-conversations-agentic-runs.sql',
  'backend/data-stores/psql/migrations/0120-00-00-notifications-recommendations.sql',
  'backend/data-stores/psql/migrations/0130-00-00-referral-programs-links.sql',
  'backend/data-stores/psql/migrations/0140-00-00-communities-publications.sql',
  'backend/data-stores/psql/migrations/0150-00-00-community-lists.sql',
  'backend/data-stores/psql/migrations/0170-00-00-stories-hn-discussions.sql',
  'backend/data-stores/psql/migrations/0180-00-00-customer-support.sql',
  'backend/data-stores/psql/migrations/0200-00-00-admin-imports.sql',
  'backend/data-stores/psql/migrations/0210-00-00-compliance-user-data-requests.sql',
  'backend/data-stores/psql/migrations/0220-00-00-landing-pages-attribution.sql',
  'backend/data-stores/psql/migrations/0240-00-00-elections-vote-integrity.sql',
  'backend/data-stores/psql/migrations/0270-00-00-post-clearance.sql',
  'backend/data-stores/psql/migrations/0310-00-00-identity-verification.sql',
  'backend/data-stores/psql/migrations/0329-00-00-moderation-cases.sql',
  'backend/data-stores/psql/migrations/0330-00-00-moderation-reports.sql',
  'backend/data-stores/psql/migrations/0330-00-00-user-imports.sql',
  'backend/data-stores/psql/migrations/0360-00-00-moderation-report-notifications.sql',
  'backend/data-stores/psql/migrations/0390-00-00-report-judgements.sql',
  'backend/data-stores/psql/migrations/0400-00-00-topic-claims.sql',
  'backend/data-stores/psql/migrations/0400-00-01-review-disputes.sql',
  'backend/data-stores/psql/migrations/0410-00-00-community-bans.sql',
  'backend/data-stores/psql/migrations/0410-00-00-moderation-training-feedback.sql',
  'backend/data-stores/psql/migrations/0410-00-00-user-warnings.sql',
  'backend/data-stores/psql/migrations/0420-00-00-moderator-actions.sql',
  'backend/data-stores/psql/migrations/0420-00-00-report-integrity.sql',
  'backend/data-stores/psql/migrations/0450-00-00-moderation-appeals.sql',
  'backend/data-stores/psql/migrations/0460-00-00-agent-responses.sql',
  'backend/data-stores/psql/migrations/0460-00-00-moderation-media-reveals.sql',
  'backend/data-stores/psql/migrations/0470-00-00-user-suspensions.sql',
  'backend/data-stores/psql/migrations/0470-00-01-post-locks.sql',
  'backend/data-stores/psql/migrations/0470-00-02-url-hostname-blocks.sql',
  'backend/data-stores/psql/migrations/0480-00-00-podcasts.sql',
  'backend/data-stores/psql/migrations/0490-00-00-ai-usage-ledger.sql',
  'backend/data-stores/psql/migrations/0500-00-00-lists.sql',
  'backend/data-stores/psql/migrations/0510-00-00-read-states.sql',
  'backend/data-stores/psql/migrations/0520-00-00-app-attestation-keys.sql',
  'backend/data-stores/psql/migrations/0530-00-00-user-sessions.sql',
  'backend/data-stores/psql/migrations/0530-00-01-user-sessions-partition-repair.sql',
  'backend/data-stores/psql/migrations/0550-00-00-chat-openai-compatible.sql',
  'backend/data-stores/psql/migrations/0561-00-00-remote-actors.sql',
  'backend/data-stores/psql/migrations/0563-00-00-ap-post-likes.sql',
  'backend/data-stores/psql/migrations/0570-00-00-bluesky-linked-accounts.sql',
  'backend/data-stores/psql/migrations/0571-00-00-bluesky-follow-records.sql',
  'backend/data-stores/psql/migrations/0584-00-00-ap-inbox-deliveries.sql',
  'backend/data-stores/psql/migrations/0584-00-00-support-inbound-email-receipts.sql',
  'backend/data-stores/psql/migrations/0585-00-00-support-agent-run-idempotency.sql',
  'backend/data-stores/psql/migrations/0590-00-00-oauth-authorizations.sql',
  'backend/data-stores/psql/migrations/0590-00-00-openai-background-responses.sql',
  'backend/data-stores/psql/migrations/0601-00-00-moderation-transparency-daily-rollups.sql',
])

// Flip `permitted` to false at pre-launch close-out (production launch). Once false,
// edited-in-place-marker-guard.mts rejects EVERY `-- edited-in-place: pre-launch, ...` marker in any
// migration file -- current wording included -- turning every remaining marker, and every now-dead
// LEGACY_EDITED_IN_PLACE_MARKER_MIGRATIONS entry above, into a hard CI failure until removed. This
// object (not a bare `export const boolean`) exists so tests can flip it back for the duration of a
// single assertion without a mocking framework; production code must only ever read `.permitted`,
// never write it outside of this one launch-day edit.
export const PRE_LAUNCH_IN_PLACE_EDITS = { permitted: true }
