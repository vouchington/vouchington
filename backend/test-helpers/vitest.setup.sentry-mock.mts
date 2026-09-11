/* oxlint-disable vitest/require-top-level-describe -- registered as a Vitest setupFile; the top-level vi.mock('@sentry/node') and beforeEach reset hook must register before worker preloads import onError's Sentry wrapper, so they cannot be wrapped in a describe block. */
import { beforeEach, vi } from 'vitest'

// Mock the external @sentry/node SDK for the whole backend-mocks project.
//
// `@modules/on-error/sentry.mts` is the only backend importer of `@sentry/node`; it runs
// `Sentry.init()` at module-eval time and `onError` then calls `Sentry.captureException`.
// The `glide-mq-workers` setup file imports in-process workers that transitively load
// `@modules/on-error`, so the real Sentry singleton would be bound during setup before any
// individual test's `vi.mock` could intercept it. Registering the mock here — as the FIRST
// setup file of the `backend-mocks` project — guarantees the worker preload (and every test)
// binds this mock instead of the real SDK, so tests can assert error reporting via the real
// `onError` by checking `captureException`.
//
// Tests assert with `import * as Sentry from '@sentry/node'` +
// `vi.mocked(Sentry.captureException)`, or import `sentryCaptureExceptionMock` below.
const sentryMocks = vi.hoisted(() => {
  const key = 'vouchaSentryMocks'
  const globalMocks = globalThis as typeof globalThis & {
    [key]?: {
      init: ReturnType<typeof vi.fn<VitestLooseMock>>
      captureException: ReturnType<typeof vi.fn<VitestLooseMock>>
      captureMessage: ReturnType<typeof vi.fn<VitestLooseMock>>
      flush: ReturnType<typeof vi.fn<VitestLooseMock>>
      addBreadcrumb: ReturnType<typeof vi.fn<VitestLooseMock>>
    }
  }
  const mocks = globalMocks[key] ?? {
    init: vi.fn<VitestLooseMock>(),
    captureException: vi.fn<VitestLooseMock>(),
    captureMessage: vi.fn<VitestLooseMock>(),
    flush: vi.fn<VitestLooseMock>(() => Promise.resolve(true)),
    addBreadcrumb: vi.fn<VitestLooseMock>(),
  }
  globalMocks[key] = mocks
  mocks.captureMessage ??= vi.fn<VitestLooseMock>()
  return mocks
})

vi.mock<typeof import('@sentry/node')>(import('@sentry/node'), async importOriginal => {
  const original = await importOriginal<typeof import('@sentry/node')>()
  const mockedSentry = { ...original, ...sentryMocks }
  return { ...mockedSentry, default: mockedSentry }
})

beforeEach(() => {
  sentryMocks.init.mockReset()
  sentryMocks.captureException.mockReset()
  sentryMocks.captureMessage.mockReset()
  sentryMocks.flush.mockReset()
  sentryMocks.flush.mockResolvedValue(true)
  sentryMocks.addBreadcrumb.mockReset()
})

export const sentryCaptureExceptionMock = sentryMocks.captureException
export const sentryCaptureMessageMock = sentryMocks.captureMessage
export const sentryFlushMock = sentryMocks.flush
export const sentryAddBreadcrumbMock = sentryMocks.addBreadcrumb
