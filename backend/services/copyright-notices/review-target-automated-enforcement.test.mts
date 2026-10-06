import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { insertReviewedCopyrightFormIntake } from '@voucha/test-helpers/data-stores/psql/copyright-staff-queue'
import { readCopyrightStaffQueueCursorRows } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  confirmCopyrightRestrictionReview,
  insertUnreviewedCopyrightSubmission,
} from '@voucha/test-helpers/data-stores/psql/copyright-review-target'
import { createCopyrightNoticeSchemaFixture } from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import { automatedAssessmentSql } from './automated-assessment-sql.mts'
import { readCopyrightReviewTargetBreaches } from './index.mts'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'

async function oldForm() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(Date.now() - 3 * 3_600_000))
  try {
    return await createClearScreenedForm()
  } finally {
    vi.useRealTimers()
  }
}
async function automatedPendingRequest() {
  const { notice, screeningId } = await oldForm()
  await appendCopyrightSubmissionAssessment({
    submissionId: notice.intake.copyright_notice_submission_id,
    currentUser: null,
    assessedAt: new Date(),
    substantiallyCompliant: true,
    copyrightFormScreeningId: screeningId,
  })
  return notice.intake.copyright_notice_id
}

describe('automated enforcement paging age', () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  it('times automated pending requests from receipt while staff display keeps assessment age', async () => {
    const noticeId = await automatedPendingRequest()
    const read = await readCopyrightReviewTargetBreaches({
      now: new Date(),
      reviewTargetMinutes: 60,
      noticeIds: [noticeId],
    })
    expect(read.waitingPastTarget).toEqual({ count: 1, noticeIds: [noticeId] })
    const [key] = await readCopyrightStaffQueueCursorRows([noticeId])
    expect(Date.parse(key!.waiting_since)).toBeGreaterThan(Date.now() - 3_600_000)
  })
  it('times staff-assessed pending requests from the assessment', async () => {
    const { notice } = await oldForm()
    const staff = await createTestCopyrightStaff()
    const noticeId = notice.intake.copyright_notice_id
    await insertReviewedCopyrightFormIntake({ noticeId, reviewerUserId: staff.id })
    await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      currentUser: staff,
      assessedAt: new Date(),
      substantiallyCompliant: true,
    })
    const read = (now: Date) =>
      readCopyrightReviewTargetBreaches({ now, reviewTargetMinutes: 60, noticeIds: [noticeId] })
    expect((await read(new Date())).waitingPastTarget).toEqual({ count: 0, noticeIds: [] })
    expect((await read(new Date(Date.now() + 2 * 3_600_000))).waitingPastTarget).toEqual({
      count: 1,
      noticeIds: [noticeId],
    })
  })
  it('still pages an unassessed filing and an automated request in the same read', async () => {
    const automated = await automatedPendingRequest()
    const filing = await createCopyrightNoticeSchemaFixture()
    await confirmCopyrightRestrictionReview(filing)
    await insertUnreviewedCopyrightSubmission({
      noticeId: filing.noticeId,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date(Date.now() - 3 * 3_600_000),
    })
    const read = await readCopyrightReviewTargetBreaches({
      now: new Date(),
      reviewTargetMinutes: 60,
      noticeIds: [automated, filing.noticeId],
    })
    expect(read.waitingPastTarget.count).toBe(2)
    expect(read.waitingPastTarget.noticeIds).toEqual(
      expect.arrayContaining([automated, filing.noticeId]),
    )
  })
})

describe('automated assessment SQL alias boundary', () => {
  it.each(['assessment; DROP TABLE notices', 'assessment.id', 'ASSESSMENT', '1assessment', ''])(
    'rejects unsafe alias %s before composing SQL',
    alias => {
      expect(() => automatedAssessmentSql(alias)).toThrow('Invalid copyright SQL alias')
    },
  )
})
