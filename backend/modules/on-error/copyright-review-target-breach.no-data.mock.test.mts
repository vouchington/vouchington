import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordCopyrightReviewTargetBreach } from './copyright-review-target-breach.mts'

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
const none = { count: 0, noticeIds: [] }
const noticeId = '0199a000-0000-7000-8000-000000000001'
const olderNoticeId = '0199a000-0000-7000-8000-000000000002'

const breach = {
  reviewTargetMinutes: 240,
  waitingPastTarget: { count: 3, noticeIds: [olderNoticeId, noticeId] },
  missedEscalation: { count: 1, noticeIds: [olderNoticeId] },
  missedRestorationDeadline: none,
}

const expectedExtra = {
  reviewTargetMinutes: 240,
  waitingPastTargetCount: 3,
  waitingPastTargetNoticeIds: [olderNoticeId, noticeId],
  missedEscalationCount: 1,
  missedEscalationNoticeIds: [olderNoticeId],
  missedRestorationDeadlineCount: 0,
  missedRestorationDeadlineNoticeIds: [],
}

describe('recordCopyrightReviewTargetBreach', () => {
  let consoleWarn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    captureMessage.mockClear()
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarn.mockRestore()
    vi.unstubAllEnvs()
  })

  it('sends nothing when the target is unset and no deadline is missed', () => {
    const sent = recordCopyrightReviewTargetBreach({
      reviewTargetMinutes: null,
      waitingPastTarget: none,
      missedEscalation: none,
      missedRestorationDeadline: none,
    })

    expect(sent).toBe(false)
    expect(captureMessage).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
  })

  it('sends one tagged warning with only counts and notice ids', () => {
    const withClaimant = {
      ...breach,
      claimantContact: 'claimant@example.test',
      waitingPastTarget: { ...breach.waitingPastTarget, posterHandle: 'poster' },
    }

    expect(recordCopyrightReviewTargetBreach(withClaimant)).toBe(true)

    expect(consoleWarn).not.toHaveBeenCalled()
    expect(captureMessage).toHaveBeenCalledOnce()
    expect(captureMessage).toHaveBeenCalledWith('copyright_review_target_breach', {
      level: 'warning',
      tags: {
        reason: 'copyright_review_target_breach',
        waiting_past_target: 'true',
        missed_escalation: 'true',
        missed_restoration_deadline: 'false',
      },
      extra: expectedExtra,
    })
  })

  it('pages a missed deadline while the review target is unset', () => {
    recordCopyrightReviewTargetBreach({
      reviewTargetMinutes: null,
      waitingPastTarget: none,
      missedEscalation: { count: 1, noticeIds: [noticeId] },
      missedRestorationDeadline: { count: 1, noticeIds: [noticeId] },
    })

    expect(captureMessage).toHaveBeenCalledOnce()
    expect(captureMessage).toHaveBeenCalledWith(
      'copyright_review_target_breach',
      expect.objectContaining({
        tags: {
          reason: 'copyright_review_target_breach',
          waiting_past_target: 'false',
          missed_escalation: 'true',
          missed_restoration_deadline: 'true',
        },
        extra: expect.objectContaining({
          reviewTargetMinutes: null,
          missedRestorationDeadlineNoticeIds: [noticeId],
        }),
      }),
    )
  })

  it('logs to console in development mode', () => {
    vi.stubEnv('NODE_ENV', 'development')
    recordCopyrightReviewTargetBreach(breach)

    expect(consoleWarn).toHaveBeenCalledWith('[copyright] review target breached', expectedExtra)
  })

  it('logs to console in CI even outside development mode', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CI', 'true')
    recordCopyrightReviewTargetBreach(breach)

    expect(consoleWarn).toHaveBeenCalledWith('[copyright] review target breached', expectedExtra)
  })

  it('does not log to console in production without CI', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CI', '')
    recordCopyrightReviewTargetBreach(breach)

    expect(consoleWarn).not.toHaveBeenCalled()
    expect(captureMessage).toHaveBeenCalledOnce()
  })
})
