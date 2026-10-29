import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { seedCopyrightFormScreeningAttemptPair } from '@voucha/test-helpers/copyright-operational-retention'
import { createTestCopyrightFormIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import {
  initialCopyrightThreadScreeningCursor,
  readTestCopyrightThreadScreeningPage,
} from '@voucha/test-helpers/copyright-thread-screening-retention'
import {
  createClearScreenedForm,
  createSignedInCopyrightForm,
} from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'

describe('bounded copyright thread form-screening blocker proof', () => {
  it('pages current screening authority and blocks when the latest attempt fails', async () => {
    const { notice, screeningId } = await createClearScreenedForm()
    await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })
    const noticeId = notice.intake.copyright_notice_id
    const initial = initialCopyrightThreadScreeningCursor()
    const intakePage = await readTestCopyrightThreadScreeningPage(noticeId, initial)
    expect(intakePage).toMatchObject({ phase: 'form_assessments', blocked: false })
    const assessmentPage = await readTestCopyrightThreadScreeningPage(noticeId, intakePage)
    expect(assessmentPage).toMatchObject({ phase: 'form_screening_targets', blocked: false })
    const targetPage = await readTestCopyrightThreadScreeningPage(noticeId, assessmentPage)
    expect(targetPage).toMatchObject({ phase: 'form_screening_receipts', blocked: false })
    const receiptPage = await readTestCopyrightThreadScreeningPage(noticeId, targetPage)
    expect(receiptPage).toMatchObject({ phase: 'territorial_receipts', blocked: false })

    await seedCopyrightFormScreeningAttemptPair(notice.intake.id)
    const afterFailure = await readTestCopyrightThreadScreeningPage(noticeId, initial)
    const firstAssessment = await readTestCopyrightThreadScreeningPage(noticeId, afterFailure)
    expect(firstAssessment).toMatchObject({ phase: 'form_assessments', blocked: false })
    await expect(
      readTestCopyrightThreadScreeningPage(noticeId, firstAssessment),
    ).resolves.toMatchObject({
      phase: 'form_assessments',
      blocked: true,
    })
  })

  it('does not hold a form intake after staff rejected it', async () => {
    const [{ intake }, moderator] = await Promise.all([
      createSignedInCopyrightForm(),
      createTestUser(),
    ])
    await createTestCopyrightFormIntakeReview({
      intakeId: intake.id,
      moderatorId: moderator.id,
      is_accepted: false,
    })
    await expect(
      readTestCopyrightThreadScreeningPage(
        intake.copyright_notice_id,
        initialCopyrightThreadScreeningCursor(),
      ),
    ).resolves.toMatchObject({ phase: 'territorial_receipts', blocked: false })
  })
})
