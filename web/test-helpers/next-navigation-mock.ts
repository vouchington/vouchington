import { vi } from 'vitest'
// Type-only import from Next.js internals so `useSearchParams` in `navMockModule` satisfies
// `ReadonlyURLSearchParams` (the real hook return type). This is a type import only — the
// path is never bundled or mocked by tests.
import type { ReadonlyURLSearchParams } from 'next/dist/client/components/readonly-url-search-params'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

/**
 * Shared factory for mocking `next/navigation` in Vitest unit tests.
 *
 * Using a single helper instead of ad-hoc `vi.mock('next/navigation', ...)` factories
 * prevents the mock from silently diverging from the real hook contract. When Next.js
 * changes the runtime behaviour of `useSearchParams` / `usePathname` / `useRouter`, only
 * this file needs updating.
 *
 * Usage:
 *
 * ```ts
 * import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
 *
 * // IMPORTANT: this import must appear before the component-under-test import so that
 * // navMockModule is resolved before next/navigation's mock factory is called.
 * import { MyComponent } from '../my-component'
 *
 * vi.mock('next/navigation', () => navMockModule)
 *
 * const mockNav = createNavMock()
 *
 * beforeEach(() => mockNav.reset())
 *
 * it('navigates to results', () => {
 *   mockNav.setSearchParams('q=hello')
 *   mockNav.setPathname('/search')
 *   // ... render ...
 *   expect(mockNav.push).toHaveBeenCalledWith('/search?q=hello', { scroll: false })
 * })
 * ```
 *
 * The mock always returns a real `URLSearchParams` instance (not a stubbed object),
 * preserving the method-binding contract of the real hook.
 *
 * IMPORTANT: Import `navMockModule` (and `createNavMock`) from this file BEFORE importing
 * the component under test. Vitest resolves static imports sequentially in source order;
 * if the component import comes first, `next/navigation`'s mock factory fires before
 * `navMockModule` is available and you'll get a TDZ / "before initialization" error.
 *
 * Do NOT hand-roll `vi.mock('next/navigation', () => ({ useSearchParams: () => ... }))`.
 * Use this helper instead — enforced by the `web-test-no-ad-hoc-search-params-mock`
 * ast-grep rule.
 */

const state = {
  // Cast to ReadonlyURLSearchParams so navMockModule satisfies typeof import('next/navigation').
  // At runtime this is a plain URLSearchParams — the cast is type-system-only.
  searchParams: new URLSearchParams() as ReadonlyURLSearchParams,
  pathname: '/',
  params: {} as Record<string, string>,
}

const push = vi.fn<VitestLooseMock>()
const replace = vi.fn<VitestLooseMock>()
const refresh = vi.fn<VitestLooseMock>()
const back = vi.fn<VitestLooseMock>()
const forward = vi.fn<VitestLooseMock>()
const prefetch = vi.fn<VitestLooseMock>()

const spies = [push, replace, refresh, back, forward, prefetch]
const router = {
  push,
  replace,
  refresh,
  back,
  forward,
  prefetch,
  bfcacheId: '0',
} satisfies AppRouterInstance

/**
 * The mock module object. Pass directly to `vi.mock('next/navigation', () => navMockModule)`.
 *
 * All hook implementations read from mutable `state` lazily so changing state
 * between tests (via `mockNav.setSearchParams` / `mockNav.setPathname` / `mockNav.setParams`)
 * takes effect immediately on the next render without re-hoisting.
 */
export const navMockModule = {
  useRouter: () => router,
  useSearchParams: () => state.searchParams,
  usePathname: () => state.pathname,
  useParams: () => state.params,
} as unknown as typeof import('next/navigation')

/**
 * Returns a control object for the shared `navMockModule` singleton.
 *
 * Call once at module scope — repeated calls return the same underlying spies and state.
 */
export function createNavMock() {
  return {
    /** The router `push` spy — most commonly asserted in tests. */
    push,
    /** The router `replace` spy. */
    replace,
    /** The router `refresh` spy. */
    refresh,
    /** The router `back` spy. */
    back,
    /** The router `forward` spy. */
    forward,
    /** The router `prefetch` spy. */
    prefetch,

    /**
     * The mock module object. Equivalent to the exported `navMockModule` singleton.
     * Included for backwards-compat and convenience.
     */
    module: navMockModule,

    /**
     * Set the value returned by `useSearchParams()` for subsequent renders.
     *
     * Accepts the same init forms as `new URLSearchParams()`:
     * - `'key=value&other=x'` — query string (no leading `?`)
     * - `new URLSearchParams('...')` — copy an existing instance
     * - `undefined` — resets to empty params
     */
    setSearchParams(init?: string | URLSearchParams) {
      // Cast: plain URLSearchParams at runtime, ReadonlyURLSearchParams for type compatibility.
      state.searchParams = new URLSearchParams(init) as ReadonlyURLSearchParams
    },

    /** Set the value returned by `usePathname()` for subsequent renders. */
    setPathname(pathname: string) {
      state.pathname = pathname
    },

    /** Set the value returned by `useParams()` for subsequent renders. */
    setParams(params: Record<string, string>) {
      state.params = params
    },

    /**
     * Reset all state and spy history.
     *
     * Call in `beforeEach` so each test starts with an empty `URLSearchParams`,
     * pathname `'/'`, empty params, and no recorded spy calls.
     */
    reset() {
      state.searchParams = new URLSearchParams() as ReadonlyURLSearchParams
      state.pathname = '/'
      state.params = {}
      spies.forEach(fn => fn.mockReset())
    },
  }
}
