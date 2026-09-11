# Transient-retry Authoring

Read [README.md](README.md) for rule fields, ordering, attempt accounting, worked consolidation
examples, shared vocabulary, and validation commands.

## Scoped invariants

- Keep one rule per consumer and root-cause pair. Broaden an existing fingerprint for new status,
  URL, action, or terminal-marker variants from that same pair; add a rule only for a new consumer or
  genuinely different root cause.
- Anchor every matcher to its own job/command terminal failure and fail closed on mixed or unavailable
  evidence. Shared vocabulary broadens causes, never scope.
- Reuse `hasAwsTransportTransientError(text)` for AWS transport failures and keep `gh-api.mts`
  importing its shared Go `net/http` transport subset instead of copying marker lists.
- Reuse `hasUndiciConnectTimeout(text)` for undici/fetch connect-timeout failures instead of
  copying its marker list into a new consumer file.
- Every literal `##[group]Run` step-header marker must be an exported constant covered by
  `step-group-marker-freshness.test.mts`'s YAML table (Table A) when its source is a repo-owned
  `run:` or local `uses:` step, or by its script-emitted-marker table (Table B) when the source of
  truth lives in an external package — a stale marker fails closed and silently stops a rule from
  ever matching (see PR #10604).
- Never fingerprint a repo-owned application spec path or test title (`playwright/tests/**`). A
  failure that matches your own diff is a real bug, not infrastructure noise — file an issue and fix
  it instead. `playwright/credentialed/**` (credentialed external-dependency probes) and
  `playwright/helpers/**` (shared helpers) are infrastructure by construction and stay allowed.
  `ast-grep-rules/transient-retry-no-repo-owned-spec-pinning.yml` enforces the path form of this.
- Never pin a `describe`/`it` title string or a raw timeout digit count (`30000ms`) in a matcher — a
  project's own `testTimeout` already owns that number, and a title is a surface variant that drifts
  on rename with zero test signal. `hasBackendSesSendEmailTimeout` (#10806/#10825) required
  `Test timed out in 120000ms` and went silently dead for months after `testTimeout` dropped from
  `120000` to `60000`, because its own fixture synthesized the same stale digits. Match on the vitest
  project plus its own `include` glob (the credentialed-probe boundary) and a provider-transport
  marker instead — see `backend-credentialed-log-fingerprints.mts`. Any repo-owned source-path
  literal that does survive in this directory needs a `repo-owned-literal-freshness.test.mts` table
  row; its completeness scanner recognizes only path-shaped literals (`backend/…`, `web/…`,
  `playwright/…`, `cloudflare-worker/…`) — a pinned title or timeout digit count has no automated
  scanner at all, which is exactly why pinning either is disallowed outright rather than merely
  discouraged.
