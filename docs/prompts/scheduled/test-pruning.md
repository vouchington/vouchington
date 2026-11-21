Delete or reduce low-value tests. Make one bounded deletion or reduction that is safe to ship in one PR; when the flaw is a repeated fingerprint across files, fix every occurrence in the same PR.

Unit: one Vitest project or test folder.

Load `test-authoring` and `testing-rules`, and apply the [Test Value and Safe Reduction](../../development/reference-tests-value-and-reduction.md) gate. Focus: deletion and fixture reduction only. Flakiness and speed belong to [vitest.md](vitest.md) and [playwright.md](playwright.md); replacing mocks with real dependencies belongs to [backend-real-tests.md](backend-real-tests.md).

- Repo-specific targets: tests of dependency semantics (including our own packages, PostgreSQL, Valkey), and tests that match expected strings in source, SQL, workflow, or YAML text (a real static invariant goes in its owning no-mistakes or vouchington-tooling rule).
- Do not target credentialed or provider-backed tests merely because they skip without secrets.
- If two or more prior merged PRs from this prompt removed the same flaw, cite them and prefer one structural fix over another deletion.
- Coverage proof: when the deletion could move covered lines, branches, or patch coverage, collect the area's full LCOV and run `./ci/coverage-artifacts.sh area-check`; otherwise say in one line that it touches no instrumented production lines. Document why hard-skipped tests do not run before deleting them.
