# Vitest Mock Typing

[Back to Tests and Checks](tests.md#vitest-mock-typing)

Repository-wide suppression scans must include hidden source directories such as `web/.storybook`:

```bash
rg --hidden --glob '!.git/**' '@ts-(expect-error|ignore)' .
```

Tests that deliberately cross a runtime validation boundary should cast only the invalid argument
or property to its production parameter type, derived with `Parameters<typeof functionName>`.
Do not widen the production signature or add a shared unchecked-input helper for test-only values.

Three oxlint rules enforce typed mock factories: `vitest/require-mock-type-parameters`, `vitest/prefer-import-in-mock`, and `jest/no-untyped-mock-factory` (all `"error"` in `.oxlintrc.json`). The correct pattern differs by workspace.

Non-web tests must not mock internal modules with `vi.mock()`, `vi.doMock()`, `vi.unmock()`, `vi.doUnmock()`, `vi.importMock()`, or `jest.mock()` except explicit `@modules/*` integration exports tagged with `/* no-mistakes: integration=<provider> */`. Mock environment with `vi.stubEnv()`, mock external packages/API calls directly, and put provider SDK seams that need mocking under `@modules/<provider>` such as `@modules/aws`, `@modules/stripe`, or `@modules/turnstile`. New non-web tests must not mock `@services/*`, `@queues/*`, `@data-stores/*`, or relative internal service/data/queue imports. Tests under `web/**` are exempt because Next.js client/server and lazy import boundaries require module mocks. Existing non-web internal module mocks are tracked by the `no-mistakes/module-mock-boundary` baseline in `.oxlintrc.json`; new tests and refactors must reduce that baseline rather than add to it.

An integration annotation normally marks the function that directly invokes the provider API. Do not copy it onto configuration values, cached wrappers, or orchestration merely because it delegates to a tagged function. When the analyzer cannot resolve a public integration seam through a re-export or injected local alias, annotate that public seam too and guard the exceptional placement with a focused structural test. [Backend conventions](../../backend/CLAUDE.md) apply this rule to production code. Credentialed provider tests keep their own annotations so the test planner can route them to the dedicated suite.

**High-risk change pattern:** adding a new export to a module that is mocked in `.mock.test.*` files. The mock factory will silently omit the new export unless the factory explicitly spreads `...(await vi.importActual('<specifier>'))`. When changing a module's exports, search for `.mock.test.*` files that `vi.mock` it and update their factories accordingly.

Test files that directly invoke module-mocking APIs — `vi.mock()`, `vi.doMock()`, `vi.unmock()`, `vi.doUnmock()`, or the `jest.*` equivalents — must use the `.mock.test.*` suffix unless the test is rewritten to avoid the mock API. The `no-mistakes/vitest-mock-test-file-naming` rule enforces this bidirectionally: a `.mock.test.*` file with none of those calls in its own source fails too, so don't add the suffix defensively. `vi.spyOn()`, `vi.fn()`, `vi.stubEnv()`, and `vi.importMock()` do not count as module mocking for this rule and should keep the ordinary `.test.*` suffix (`vi.importMock()` is semantically a hoisted mock, but the rule does not currently check for it — don't rely on that gap staying open). Consumers whose mocks are registered only by an imported test helper likewise use the ordinary `.test.*` suffix, unless a separate Vitest project routes those consumers by filename — for example, `backend-mocks` uniquely loads the project-level `@sentry/node` mock (`vitest.setup.sentry-mock.mts`), so a file with no in-file `vi.mock()` that still depends on that project mock keeps the `.mock.test.*` suffix to stay routed there. `vi.stubEnv()` in `beforeEach` cannot affect module-level constants that were already read during import; use `vi.resetModules()` and dynamically import the module after stubbing the environment.

Do not add mocks just because integration setup is inconvenient. Prefer real PostgreSQL, Valkey, queue, worker, and service integration tests using existing test helpers; assert persisted rows, queued jobs, emitted messages, or processor results instead of mocked internal calls. Avoid partial internal mocks and mock-only helper barrels because they drift when imports change and can hide missing exports.

### Backend / lambdas / cloudflare-worker / CI (`.mock.test.mts`)

Use the typed `vi.mock<typeof import(...)>(import(...), ...)` form. This satisfies all three rules and gives the factory full type inference:

```ts
vi.mock<typeof import('@modules/stripe/customers')>(import('@modules/stripe/customers'), () => ({
  getOrCreateStripeCustomer: vi.fn<VitestLooseMock>(),
}))
```

For loose function mocks where the exact signature would cause TS2345 (e.g. AWS SDK `send`), use the `VitestLooseMock` ambient type:

```ts
send: vi.fn<VitestLooseMock>().mockResolvedValue({})
```

`VitestLooseMock` is declared per-workspace: `lambdas/types/vitest-loose-mock/`, `cloudflare-worker/types/vitest-loose-mock/`, `backend/types/vitest-loose-mock/`, and `web/test-helpers/vitest-loose-mock.d.ts`.

`VitestLooseMock` loosens only the mock function signature. Values passed to `mockResolvedValue()`,
`mockReturnValue()`, or equivalent helpers must still satisfy the real response type. Prefer a typed
fixture factory such as `web/test-helpers/api-responses/communities.ts`, or assign the response to
the production response type before passing it to the mock.

New `web/lib/api/**` wrapper tests should use `expectApiWrapperCall()` from
`web/test-helpers/api-wrapper.ts` or follow the same pattern: build a typed response value, call the
wrapper, assert the wrapper returns that response, and assert the underlying API helper received the
expected path and options. Page-level mocks do not replace wrapper/query-param contract tests for
`web/lib/api/**` helpers; helpers that translate frontend option names into backend query params need
a direct wrapper assertion for the wire key. For web tests that mock API response bodies, prefer
factories from `web/test-helpers/api-responses/`; factory defaults preserve explicit `null` and default
only on `undefined`. The `web-no-inline-api-response-mock` ast-grep rule blocks inline literals for
response families that have a registered factory. When an entity type is used in 3+ web test files,
add or reuse a `make<Entity>(overrides?)` factory in `web/test-helpers/api-responses/` so serialized
shape changes require one fixture edit instead of per-test literal updates.

### Web (`.mock.test.tsx` / `.mock.test.ts`)

Web tests use typed dynamic-import specifiers. Vitest infers the module type from the first argument:

```ts
vi.mock(import('next/navigation'), () => ({ redirect: mockRedirect }))
vi.mock(import('@/lib/api/server'), () => ({ getTopic: mockGetTopic }))
```

Partial factories behind lazy, RSC, or API boundaries can be narrower than the production module.
Preserve the factory's runtime shape and use a whole-module compatibility assertion when TypeScript
rejects that intentional partial implementation:

```ts
vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({ clientApi: { post: mockPost } }) as unknown as typeof import('@/lib/api/client/instance'),
)
```

Do not add file-level suppressions for `vitest/prefer-import-in-mock` or
`jest/no-untyped-mock-factory`.

### Direct Server Component tests and request-scoped Next.js APIs

Directly invoking an async Server Component does not create Next.js request-store machinery. Shared server helpers reached by that component can therefore throw when they call request-scoped APIs such as `headers()`, `cookies()`, or `draftMode()`.

Prefer fixing this at the shared helper when execution without a request has a valid fallback. Guard the request-scoped call at the source and return the same value the helper should produce when that request data is unavailable. [`getResolvedUiLocale()`](../../web/lib/i18n/get-resolved-ui-locale.ts) is the canonical `headers()` pattern: it treats a missing request scope as no `Accept-Language` header.

Only mock `next/headers` when request data is specifically part of the behavior under test or no valid source fallback exists. Keep any test using that mock in a web `.mock.test.ts` or `.mock.test.tsx` file under the conventions above; do not add blanket per-component mocks to hide an unguarded shared helper.

### Mocking `next/navigation` hooks

Next.js 16's `useSearchParams()`, `usePathname()`, and `useRouter()` read from React context — they **never** read `window.location`. The real `useSearchParams()` returns `null` in jsdom when there is no `SearchParamsContext` provider. Do **not** hand-roll `vi.mock('next/navigation', () => ({ useSearchParams: () => ... }))` per test — it silently diverges when the runtime contract changes (PR #4384 required two separate fix commits for this reason).

**Required pattern** — use the shared singleton:

```ts
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
// ↑ MUST appear before the component-under-test import (Vitest resolves imports in
//   source order; the vi.mock factory must see navMockModule before the component's
//   own next/navigation import fires the factory).
import { MyComponent } from '../my-component'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockNav = createNavMock()

describe('MyComponent', () => {
  beforeEach(() => mockNav.reset())

  it('navigates on submit', () => {
    mockNav.setSearchParams('q=hello')
    mockNav.setPathname('/search')
    render(<MyComponent />)
    // ...
    expect(mockNav.push).toHaveBeenCalledWith('/search?q=hello', { scroll: false })
  })
})
```

**Exception** — components that read `window.location` directly inside an event handler (not via a hook): use `window.history.pushState(...)` to set the URL and do not mock the hook. This applies to `client-search-form` and `domains-search-form`, both of which were refactored to read `window.location` at submit time to avoid unnecessary hook subscriptions.

`navMockModule` and `createNavMock` are in `web/test-helpers/next-navigation-mock.ts` — see that file's JSDoc for full API reference.

`mockLucideReact` is in `web/test-helpers/lucide-icons.tsx`. It spreads the real
`lucide-react` module under any overrides, so unmocked icon exports are always preserved.
Use it whenever a `web/` test needs to stub a subset of lucide icons; a bare
`vi.mock('lucide-react', () => ({ ... }))` without the spread was the root cause of the
PR #6077 regression. Enforced by the `web-test-no-bare-lucide-mock` ast-grep rule.
