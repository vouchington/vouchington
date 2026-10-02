import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordCopyrightRetentionErasureFailure } from './copyright-retention-erasure-failure.mts'

// Mirrors vitest.setup.sentry-mock.mts; kept local so this .mock test owns its vi.mock().
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

vi.mock<typeof import('@sentry/node')>(import('@sentry/node'), () => ({
  ...sentryMocks,
  default: sentryMocks,
}))

const captureMessage = sentryMocks.captureMessage
const noticeId = '0199a000-0000-7000-8000-000000000001'
const otherNoticeId = '0199a000-0000-7000-8000-000000000002'

const failed = [
  { noticeId, reason: 'Error' },
  { noticeId: otherNoticeId, reason: 'DatabaseError:57014' },
]
const expectedExtra = {
  erasedCount: 3,
  failedCount: 2,
  failures: failed,
}

describe('recordCopyrightRetentionErasureFailure', () => {
  let consoleWarn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    captureMessage.mockClear()
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarn.mockRestore()
    vi.unstubAllEnvs()
  })

  it('sends nothing when every case was erased', () => {
    expect(recordCopyrightRetentionErasureFailure({ erased: 4, failed: [] })).toBe(false)

    expect(captureMessage).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
  })

  it('sends one tagged warning with only counts, ids and error names, never case data', () => {
    const withCaseData = {
      erased: 3,
      failed: failed.map(entry => ({
        ...entry,
        storageKey: 'copyright-inbound/key.pdf',
        claimantEmail: 'claimant@example.test',
        message: 'AccessDenied for arn:aws:s3:::example-bucket',
      })),
    }

    expect(recordCopyrightRetentionErasureFailure(withCaseData)).toBe(true)

    expect(captureMessage).toHaveBeenCalledOnce()
    expect(captureMessage).toHaveBeenCalledWith('copyright_retention_erasure_failed', {
      level: 'warning',
      tags: { reason: 'copyright_retention_erasure_failed', partial: 'true' },
      extra: expectedExtra,
    })
    expect(JSON.stringify(captureMessage.mock.calls)).not.toMatch(
      /storage|claimant|arn:|AccessDenied|\.pdf/i,
    )
  })

  it('marks a run that erased nothing as not partial', () => {
    recordCopyrightRetentionErasureFailure({ erased: 0, failed })

    expect(captureMessage).toHaveBeenCalledWith(
      'copyright_retention_erasure_failed',
      expect.objectContaining({
        tags: { reason: 'copyright_retention_erasure_failed', partial: 'false' },
      }),
    )
  })

  it('logs to console in development mode', () => {
    vi.stubEnv('NODE_ENV', 'development')
    recordCopyrightRetentionErasureFailure({ erased: 3, failed })

    expect(consoleWarn).toHaveBeenCalledWith(
      '[copyright] retention erasure left cases for the next run',
      expectedExtra,
    )
  })

  it('does not log to console in production without CI', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CI', '')
    recordCopyrightRetentionErasureFailure({ erased: 3, failed })

    expect(consoleWarn).not.toHaveBeenCalled()
    expect(captureMessage).toHaveBeenCalledOnce()
  })
})
