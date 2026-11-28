import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { countCopyrightActiveRestrictionsForNotice } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { appendTestReplacementClearCopyrightScreening } from '@voucha/test-helpers/data-stores/psql/copyright-screening-executions'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'

describe('applyNonSpamSignedInCopyrightFormScreening existing-assessment predicates', () => {
  useAutomaticProvisionalWithholding()

  it('leaves a compliant staff assessment intact without appending or enforcing an automated one', async () => {
    const [{ notice }, moderator] = await Promise.all([
      createClearScreenedForm(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const staffAssessment = await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: moderator,
      substantiallyCompliant: true,
    })

    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)

    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(aggregate?.assessments).toHaveLength(1)
    expect(aggregate?.assessments[0]).toMatchObject({
      id: staffAssessment.id,
      assessed_by_id: moderator.id,
      copyright_notice_form_screening_id: null,
      is_substantially_compliant: true,
    })
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(0)
  })

  it('leaves a non-compliant automated assessment for the same screening intact', async () => {
    const { notice, screeningId } = await createClearScreenedForm()
    const nonCompliant = await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: false,
      copyrightFormScreeningId: screeningId,
    })

    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)

    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(aggregate?.assessments).toHaveLength(1)
    expect(aggregate?.assessments[0]).toMatchObject({
      id: nonCompliant.id,
      assessed_by_id: null,
      copyright_notice_form_screening_id: screeningId,
      is_substantially_compliant: false,
    })
    await expect(
      countCopyrightActiveRestrictionsForNotice(notice.intake.copyright_notice_id),
    ).resolves.toBe(0)
  })

  it('supersedes a prior automated compliant assessment when the current screening differs', async () => {
    const { notice, screeningId: firstScreeningId } = await createClearScreenedForm()
    const priorAssessment = await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: firstScreeningId,
    })
    const secondScreeningId = await appendTestReplacementClearCopyrightScreening({
      intakeId: notice.intake.id,
      guidance: testCopyrightFormGuidance,
    })

    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)

    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(aggregate?.assessments).toHaveLength(2)
    expect(aggregate?.assessments[0]?.id).toBe(priorAssessment.id)
    const replacement = aggregate?.assessments[1]
    expect(replacement).toMatchObject({
      assessed_by_id: null,
      copyright_notice_form_screening_id: secondScreeningId,
      is_substantially_compliant: true,
      supersedes_assessment_id: priorAssessment.id,
    })
    expect(aggregate?.restrictions).toEqual([
      expect.objectContaining({
        authorizing_assessment_id: replacement?.id,
        lifted_at: null,
      }),
    ])
  })

  it('reuses and enforces an existing automated compliant assessment for the matching screening', async () => {
    const { notice, screeningId } = await createClearScreenedForm()
    const existing = await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })

    await applyNonSpamSignedInCopyrightFormScreening(notice.intake.copyright_notice_submission_id)

    const aggregate = await getCopyrightNoticePrivateAggregate(notice.intake.copyright_notice_id)
    expect(aggregate?.assessments).toHaveLength(1)
    expect(aggregate?.assessments[0]).toMatchObject({
      id: existing.id,
      assessed_by_id: null,
      copyright_notice_form_screening_id: screeningId,
      is_substantially_compliant: true,
    })
    expect(aggregate?.restrictions).toEqual([
      expect.objectContaining({
        authorizing_assessment_id: existing.id,
        lifted_at: null,
      }),
    ])
  })
})
