Review React components in `web/**`. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

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
- All pure components should have a Storybook story.
- All pure components should have Vitest tests.
- All pure components should have a `data-pw` Playwright test ID.
- All `data-pw` should have corresponding Playwright tests.
- Inspect exported server helpers used by Server Components for unguarded `headers()`, `cookies()`, or `draftMode()` calls. When no-request execution has a valid fallback, guard the helper at the source instead of adding blanket test mocks.
- The PR must identify and test one concrete boundary reduction. Prefer a fix that also increases
  coverage, removes duplication, or reduces RSC payload size.
- React class components must live in a `'use client'` module. `'use server'` is not a
  substitute. `web-class-component-needs-use-client` enforces this.
- Add behavior-focused regression tests. When compiler transformation itself is relevant, validate
  with a `NEXT_TEST_BUILD=1` Next build; do not assert compiler-generated callback/object identity
  in Vitest and do not compile Storybook as a proxy for the production build.
