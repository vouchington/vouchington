Review React components in `web/**`. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why only after completing the required audit below.

- Initialize dependencies with `./dev/initialize monorepo`, then run `pnpm exec oxlint --type-aware --deny-warnings web` so the native React Compiler diagnostics run on the current web source. A run that cannot initialize or execute this compiler scan is incomplete, not a verified no-op.
- Audit production React Compiler suppressions with `rg -n 'oxlint-disable.*react/' web`. Compare each rule name with the native compiler rules in `.oxlintrc.react.json`, inspect every production match against its current source and behavior tests, and report the matches reviewed or that none exist. No matches from `rg` means the search found none. Do not broaden or add suppressions.
- Trace one asynchronous identity boundary end to end. Start with `web/app/(my)/my/data/use-data-request-stream.ts` and its owning section tests: inspect EventSource callbacks, REST completions, retry timers, and effect cleanup across `userId` or request-id changes. An old identity must not update the current request or error state. If that path is already resolved, choose one other keyed async flow and record the evidence.
- For a qualifying change, add or update behavior-focused coverage for the selected improvement and run the relevant tests. Include identity-transition coverage when the change affects that boundary. For a no-op, report the exact boundary reviewed, the tested or inspected transition, and why no safe change qualified, alongside the initialization, compiler scan, suppression audit, and other required checks.

- We should have many pure components. React Compiler is enabled, so do not add `memo(...)` for re-render prevention.
- Use a web native React Compiler diagnostic (`react/purity`, `react/refs`, or
  `react/set-state-in-effect`) to select one actionable purity, ref, or effect-state
  improvement. Do not add broad or file-level suppressions.
- Use an audit of production native `react/*` compiler suppressions to select the bounded
  improvement when appropriate, and remove the chosen suppression by expressing the intended data
  flow directly. Treat stale async completions across prop/query changes as correctness bugs.
- Audit keyed state that can survive an identity transition, such as switching the active account,
  community, route entity, or query. Reset or re-key state at the identity boundary and test the
  transition, not only each identity in isolation.
- Components should be DRY; avoid similar components by making components configurable with props.
- Audit actual React Server Component → `'use client'` boundaries. Only values crossing those
  boundaries enter the Flight payload; props passed between components already in the client tree
  do not create another serialization boundary.
- Pick one boundary and reduce it to the smallest view model needed by that client island. Prefer
  server composition or cached server reads when the data does not need client interactivity.
- Project runtime payloads explicitly when reducing a boundary. TypeScript `Pick` and `Omit` narrow
  types but do not remove runtime fields; add an exact-key regression assertion for the serialized
  value so excluded fields cannot leak back into the payload.
- Do not introduce Context to avoid serialization: a Provider mounted from a Server Component must
  still receive serialized values. Use Context only for genuinely shared interactive client state,
  place its Provider as deep as practical, and keep its value minimal.
- Add coverage at the lowest-cost boundary that verifies meaningful user behavior, following [Test Value](../../development/tests.md#test-value-and-safe-reduction) and [Web Agent Rules](../../../web/AGENTS.md). A component does not need a story, unit test, or browser selector solely because it is pure; add `data-pw` only when a real browser test needs a stable selector, and ensure it is used by that test.
- Inspect exported server helpers used by Server Components for unguarded `headers()`, `cookies()`, or `draftMode()` calls. When no-request execution has a valid fallback, guard the helper at the source instead of adding blanket test mocks.
- Identify and validate the selected concrete improvement. When it reduces an RSC boundary, name
  the view model and prove excluded runtime fields are absent. Prefer a fix that also improves
  coverage, removes duplication, or reduces payload size.
- React class components must live in a `'use client'` module. `'use server'` is not a
  substitute. `web-class-component-needs-use-client` enforces this.
- Add behavior-focused regression tests. When compiler transformation itself is relevant, validate
  with a `NEXT_TEST_BUILD=1` Next build; do not assert compiler-generated callback/object identity
  in Vitest and do not compile Storybook as a proxy for the production build.
