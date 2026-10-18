import { describe, expect, it } from 'vitest'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { insertReviewedCopyrightFormIntake } from '@voucha/test-helpers/data-stores/psql/copyright-staff-queue'
import { readCopyrightStaffQueueCursorRows } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  confirmCopyrightRestrictionReview,
  insertUnreviewedCopyrightSubmission,
  readTestCopyrightAssessmentCreatedAt,
} from '@voucha/test-helpers/data-stores/psql/copyright-review-target'
import { createCopyrightNoticeSchemaFixture } from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import { automatedAssessmentSql } from './automated-assessment-sql.mts'
import { readCopyrightReviewTargetBreaches } from './index.mts'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'

const HOUR_MS = 60 * 60 * 1000
const oldReceipt = new Date('2024-06-01T12:00:00.000Z')

async function oldForm(receivedAt = oldReceipt) {
  return createClearScreenedForm(1, {}, { now: receivedAt })
}
async function automatedPendingRequest(receivedAt?: Date) {
  const { notice, screeningId } = await oldForm(receivedAt)
  await appendCopyrightSubmissionAssessment({
    submissionId: notice.intake.copyright_notice_submission_id,
    currentUser: null,
    assessedAt: new Date(),
    substantiallyCompliant: true,
    copyrightFormScreeningId: screeningId,
  })
  return {
    noticeId: notice.intake.copyright_notice_id,
    submissionId: notice.intake.copyright_notice_submission_id,
  }
}

describe('automated enforcement paging age', () => {
  it('times automated pending requests from receipt while staff display keeps assessment age', async () => {
    const { noticeId, submissionId } = await automatedPendingRequest()
    const read = await readCopyrightReviewTargetBreaches({
      now: new Date(oldReceipt.getTime() + 3 * HOUR_MS),
      reviewTargetMinutes: 60,
      noticeIds: [noticeId],
    })
    expect(read.waitingPastTarget).toEqual({ count: 1, noticeIds: [noticeId] })
    const [key] = await readCopyrightStaffQueueCursorRows([noticeId])
    const createdAt = await readTestCopyrightAssessmentCreatedAt(submissionId)
    expect(Date.parse(key!.waiting_since)).toBe(createdAt.getTime())
  })

  it.each([
    '2024-01-31T23:59:59.999Z',
    '2024-02-01T00:00:00.001Z',
    '2024-02-29T23:59:59.999Z',
    '2024-03-01T00:00:00.001Z',
    '2024-12-31T23:59:59.999Z',
    '2025-01-01T00:00:00.001Z',
  ])('includes an automated receipt exactly at its %s review cutoff', async instant => {
    const receivedAt = new Date(instant)
    const { noticeId } = await automatedPendingRequest(receivedAt)
    const cutoffAt = receivedAt.getTime() + HOUR_MS
    const read = (delta: number) =>
      readCopyrightReviewTargetBreaches({
        now: new Date(cutoffAt + delta),
        reviewTargetMinutes: 60,
        noticeIds: [noticeId],
      })

    expect((await read(-1)).waitingPastTarget).toEqual({ count: 0, noticeIds: [] })
    expect((await read(0)).waitingPastTarget).toEqual({ count: 1, noticeIds: [noticeId] })
    expect((await read(1)).waitingPastTarget).toEqual({ count: 1, noticeIds: [noticeId] })
  })

  it('uses the generated assessment creation instant for the staff cutoff', async () => {
    const { notice } = await oldForm()
    const staff = await createTestCopyrightStaff()
    const noticeId = notice.intake.copyright_notice_id
    const submissionId = notice.intake.copyright_notice_submission_id
    await insertReviewedCopyrightFormIntake({ noticeId, reviewerUserId: staff.id })
    await appendCopyrightSubmissionAssessment({
      submissionId,
      currentUser: staff,
      assessedAt: new Date(Date.now() - 2 * HOUR_MS),
      substantiallyCompliant: true,
    })
    const createdAt = await readTestCopyrightAssessmentCreatedAt(submissionId)
    const cutoffAt = createdAt.getTime() + HOUR_MS
    const read = (delta: number) =>
      readCopyrightReviewTargetBreaches({
        now: new Date(cutoffAt + delta),
        reviewTargetMinutes: 60,
        noticeIds: [noticeId],
      })

    expect((await read(-1)).waitingPastTarget).toEqual({ count: 0, noticeIds: [] })
    expect((await read(0)).waitingPastTarget).toEqual({ count: 1, noticeIds: [noticeId] })
    expect((await read(1)).waitingPastTarget).toEqual({ count: 1, noticeIds: [noticeId] })
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
    const createdAt = await readTestCopyrightAssessmentCreatedAt(
      notice.intake.copyright_notice_submission_id,
    )
    const read = (now: Date) =>
      readCopyrightReviewTargetBreaches({ now, reviewTargetMinutes: 60, noticeIds: [noticeId] })
    expect((await read(createdAt)).waitingPastTarget).toEqual({ count: 0, noticeIds: [] })
    expect((await read(new Date(createdAt.getTime() + 2 * HOUR_MS))).waitingPastTarget).toEqual({
      count: 1,
      noticeIds: [noticeId],
    })
  })
  it('still pages an unassessed filing and an automated request in the same read', async () => {
    const { noticeId: automated } = await automatedPendingRequest()
    const filing = await createCopyrightNoticeSchemaFixture()
    await confirmCopyrightRestrictionReview(filing)
    await insertUnreviewedCopyrightSubmission({
      noticeId: filing.noticeId,
      kind: 'court_or_ccb_hold',
      receivedAt: oldReceipt,
    })
    const read = await readCopyrightReviewTargetBreaches({
      now: new Date(oldReceipt.getTime() + 3 * HOUR_MS),
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
