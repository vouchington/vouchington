import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { sentryCaptureMessageMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { createCopyrightNoticeSchemaFixture } from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import {
  insertUnreviewedCopyrightSubmission,
  insertOpenCopyrightDeadline,
} from '@voucha/test-helpers/data-stores/psql/copyright-review-target'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { copyrightConfig } from '@services/copyright-notices/config'
import { processCheckCopyrightReviewTarget } from './copyright-review-target.mts'

const NOW = new Date('2026-07-01T12:00:00.000Z')

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
    const fixture = await createCopyrightNoticeSchemaFixture()
    const excluded = await createCopyrightNoticeSchemaFixture()
    await insertUnreviewedCopyrightSubmission({
      noticeId: fixture.noticeId,
      kind: 'appeal',
      receivedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    await insertOpenCopyrightDeadline({
      noticeId: excluded.noticeId,
      actorUserId: excluded.actorUserId,
      escalationAt: new Date('2026-06-29T00:00:00.000Z'),
      restorationDeadlineAt: new Date('2026-06-30T00:00:00.000Z'),
    })

    await expect(
      processCheckCopyrightReviewTarget({ noticeIds: [fixture.noticeId], emailIntakeIds: [] }),
    ).resolves.toEqual({ paged: false })

    expect(sentryCaptureMessageMock).not.toHaveBeenCalled()
  })

  it('passes the configured target through and pages the breaches it read', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(copyrightConfig, { reviewTargetMinutes: 240 }),
    )
    const fixture = await createCopyrightNoticeSchemaFixture()
    const second = await createCopyrightNoticeSchemaFixture()
    const excluded = await createCopyrightNoticeSchemaFixture()
    const receivedAt = new Date('2026-07-01T00:00:00.000Z')
    await insertUnreviewedCopyrightSubmission({
      noticeId: fixture.noticeId,
      kind: 'appeal',
      receivedAt,
    })
    await insertUnreviewedCopyrightSubmission({
      noticeId: second.noticeId,
      kind: 'appeal',
      receivedAt: new Date('2026-07-01T01:00:00.000Z'),
    })
    await insertUnreviewedCopyrightSubmission({
      noticeId: excluded.noticeId,
      kind: 'appeal',
      receivedAt,
    })
    const intake = await createParsedCopyrightEmailIntake(receivedAt)
    await createParsedCopyrightEmailIntake(receivedAt)

    await expect(
      processCheckCopyrightReviewTarget({
        noticeIds: [fixture.noticeId, second.noticeId],
        emailIntakeIds: [intake.id],
      }),
    ).resolves.toEqual({ paged: true })

    expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith(
      'copyright_review_target_breach',
      expect.objectContaining({
        extra: {
          reviewTargetMinutes: 240,
          waitingPastTargetCount: 2,
          waitingPastTargetNoticeIds: [fixture.noticeId, second.noticeId],
          missedEscalationCount: 0,
          missedEscalationNoticeIds: [],
          missedRestorationDeadlineCount: 0,
          missedRestorationDeadlineNoticeIds: [],
          emailIntakesWaitingPastTargetCount: 1,
          emailIntakesWaitingPastTargetIds: [intake.id],
        },
      }),
    )
  })
})
