import { vi } from 'vitest'
import type * as Undici from 'undici'

// Shared by tests that mock `fetch` from `undici` to intercept the Cloudflare Turnstile
// `siteverify` call. Each consumer keeps its own `vi.mock(import('undici'), () =>
// createCaptchaUndiciMock())` call -- that keeps the `.mock.test.mts` filename suffix meaningful
// (see `no-mistakes/vitest-mock-test-file-naming` and `docs/development/reference-tests-vitest-mock-typing.md`)
// and keeps these files routed into the `backend-mocks` Vitest project.
//
// Import this module before anything that can transitively load `undici` (e.g.
// `@voucha/test-helpers/api/server`, which boots routes that import
// `backend/services/captcha/verify.mts`). `vi.mock`'s registration is hoisted above every import in
// the consumer file, but its factory still closes over `createCaptchaUndiciMock`, a live ESM
// binding from this module. If some other import triggers the mocked `undici` load before this
// binding initializes, the factory throws a temporal-dead-zone `ReferenceError` instead of
// returning the mock -- this is plain ESM evaluation order, not a Vitest-specific limitation.
export const TEST_CAPTCHA_TOKEN = 'mock-captcha-token'

export const mockFetch = vi.fn<typeof Undici.fetch>()

export async function createCaptchaUndiciMock(): Promise<typeof import('undici')> {
  const actual = await vi.importActual<typeof import('undici')>('undici')
  return { ...actual, fetch: mockFetch }
}
