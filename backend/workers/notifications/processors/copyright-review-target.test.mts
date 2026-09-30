import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CopyrightReviewTargetBreaches } from '@services/copyright-notices'
import {
  processCheckCopyrightReviewTarget,
  type CheckCopyrightReviewTargetDeps as Deps,
} from './copyright-review-target.mts'

const NOW = new Date('2026-07-01T12:00:00.000Z')
const none = { count: 0, noticeIds: [] }
const noBreaches: CopyrightReviewTargetBreaches = {
  waitingPastTarget: none,
  missedEscalation: none,
  missedRestorationDeadline: none,
}

function checkDeps(reviewTargetMinutes: number | null, breaches: CopyrightReviewTargetBreaches) {
  return {
    getReviewTargetMinutes: vi.fn<Deps['getReviewTargetMinutes']>(async () => reviewTargetMinutes),
    readBreaches: vi.fn<Deps['readBreaches']>(async () => breaches),
    recordBreach: vi.fn<Deps['recordBreach']>(
      context =>
        context.waitingPastTarget.count +
          context.missedEscalation.count +
          context.missedRestorationDeadline.count >
        0,
    ),
  }
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
    const deps = checkDeps(null, noBreaches)

    await expect(processCheckCopyrightReviewTarget(deps)).resolves.toEqual({ paged: false })

    expect(deps.readBreaches).toHaveBeenCalledExactlyOnceWith({
      now: NOW,
      reviewTargetMinutes: null,
    })
    expect(deps.recordBreach).toHaveBeenCalledExactlyOnceWith({
      reviewTargetMinutes: null,
      ...noBreaches,
    })
  })

  it('passes the configured target through and pages the breaches it read', async () => {
    const breaches = {
      ...noBreaches,
      waitingPastTarget: { count: 2, noticeIds: ['notice-a', 'notice-b'] },
    }
    const deps = checkDeps(240, breaches)

    await expect(processCheckCopyrightReviewTarget(deps)).resolves.toEqual({ paged: true })

    expect(deps.readBreaches).toHaveBeenCalledExactlyOnceWith({
      now: NOW,
      reviewTargetMinutes: 240,
    })
    expect(deps.recordBreach).toHaveBeenCalledExactlyOnceWith({
      reviewTargetMinutes: 240,
      ...breaches,
    })
  })
})
