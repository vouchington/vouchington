import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { sentryCaptureMessageMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { copyrightConfig } from '@services/copyright-notices/config'
import { processCheckCopyrightReviewTarget } from './copyright-review-target.mts'

type Deps = Required<NonNullable<Parameters<typeof processCheckCopyrightReviewTarget>[0]>>
type CopyrightReviewTargetBreaches = Awaited<ReturnType<Deps['readBreaches']>>

const NOW = new Date('2026-07-01T12:00:00.000Z')
const none = { count: 0, noticeIds: [] }
const noBreaches: CopyrightReviewTargetBreaches = {
  waitingPastTarget: none,
  missedEscalation: none,
  missedRestorationDeadline: none,
  emailIntakesWaitingPastTarget: { count: 0, emailIntakeIds: [] },
}

function checkDeps(breaches: CopyrightReviewTargetBreaches) {
  return { readBreaches: vi.fn<Deps['readBreaches']>(async () => breaches) }
}

describe('processCheckCopyrightReviewTarget', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads with no target and reports a quiet sweep while the target is unset', async () => {
    onTestFinished(overrideDynamicConfigFieldsForTest(copyrightConfig, { reviewTargetMinutes: 0 }))
    const deps = checkDeps(noBreaches)

    await expect(processCheckCopyrightReviewTarget(deps)).resolves.toEqual({ paged: false })

    expect(deps.readBreaches).toHaveBeenCalledExactlyOnceWith({
      now: NOW,
      reviewTargetMinutes: null,
    })
    expect(sentryCaptureMessageMock).not.toHaveBeenCalled()
  })

  it('passes the configured target through and pages the breaches it read', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(copyrightConfig, { reviewTargetMinutes: 240 }),
    )
    const breaches = {
      ...noBreaches,
      waitingPastTarget: { count: 2, noticeIds: ['notice-a', 'notice-b'] },
      emailIntakesWaitingPastTarget: { count: 1, emailIntakeIds: ['intake-a'] },
    }
    const deps = checkDeps(breaches)

    await expect(processCheckCopyrightReviewTarget(deps)).resolves.toEqual({ paged: true })

    expect(deps.readBreaches).toHaveBeenCalledExactlyOnceWith({
      now: NOW,
      reviewTargetMinutes: 240,
    })
    expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith(
      'copyright_review_target_breach',
      expect.objectContaining({
        extra: {
          reviewTargetMinutes: 240,
          waitingPastTargetCount: 2,
          waitingPastTargetNoticeIds: ['notice-a', 'notice-b'],
          missedEscalationCount: 0,
          missedEscalationNoticeIds: [],
          missedRestorationDeadlineCount: 0,
          missedRestorationDeadlineNoticeIds: [],
          emailIntakesWaitingPastTargetCount: 1,
          emailIntakesWaitingPastTargetIds: ['intake-a'],
        },
      }),
    )
  })
})
