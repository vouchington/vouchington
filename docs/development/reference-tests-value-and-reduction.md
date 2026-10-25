# Test Value and Safe Reduction

[Back to Tests and Checks](tests.md#test-value-and-safe-reduction)

Every test must protect an app-owned branch, invariant, side effect, mapping, or contract, and should be mutation-sensitive: a meaningful implementation defect must make it fail. Do not add or retain direct tests of npm packages, frameworks, runtimes, or other behavior the application does not own.

## Value gate

- Keep the canonical implementation once. Do not test reexports, aliases, or pure indirection separately.
- Reject self-comparison, an awaited operation with no assertion, and construction-only `typeof`, definedness, or truthiness assertions when an observable behavior can be asserted instead.
- Dedupe tests with equivalent observable outcomes, but keep tests for distinct observable contracts.
- Use the lowest-cost realistic boundary. A unit, Storybook, integration, or browser test is valuable only for the risk that boundary owns; do not repeat the same invariant across them. Prefer Storybook for static JSX it can own, and add `data-pw` only when a behavioral browser consumer needs it.
- Do not remove credentialed or provider-backed tests merely because they are skipped without secrets.
- Test helpers only when they contain nontrivial reliability behavior such as state, retry, cleanup, parsing, synchronization, or error handling.
- Tests and fixtures carry no dependency, image, browser, or tool version literals, so a routine bump never needs a matching test edit. Read the version from the owner file or assert a shape such as a digest pin or range match. Pin placement is in the [pinning policy](dependency-updates.md#docs-pinning-policy).
- Vitest tests do not spawn `no-mistakes` or call its analysis APIs; package-owned rule behavior belongs in that package, and Vouchington tests pin configuration only.
- Tests that read skills, instructions, or docs must identify a machine consumer or observable runtime contract. Wording and heading order are not contracts.
- Treat first-party packages and SDKs as dependencies for their direct semantics. A test that only finds text in source or configuration is weak unless it verifies an observable app-owned contract; enforce real static invariants in their owning rule or tool.
- Shrink fixtures and case sets to the smallest state that crosses each distinct behavior boundary.

## Deleting a test

Measure before and after under [suite rule R12](tests.md#test-suite-rules), and apply R10's app-owned behavior boundary. A changed instrumented count from dropping a dependency or text-restatement test does not itself show lost app behavior. If app production lines or branches would lose real app behavior coverage, consolidate, strengthen, or rewrite a smaller behavior test. Matching coverage alone does not make a weak test valuable.

For each new or changed test, identify the observable contract, a defect that would make it fail, and why its boundary needs coverage. Establish fixture state deliberately and assert its expected outcome; do not accept either branch just because a shared fixture might contain data. Keep browser coverage for interactions component tests cannot represent, and use retrying locator assertions for asynchronous UI.
