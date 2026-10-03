# Test Value and Safe Reduction

[Back to Tests and Checks](tests.md#test-value-and-safe-reduction)

Every test must protect an app-owned branch, invariant, side effect, mapping, or contract, and should be mutation-sensitive: a meaningful implementation defect must make it fail. Do not add or retain direct tests of npm packages, frameworks, runtimes, or other behavior the application does not own.

## Value gate

- Keep the canonical implementation once. Do not test reexports, aliases, or pure indirection separately.
- Reject self-comparison, an awaited operation with no assertion, and construction-only `typeof`, definedness, or truthiness assertions when an observable behavior can be asserted instead.
- Dedupe tests with equivalent observable outcomes, while preserving tests for distinct observable contracts.
- Use the lowest-cost realistic boundary. A unit, Storybook, integration, or browser test is valuable only for the risk that boundary owns; do not repeat the same invariant across them.
- Prefer Storybook for static JSX when it can own the visual/component contract. Add `data-pw` only when a behavioral browser consumer needs it.
- Do not remove credentialed or provider-backed tests merely because they are skipped without secrets or constrained to a particular environment.
- Test helpers only when they contain nontrivial reliability behavior, such as state, retry, cleanup, parsing, synchronization, or error handling.
- Tests and fixtures carry no dependency, image, browser, or tool version literals, so a routine bump in the production owner file never needs a matching test edit. Read the version from that file, derive it from the installed package, or assert a shape or policy such as a digest pin or a range match. Where pins belong is the [pinning policy](dependency-updates.md#docs-pinning-policy). no-mistakes `test-no-dependency-pins` enforces part of this; the rest is review.
- Vitest tests must not spawn `no-mistakes` or call its analysis APIs, including `loadRepoTopology()`. Package-owned rule and planner behavior belongs in that package; Vouchington tests pin configuration and mock adapter mapping. Live workflow topology audits run from [`ci/check-live-workflow-topology.mts`](../../ci/check-live-workflow-topology.mts) in static-code-analysis, after `no-mistakes check`.

Coverage sameness is necessary but not sufficient. Before deleting a weak test that is the sole project coverage owner for production code, consolidate, strengthen, or move that coverage to a valuable test. Never use a coverage percentage alone as proof that a deletion preserves a contract.

## Review questions

For each new or changed test, identify the observable contract, an implementation defect that
would make the test fail, and why its chosen boundary needs coverage. Prefer concrete response
fields, persisted state, or an owned queued job over merely checking that an operation returned
a defined value. A definedness assertion can still be useful when the operation itself enforces
the contract, such as a throwing DOM query.

Establish the fixture state deliberately and assert its expected outcome. Do not accept either
branch just because a shared fixture might contain data. Keep browser coverage for interactions
that component tests cannot represent, and use retrying locator assertions for asynchronous UI.
The regex-only `repo-file-policy` check rejects the exact `.isVisible().catch(() => false)`
fallback in tracked Playwright specs, including multiline calls. It does not parse code or infer
assertion quality, and the same literal inside a comment or string also matches.

Tests reading skills, instructions, or reference docs must identify a machine consumer or
observable runtime contract. Wording, heading order, and example-command spelling alone are
not contracts. Preserve checks for parsed configuration and machine-consumed markers; use the
existing documentation link checks for link integrity. Test value and duplication remain review
judgments rather than broad bans on mocks, Markdown reads, or `toBeDefined()`.

## Evidence for a reduction

Record exact base and head evidence. For changed production behavior, run the owning focused tests.
Area patch coverage runs only from full LCOV produced by CI; locally, use
`./ci/coverage-artifacts.sh area-check` after collecting the owning area's artifacts. Coverage
comparison alone does not prove that a test protects a valuable contract.
