# Transient retry

- [README.md](../../docs/development/ci/transient-retry/README.md) owns rule fields, ordering, accounting, vocabulary, examples, and validation.
- Keep one rule per consumer/root-cause pair; broaden its status/URL/action/terminal variants instead of adding duplicate rules.
- Anchor matches to the owning job/command's terminal failure; fail closed on mixed or missing evidence. Shared cause vocabulary never broadens consumer scope.
- Reuse `hasAwsTransportTransientError()` and `gh-api.mts`'s shared Go `net/http` subset; reuse `hasUndiciConnectTimeout()` instead of copying markers.
- Repo-owned `##[group]Run` markers are exported constants listed in `step-group-marker-freshness.test.mts` Table A. External-package markers use fixture logs, never installed package files.
- Never fingerprint repo-owned application spec paths/titles under `playwright/tests/**`; failures caused by the diff remain bugs. Credentialed external probes (`playwright/credentialed/**`) and shared infrastructure (`playwright/helpers/**`) remain allowed; preserve `transient-retry-no-repo-owned-spec-pinning.yml`.
- Never pin `describe`/`it` titles or raw timeout digits. Match Vitest project/include-glob credentialed boundaries and provider-transport markers; use `backend-credentialed-log-fingerprints.mts`.
- Surviving repo-owned path literals require `repo-owned-literal-freshness.test.mts` rows; its scanner recognizes path-shaped `backend/`, `web/`, `playwright/`, and `cloudflare-worker/` literals, not titles/digits.
