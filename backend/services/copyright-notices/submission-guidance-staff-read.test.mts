import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { readTestCopyrightStaffCase } from '@voucha/test-helpers/services/copyright-notices/staff-case'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import {
  COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS,
  COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA,
  type CopyrightCounterNoticeGuidance,
  type CopyrightLegalHoldGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'
import {
  appendCopyrightGuestFiling,
  createCopyrightCounterNotice,
  issueCopyrightGuestCapability,
  reviewCopyrightCounterNotice,
} from './index.mts'
import { applyNonSpamSignedInCopyrightFormScreening } from './form-screenings.mts'
import { appendCopyrightSubmissionGuidance } from './submission-guidance.mts'
import { eraseTestCopyrightSubmissionGuidanceForNotice } from '@voucha/test-helpers/copyright-submission-guidance-staff-read'

describe('copyright submission guidance in the staff case projection', () => {
  useAutomaticProvisionalWithholding()

  it('projects the latest parsed counter and hold guidance, returns null after erasure, and hides reviewed counters', async () => {
    const poster = await createTestUser()
    const { notice: form } = await createClearScreenedForm(1, { poster })
    await applyNonSpamSignedInCopyrightFormScreening(form.intake.copyright_notice_submission_id)
    const aggregate = await getCopyrightNoticePrivateAggregate(form.intake.copyright_notice_id)
    const target = aggregate?.targets[0]
    if (!aggregate || !target) throw new Error('Screened notice fixture is incomplete')
    const moderator = await createTestUser({ extraRoles: ['moderator'] })

    const counter = await createCopyrightCounterNotice(
      poster,
      aggregate.notice.id,
      crypto.randomUUID(),
      {
        name: 'Poster',
        address: '1 Main Street',
        telephone: '555-0100',
        consentToFederalJurisdiction: true,
        consentToServiceOfProcess: true,
        goodFaithMisidentificationUnderPenaltyOfPerjury: true,
        electronicSignature: 'Poster',
        targetIds: [target.id],
      },
    )
    const counterGuidance: CopyrightCounterNoticeGuidance = {
      summary: 'Earlier counter-notice summary.',
      elements: COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS.map(element => ({
        element,
        status: 'present' as const,
        gap: null,
      })),
      risk_notes: [],
    }
    const latestCounterGuidance: CopyrightCounterNoticeGuidance = {
      ...counterGuidance,
      summary: 'Latest counter-notice summary.',
    }
    await appendCopyrightSubmissionGuidance({
      submissionId: counter.submission.id,
      inputSha256: Buffer.alloc(32, 31),
      promptVersion: 'test-copyright-submission-guidance-v1',
      model: 'test-model',
      guidance: counterGuidance,
    })
    await appendCopyrightSubmissionGuidance({
      submissionId: counter.submission.id,
      inputSha256: Buffer.alloc(32, 32),
      promptVersion: 'test-copyright-submission-guidance-v1',
      model: 'test-model',
      guidance: latestCounterGuidance,
    })

    const staff = await createTestCopyrightStaff()
    const now = new Date()
    const capability = await issueCopyrightGuestCapability({
      currentUser: staff,
      noticeId: aggregate.notice.id,
      expiresAt: new Date(now.getTime() + 60_000),
    })
    const hold = await appendCopyrightGuestFiling({
      noticeId: aggregate.notice.id,
      token: capability.token,
      now,
      kind: 'court_or_ccb_hold',
      statement: 'A court proceeding concerns the hosted image.',
    })
    const holdGuidance: CopyrightLegalHoldGuidance = {
      summary: 'The hold filing identifies the proceeding.',
      criteria: COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA.map(criterion => ({
        criterion,
        status: 'present' as const,
        gap: null,
      })),
      risk_notes: [],
    }
    await appendCopyrightSubmissionGuidance({
      submissionId: hold.id,
      inputSha256: Buffer.alloc(32, 33),
      promptVersion: 'test-copyright-submission-guidance-v1',
      model: 'test-model',
      guidance: holdGuidance,
    })

    const projected = await readTestCopyrightStaffCase(aggregate.notice.id)
    expect(projected?.counter_notices).toEqual([
      expect.objectContaining({
        submission_id: counter.submission.id,
        guidance: latestCounterGuidance,
      }),
    ])
    expect(projected?.legal_holds).toEqual([
      expect.objectContaining({ submission_id: hold.id, guidance: holdGuidance }),
    ])

    await eraseTestCopyrightSubmissionGuidanceForNotice(aggregate.notice.id)
    const erased = await readTestCopyrightStaffCase(aggregate.notice.id)
    expect(erased?.counter_notices).toEqual([
      expect.objectContaining({ submission_id: counter.submission.id, guidance: null }),
    ])
    expect(erased?.legal_holds).toEqual([
      expect.objectContaining({ submission_id: hold.id, guidance: null }),
    ])

    await reviewCopyrightCounterNotice({
      submissionId: counter.submission.id,
      currentUser: moderator,
      is_accepted: false,
      rationale: 'The declarations need staff review.',
    })
    const reviewed = await readTestCopyrightStaffCase(aggregate.notice.id)
    expect(reviewed?.counter_notices).toEqual([])
    expect(reviewed?.legal_holds).toEqual([
      expect.objectContaining({ submission_id: hold.id, guidance: null }),
    ])
  })
})
