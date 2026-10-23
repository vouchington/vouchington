import { describe, expect, it } from 'vitest'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import {
  admitLateCopyrightAppeal,
  advanceUnrelatedAccountClock,
  copyrightCaseExists,
  countMinimalProofCorrespondence,
  markMinimalProofCaseEvidenceErased,
  readMinimalBlockerCursor,
  readMinimalProofFormAuthority,
  resolveQualifiedCourtHold,
  seedMinimalProofCorrespondenceFanout,
  seedQualifiedCourtHold,
  seedTerminalSubmissionPages,
  selectMinimalProofChildPhase,
} from '@voucha/test-helpers/entities/copyright-minimal-blocker-proof'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'
import { purgeCopyrightMinimalRecord } from './retention-minimal-purge-case.mts'
import { COPYRIGHT_MINIMAL_PURGE_PHASES } from './retention-minimal-purge-phases.mts'

describe('bounded copyright minimal blocker proof', () => {
  it('matches the current screened-form authority before deciding enforcement is pending', async () => {
    const { notice, screeningId } = await createClearScreenedForm()
    const noticeId = notice.intake.copyright_notice_id
    const submissionId = notice.intake.copyright_notice_submission_id
    await appendCopyrightSubmissionAssessment({
      submissionId,
      currentUser: null,
      assessedAt: new Date(),
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })
    await markMinimalProofCaseEvidenceErased(noticeId)
    await expect(
      purgeCopyrightMinimalRecord(noticeId, {
        now: new Date('2030-10-23T00:00:00Z'),
        cutoff: new Date('2020-10-23T00:00:00Z'),
        maxBatches: 32,
      }),
    ).resolves.toBe('ineligible')
    expect(await readMinimalProofFormAuthority(submissionId, screeningId, noticeId)).toEqual({
      current_screening: true,
      valid_target_found: true,
      claimant_receipt_found: true,
      compliant_form_assessment_found: true,
    })
  })

  it('keeps a qualified court hold until a resolution changes the legal proof', async () => {
    const fixture = await createRetentionMinimalCase()
    const assessmentId = await seedQualifiedCourtHold(fixture.noticeId, fixture.moderator.id)
    await markMinimalProofCaseEvidenceErased(fixture.noticeId)
    const options = {
      now: new Date('2030-10-23T00:00:00Z'),
      cutoff: new Date('2027-10-23T00:00:00Z'),
      maxBatches: 32,
    }
    await expect(purgeCopyrightMinimalRecord(fixture.noticeId, options)).resolves.toBe('ineligible')
    await resolveQualifiedCourtHold(fixture.noticeId, assessmentId, fixture.moderator.id)
    await expect(purgeCopyrightMinimalRecord(fixture.noticeId, options)).resolves.toBe('purged')
  })

  it('advances more than one submission page across an unrelated account mutation', async () => {
    const fixture = await createRetentionMinimalCase()
    await seedTerminalSubmissionPages(fixture.noticeId)
    await markMinimalProofCaseEvidenceErased(fixture.noticeId)
    const options = {
      now: new Date('2030-10-23T00:00:00Z'),
      cutoff: new Date('2020-10-23T00:00:00Z'),
      pageSize: 10,
      maxBatches: 1,
    }
    await expect(purgeCopyrightMinimalRecord(fixture.noticeId, options)).resolves.toBe('more')
    await expect(purgeCopyrightMinimalRecord(fixture.noticeId, options)).resolves.toBe('more')
    await expect(purgeCopyrightMinimalRecord(fixture.noticeId, options)).resolves.toBe('more')
    const first = await readMinimalBlockerCursor(fixture.noticeId)
    expect(first.blocker_phase_index).toBe(0)
    expect(first.blocker_cursor).toBeTruthy()

    await advanceUnrelatedAccountClock()
    await expect(purgeCopyrightMinimalRecord(fixture.noticeId, options)).resolves.toBe('more')
    const afterUnrelated = await readMinimalBlockerCursor(fixture.noticeId)
    expect(afterUnrelated.blocker_cursor).toBe(first.blocker_cursor)
    await expect(purgeCopyrightMinimalRecord(fixture.noticeId, options)).resolves.toBe('more')
    const second = await readMinimalBlockerCursor(fixture.noticeId)
    expect(second.blocker_cursor).toBeTruthy()
    expect(second.blocker_cursor).not.toBe(first.blocker_cursor)
  })

  it('stops remaining child pages when a new unresolved appeal changes the case proof', async () => {
    const fixture = await createRetentionMinimalCase()
    await seedMinimalProofCorrespondenceFanout(fixture.noticeId)
    await markMinimalProofCaseEvidenceErased(fixture.noticeId)
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, {
        now: new Date('2030-10-23T00:00:00Z'),
        cutoff: new Date('2020-10-23T00:00:00Z'),
        maxBatches: 16,
      }),
    ).resolves.toBe('ineligible')
    const correspondencePhase = COPYRIGHT_MINIMAL_PURGE_PHASES.findIndex(
      phase => phase.table === 'copyright_notice_correspondence_messages',
    )
    expect(correspondencePhase).toBeGreaterThan(0)
    await selectMinimalProofChildPhase(fixture.noticeId, correspondencePhase)
    const options = {
      now: new Date('2030-10-23T00:00:00Z'),
      cutoff: new Date('2027-10-23T00:00:00Z'),
      pageSize: 10,
      maxBatches: 1,
    }
    await expect(purgeCopyrightMinimalRecord(fixture.noticeId, options)).resolves.toBe('more')
    await admitLateCopyrightAppeal(fixture.noticeId)
    await expect(purgeCopyrightMinimalRecord(fixture.noticeId, options)).resolves.toBe('more')
    expect(await countMinimalProofCorrespondence(fixture.noticeId)).toBe(45)
    await expect(
      purgeCopyrightMinimalRecord(fixture.noticeId, { ...options, maxBatches: 32 }),
    ).resolves.toBe('ineligible')
    expect(await copyrightCaseExists(fixture.noticeId)).toBe(true)
  })
})
