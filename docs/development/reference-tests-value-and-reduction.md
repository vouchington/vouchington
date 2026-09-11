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
- Vitest tests must not spawn `no-mistakes` or call its analysis APIs, including `loadRepoTopology()`. Package-owned rule and planner behavior belongs in that package; Filaments tests pin configuration and mock adapter mapping. Live workflow topology audits run from [`ci/check-live-workflow-topology.mts`](../../ci/check-live-workflow-topology.mts) in static-code-analysis, after `no-mistakes check`.

Coverage sameness is necessary but not sufficient. Before deleting a weak test that is the sole project coverage owner for production code, consolidate, strengthen, or move that coverage to a valuable test. Never use a coverage percentage alone as proof that a deletion preserves a contract.

## Evidence for a reduction

Record exact base and head evidence. For changed production behavior, run the owning focused tests and the applicable patch-coverage preview. For historical Istanbul totals, compare a base and head `coverage-summary.json` with:

```bash
pnpm --dir ci exec coverage-check compare-summary \
  --base-summary <base-coverage-summary.json> \
  --head-summary <head-coverage-summary.json> \
  --base-root <base-checkout-root> \
  --head-root <head-checkout-root> \
  --json <comparison.json>
```

Generate base and head artifacts with matching coverage producer, suite selection, configuration,
toolchain, environment, and their respective exact checkout roots; otherwise the comparison is not
evidence of coverage preservation. `coverage-check` owns the comparator's argument validation,
source normalization, regression semantics, and output contract. See [CI Tooling: Historical
coverage baseline comparison](../../ci/README.md#historical-coverage-baseline-comparison) for
Filaments' reproducible artifact-generation conditions; run `pnpm --dir ci exec coverage-check
compare-summary --help` for the package CLI.

This is a historical baseline guard, not patch coverage. It does not determine whether the edited lines execute or whether a test is valuable. Use [Local Patch Coverage Preview](reference-tests-local-patch-coverage-preview.md) for the changed-line gate.
