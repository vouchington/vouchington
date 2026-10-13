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

**Historical: don't generalize timeouts for heterogeneous jobs — unless the "job" is actually
homogeneous by config.** If a job is a mix of external-provider connectivity smoke tests and broader
integration tests (DB, cache, business logic), a job-level timeout match is **unsafe** — it would
rerun real code-bug deadlocks. The retired `backend-credentialed-provider-smoke-test-transient` rule
matched a bare `Test timed out in ` and looked like this shape, but it was safe: each credentialed
Vitest project was homogeneous by construction, so a timeout inside a project's own `include` glob
was never a broader integration-test deadlock. It matched on `FAIL <project> <path under that
project's own include glob>` plus a provider-transport marker, never on a job-level timeout alone.
The rule was removed once the credentialed job became an informational smoke check that never gates
CI: an automatic rerun of a non-gating job gains nothing
([live-provider smoke checks](../../tests.md#live-provider-smoke-checks)). A future rule that matches
a timeout still has to prove the job is homogeneous by config, or pin the owning project's boundary.

**Historical: stale literal, not a stale rule (#10806/#10825): `hasBackendSesSendEmailTimeout` was
dead for months and nothing failed.** The predicate required the literal `Test timed out in 120000ms`
— the project's `testTimeout` when the rule was authored (PR #6551). PR #8107 lowered `backend-aws`'s
`testTimeout` to `60_000` with no reason to touch this file, so the literal went stale silently: the
predicate could never match again, and its own test fixture fed it a synthetic `120000ms` log
authored to satisfy the same (now-wrong) literal, so the suite stayed green forever. The fix replaced
the per-test title and timeout-digit regexes with a matcher derived from the project list Vitest
itself runs, so no second copy was left to go stale. The lesson stays in force: derive a boundary
from its owner and never hand-copy a title or a timeout digit count (see
`ci/transient-retry/AGENTS.md`).
