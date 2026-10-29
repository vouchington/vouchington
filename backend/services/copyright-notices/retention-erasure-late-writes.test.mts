import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { describe, expect, it } from 'vitest'
import { insertCopyrightRetentionIntakeReview } from '@voucha/test-helpers/copyright-retention-intake-review'
import { COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA } from '@ts-shared/utils/copyright-submission-guidance'
import {
  readCopyrightRetentionColumns,
  readCopyrightRetentionMarker,
} from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import {
  advanceCopyrightRetentionWorkPages,
  useCopyrightRetentionWorkClock,
} from '@voucha/test-helpers/copyright-retention-work'
import { createCopyrightEmailIntake } from './email-intakes.mts'
import { recordCopyrightEmailParse } from './email-intake-parses.mts'
import { appendCopyrightEmailIntakeRecommendation } from './email-recommendations.mts'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { rejectCopyrightEmailCorrespondence } from './email-correspondence-admission.mts'

import { appendCopyrightSubmissionGuidance } from './submission-guidance.mts'
import { appendCopyrightLegalHoldAssessment } from './holds.mts'

describe('copyright retention and late agent writes', () => {
  const bucket = useFakeCopyrightEvidenceBucket()
  const setClock = useCopyrightRetentionWorkClock()

  async function watch(noticeId: string, evidenceKey: string) {
    bucket.put(evidenceKey, { versions: 2 })
    const columns = await readCopyrightRetentionColumns(noticeId)
    return {
      noticeId,
      async expectUntouched() {
        expect(bucket.countVersions(evidenceKey)).toBe(2)
        await expect(readCopyrightRetentionMarker(noticeId)).resolves.toBeNull()
      },
      async expectErased() {
        expect(bucket.countVersions(evidenceKey)).toBe(0)
        await expect(readCopyrightRetentionColumns(noticeId)).resolves.not.toEqual(columns)
        await expect(readCopyrightRetentionMarker(noticeId)).resolves.not.toBeNull()
      },
    }
  }

  it('keeps a pending thread reply and restarts the clock from its receipt after review', async () => {
    const entry = await createRetentionMinimalCase({ artifacts: 1 })
    const watched = await watch(entry.noticeId, entry.evidenceKeys[0]!)
    const sesMessageId = `retention-thread-${crypto.randomUUID()}`
    const rawStorageKey = `email/${sesMessageId}/original.eml`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date('2030-01-01T00:00:00.000Z'),
      rawStorageKey,
      rawSha256: Buffer.alloc(32, 7),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    bucket.put(rawStorageKey)
    await recordCopyrightEmailParse(intake, { status: 'failed', error: 'Malformed reply MIME' })
    expect(
      await linkCopyrightEmailIntakeToNotice({
        intakeId: intake.id,
        noticeId: entry.noticeId,
        linkKind: 'thread',
      }),
    ).toBe(true)

    await setClock(new Date('2035-01-01T00:00:00.000Z'))
    expect(await advanceCopyrightRetentionWorkPages(entry.noticeId)).toContain('ineligible')
    await watched.expectUntouched()
    expect(bucket.countVersions(rawStorageKey)).toBe(1)

    await rejectCopyrightEmailCorrespondence({
      currentUser: entry.moderator,
      intakeId: intake.id,
      kind: 'supplement',
      rationale: 'The correspondence does not meet the filing requirements.',
      recommendationId: null,
      manualFallbackReason: 'No recommendation was available.',
    })
    expect(await advanceCopyrightRetentionWorkPages(entry.noticeId)).toContain('ineligible')
    await watched.expectUntouched()

    await setClock(new Date('2042-01-01T00:00:00.000Z'))
    expect(await advanceCopyrightRetentionWorkPages(entry.noticeId)).toContain('erased')
    await watched.expectErased()
    expect(bucket.countVersions(rawStorageKey)).toBe(0)
    await expect(
      appendCopyrightEmailIntakeRecommendation({
        intakeId: intake.id,
        inputSha256: Buffer.alloc(32, 9),
        promptVersion: 'test-late-email-v1',
        model: 'test-model',
        structuredOutput: { summary: 'Late reply output' },
      }),
    ).rejects.toThrow('Copyright encryption owner key is unavailable')
    await watched.expectErased()
    const retained = await readCopyrightRetentionColumns(entry.noticeId)
    expect(retained.copyright_notice_email_intake_recommendations).toEqual([])
  })

  it('restarts the retention clock when an intake-level review resolves a thread reply', async () => {
    const entry = await createRetentionMinimalCase({ artifacts: 1 })
    const watched = await watch(entry.noticeId, entry.evidenceKeys[0]!)
    const sesMessageId = `retention-intake-review-${crypto.randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date('2030-01-01T00:00:00.000Z'),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 6),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    await recordCopyrightEmailParse(intake, { status: 'failed', error: 'Malformed reply MIME' })
    // An initial decision can precede discovery of the parent thread.
    await setClock(new Date('2035-01-01T00:00:00.000Z'))
    await insertCopyrightRetentionIntakeReview({
      intakeId: intake.id,
      sesMessageId,
      reviewerId: entry.moderator.id,
      reviewedAt: new Date('2035-01-01T00:00:00.000Z'),
    })
    expect(
      await linkCopyrightEmailIntakeToNotice({
        intakeId: intake.id,
        noticeId: entry.noticeId,
        linkKind: 'thread',
      }),
    ).toBe(true)

    expect(await advanceCopyrightRetentionWorkPages(entry.noticeId)).toContain('ineligible')
    await watched.expectUntouched()
    await setClock(new Date('2040-01-01T00:00:00.000Z'))
    expect(await advanceCopyrightRetentionWorkPages(entry.noticeId)).toContain('ineligible')
    await watched.expectUntouched()
    await setClock(new Date('2042-01-01T00:00:00.000Z'))
    expect(await advanceCopyrightRetentionWorkPages(entry.noticeId)).toContain('erased')
    await watched.expectErased()
  })

  it('does not retain submission guidance written after completed case erasure', async () => {
    const entry = await createRetentionMinimalCase()
    const submission = await appendTestCopyrightNoticeSubmission({
      noticeId: entry.noticeId,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date(),
      sourceKind: 'signed_in_form',
      submittedByUserId: null,
      bodyCiphertext: `filing-${crypto.randomUUID()}`,
    })
    await setClock(new Date('2028-01-01T00:00:00.000Z'))
    await appendCopyrightLegalHoldAssessment({
      currentUser: entry.moderator,
      submissionId: submission.id,
      assessedAt: new Date(),
      fromOriginalClaimant: false,
      proceedingKind: null,
      ccbClaimKind: null,
      commencedAt: null,
      receivedByDesignatedAgentAt: null,
      sameMaterial: false,
      targetIds: [entry.targetId],
      rationale: 'This filing does not establish a qualifying proceeding or hold.',
    })
    await setClock(new Date('2035-01-01T00:00:00.000Z'))
    expect(await advanceCopyrightRetentionWorkPages(entry.noticeId)).toContain('erased')
    await expect(
      appendCopyrightSubmissionGuidance({
        submissionId: submission.id,
        inputSha256: Buffer.alloc(32, 3),
        promptVersion: 'test-guidance-lock-v1',
        model: 'test-model',
        guidance: {
          summary: 'Guidance waiting while the case is erased.',
          criteria: COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA.map(criterion => ({
            criterion,
            status: 'present' as const,
            gap: null,
          })),
          risk_notes: [],
        },
      }),
    ).rejects.toThrow('Copyright encryption owner key is unavailable')
    const retained = await readCopyrightRetentionColumns(entry.noticeId)
    expect(retained.copyright_notice_submission_guidance).toEqual([])
  })

  it('does not retain guidance written after the parent case was erased', async () => {
    const entry = await createRetentionMinimalCase({ artifacts: 1 })
    const watched = await watch(entry.noticeId, entry.evidenceKeys[0]!)
    const submission = await appendTestCopyrightNoticeSubmission({
      noticeId: entry.noticeId,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date(),
      sourceKind: 'signed_in_form',
      submittedByUserId: null,
      bodyCiphertext: `filing-${crypto.randomUUID()}`,
    })
    await appendCopyrightLegalHoldAssessment({
      currentUser: entry.moderator,
      submissionId: submission.id,
      assessedAt: new Date(),
      fromOriginalClaimant: false,
      proceedingKind: null,
      ccbClaimKind: null,
      commencedAt: null,
      receivedByDesignatedAgentAt: null,
      sameMaterial: false,
      targetIds: [entry.targetId],
      rationale: 'This filing does not establish a hold.',
    })
    await setClock(new Date('2035-01-01T00:00:00.000Z'))
    expect(await advanceCopyrightRetentionWorkPages(entry.noticeId)).toContain('erased')
    await watched.expectErased()

    await expect(
      appendCopyrightSubmissionGuidance({
        submissionId: submission.id,
        inputSha256: Buffer.alloc(32, 8),
        promptVersion: 'test-retention-guidance-v1',
        model: 'test-model',
        guidance: {
          summary: 'Late guidance for a deleted filing.',
          criteria: COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA.map(criterion => ({
            criterion,
            status: 'present' as const,
            gap: null,
          })),
          risk_notes: [],
        },
      }),
    ).rejects.toThrow('Copyright encryption owner key is unavailable')
    const retained = await readCopyrightRetentionColumns(entry.noticeId)
    expect(retained.copyright_notice_submission_guidance).toEqual([])
  })

  it('does not retain a linked email result written after completed case erasure', async () => {
    const entry = await createRetentionMinimalCase()
    const sesMessageId = `retention-wait-${crypto.randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 4),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    await recordCopyrightEmailParse(intake, { status: 'failed', error: 'Malformed reply MIME' })
    expect(
      await linkCopyrightEmailIntakeToNotice({
        intakeId: intake.id,
        noticeId: entry.noticeId,
        linkKind: 'thread',
      }),
    ).toBe(true)
    await rejectCopyrightEmailCorrespondence({
      currentUser: entry.moderator,
      intakeId: intake.id,
      kind: 'supplement',
      rationale: 'The email does not qualify as case correspondence.',
      recommendationId: null,
      manualFallbackReason: 'No recommendation is needed for this rejection.',
    })
    await setClock(new Date('2035-01-01T00:00:00.000Z'))
    expect(await advanceCopyrightRetentionWorkPages(entry.noticeId)).toContain('erased')
    await expect(
      appendCopyrightEmailIntakeRecommendation({
        intakeId: intake.id,
        inputSha256: Buffer.alloc(32, 5),
        promptVersion: 'test-email-lock-v1',
        model: 'test-model',
        structuredOutput: { summary: 'Waiting output' },
      }),
    ).rejects.toThrow('Copyright encryption owner key is unavailable')
    const retained = await readCopyrightRetentionColumns(entry.noticeId)
    expect(retained.copyright_notice_email_intake_recommendations).toEqual([])
  })
})
