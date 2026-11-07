export type WorkTunableAllowEntry = {
  file: string
  ruleId: string
  identifier: string
  value: string
  reason: string
}

export const workTunableAllowlistFile =
  'static-code-analysis/repo-file-policy/bounded-work-tunables-allowlist.mts'

export const workTunableAllowlist: readonly WorkTunableAllowEntry[] = [
  {
    file: 'backend/services/copyright-notices/evidence-object-version-page.mts',
    ruleId: 'bounded-work-literal',
    identifier: 'DELETE_BATCH_SIZE',
    value: '1000',
    reason:
      'S3 DeleteObjects accepts at most 1,000 keys: https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html',
  },
  {
    file: 'backend/entrypoints/api/schema-reset.mts',
    ruleId: 'bounded-work-literal',
    identifier: 'DROP_BATCH_SIZE',
    value: '25',
    reason:
      'PostgreSQL shares max_locks_per_transaction (64 by default) times max_connections lock slots across all transactions, so one DROP may lock only a bounded number of relations: https://www.postgresql.org/docs/current/runtime-config-locks.html. The bound follows the database server lock settings, not a runtime tunable.',
  },
  {
    file: 'backend/services/oauth-github/friends.mts',
    ruleId: 'bounded-work-literal',
    identifier: 'GITHUB_FOLLOWING_PAGE_SIZE',
    value: '100',
    reason:
      'Provider-imposed page size: GitHub API maximum per request is 100 (per_page on GET /user/following, default 30, max 100); 100 is at that maximum and is not a work bound we tune. Pages per run are bounded by max_provider_pages_per_run: https://docs.github.com/en/rest/users/followers#list-the-people-the-authenticated-user-follows',
  },
  {
    file: 'backend/services/oauth-x/friends.mts',
    ruleId: 'bounded-work-literal',
    identifier: 'X_FOLLOWING_PAGE_SIZE',
    value: '1000',
    reason:
      'Provider-imposed page size: X API maximum per request is 1000 (max_results on GET /2/users/:id/following, range 1-1000); 1000 is at that maximum and is not a work bound we tune. Pages per run are bounded by max_provider_pages_per_run: https://docs.x.com/x-api/users/follows/get-following',
  },
]
