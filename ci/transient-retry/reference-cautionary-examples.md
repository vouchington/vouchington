# Cautionary Examples

[Back to Transient-Retry Rule Catalogue](README.md#cautionary-examples)

**Historical: don't fork per status code / URL (PR #5110).**
`no-mistakes-binary-download-http-500` was added alongside the existing
`no-mistakes-napi-checksum-http-502`. Both shared the same consumer (no-mistakes postinstall) and
the same root cause (GitHub Releases CDN error), so the correct fix was to widen the existing rule's
accepted status set instead of forking it. That consolidated rule was later retired (formerly
filed as jonathanong/filaments#8218) after
[no-mistakes 0.33.1](https://github.com/jonathanong/no-mistakes/releases/tag/v0.33.1) widened its
bounded internal postinstall retry budget through
[no-mistakes PR #578](https://github.com/jonathanong/no-mistakes/pull/578).

**Don't generalize timeouts for heterogeneous jobs — unless the "job" is actually homogeneous by
config.** If a job is a mix of external-provider connectivity smoke tests and broader integration
tests (DB, cache, business logic), a job-level timeout match is **unsafe** — it would rerun real
code-bug deadlocks. `backend-credentialed-provider-smoke-test-transient` looks like it might be
this shape (it matches a bare `Test timed out in ` with no per-test title pinned), but it isn't:
each of the four credentialed vitest projects (`backend-aws`, `backend-bedrock`, `backend-openai`,
`backend-stripe`) is homogeneous by construction — every file matched by its own `include` glob is,
by design, a real-provider probe with no setup file that mocks _the provider that project probes_, so
a bare timeout inside that project's own probe boundary is never a broader integration-test deadlock.
(`backend-openai` does load `./backend/test-helpers/vitest.setup.aws-mocks.mts` — `vitest.config.mts`
— but that mocks AWS, not OpenAI, so it's irrelevant to what `backend-openai` itself probes.) The rule
matches on
`FAIL <project> <path under that project's own include glob>` plus a provider-transport marker, not
job-level timeout alone (`backend-credentialed-log-fingerprints.mts`). Two narrower trade-offs this
still accepts, both bounded by `maxAttempts: 2` and the single-failure-block requirement:

- A genuine code bug inside a credentialed probe test that happens to manifest as a timeout gets one
  rerun before dispatch, instead of dispatching immediately.
- `backend-aws` and `backend-openai` also load a DB/Valkey `globalSetup` (`vitest.config.mts`), so a
  bare timeout there could in principle be DB/Valkey-origin rather than provider-origin — still
  classified `rootCauseKey: 'external-provider-transient'`, since a rerun is still the right first
  move either way.

**Stale literal, not a stale rule (#10806/#10825): `hasBackendSesSendEmailTimeout` was dead for
months and nothing failed.** The predicate required the literal `Test timed out in 120000ms` — the
project's `testTimeout` when the rule was authored (PR #6551). PR #8107 lowered `backend-aws`'s
`testTimeout` to `60_000` with no reason to touch this file, so the literal went stale silently: the
predicate could never match again, and its own test fixture fed it a synthetic `120000ms` log
authored to satisfy the same (now-wrong) literal, so the suite stayed green forever. Fixed by
replacing all seven per-test title/timeout-digit regexes with the project-derived matcher above, and
by `repo-owned-literal-freshness.test.mts`'s freshness + completeness guard, which fails the moment a
repo-owned literal like this one goes stale instead of staying silently green. See
`ci/transient-retry/CLAUDE.md`'s invariant on this.
