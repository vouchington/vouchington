import { describe, expect, it } from 'vitest'
import { writeLateCopyrightEmailAfterRetentionMarker } from '@voucha/test-helpers/copyright-retention-late-email-lock'
import { COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA } from '@ts-shared/utils/copyright-submission-guidance'
import {
  readCopyrightRetentionColumns,
  readCopyrightRetentionMarker,
} from '@voucha/test-helpers/data-stores/psql/copyright-retention'
import { useCopyrightRetentionConfig } from '@voucha/test-helpers/services/copyright-notices/retention-config'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { createCopyrightEmailIntake } from './email-intakes.mts'
import { appendCopyrightEmailIntakeRecommendation } from './email-recommendations.mts'
import { linkCopyrightEmailIntakeToNotice } from './email-threading.mts'
import { rejectCopyrightEmailCorrespondence } from './email-correspondence-admission.mts'
import { appendCopyrightNoticeSubmission } from './submission-appending.mts'
import { appendCopyrightSubmissionGuidance } from './submission-guidance.mts'
import { appendCopyrightLegalHoldAssessment } from './holds.mts'
import { sweepCopyrightEvidenceRetention } from './index.mts'

const DAY_MS = 24 * 60 * 60 * 1000
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS)

describe('copyright retention and late agent writes', () => {
  const bucket = useFakeCopyrightEvidenceBucket()
  const configure = useCopyrightRetentionConfig()

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

  const nothing = { erased: 0, ineligible: 0, failed: [] }

  it('keeps a pending thread reply and restarts the clock from its receipt after review', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const entry = await createRetentionMinimalCase({ artifacts: 1 })
    const watched = await watch(entry.noticeId, entry.evidenceKeys[0]!)
    const sesMessageId = `retention-thread-${crypto.randomUUID()}`
    const rawStorageKey = `email/${sesMessageId}/original.eml`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: daysFromNow(390),
      rawStorageKey,
      rawSha256: Buffer.alloc(32, 7),
      rawMimeType: 'message/rfc822',
      rawByteSize: 12,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    bucket.put(rawStorageKey)
    expect(
      await linkCopyrightEmailIntakeToNotice({
        intakeId: intake.id,
        noticeId: entry.noticeId,
        linkKind: 'thread',
      }),
    ).toBe(true)

    await expect(
      sweepCopyrightEvidenceRetention({ now: daysFromNow(400), noticeIds: [entry.noticeId] }),
    ).resolves.toEqual(nothing)
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
    await expect(
      sweepCopyrightEvidenceRetention({ now: daysFromNow(400), noticeIds: [entry.noticeId] }),
    ).resolves.toEqual(nothing)
    await watched.expectUntouched()

    await expect(
      sweepCopyrightEvidenceRetention({ now: daysFromNow(430), noticeIds: [entry.noticeId] }),
    ).resolves.toEqual({ erased: 1, ineligible: 0, failed: [] })
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
    ).resolves.toBe(false)
    const retained = await readCopyrightRetentionColumns(entry.noticeId)
    expect(retained.copyright_notice_email_intake_recommendations).toEqual([])
  })

  it('does not retain guidance written after the parent case was erased', async () => {
    await configure({ evidenceRetentionDeletion: true, evidenceRetentionDays: 30 })
    const entry = await createRetentionMinimalCase({ artifacts: 1 })
    const watched = await watch(entry.noticeId, entry.evidenceKeys[0]!)
    const submission = await appendCopyrightNoticeSubmission({
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
    await expect(
      sweepCopyrightEvidenceRetention({ now: daysFromNow(400), noticeIds: [entry.noticeId] }),
    ).resolves.toEqual({ erased: 1, ineligible: 0, failed: [] })
    await watched.expectErased()

    await appendCopyrightSubmissionGuidance({
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
    })
    const retained = await readCopyrightRetentionColumns(entry.noticeId)
    expect(retained.copyright_notice_submission_guidance).toEqual([])
  })

  it('fences a linked email result waiting behind the notice erasure lock', async () => {
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
    expect(
      await linkCopyrightEmailIntakeToNotice({
        intakeId: intake.id,
        noticeId: entry.noticeId,
        linkKind: 'thread',
      }),
    ).toBe(true)
    await expect(
      writeLateCopyrightEmailAfterRetentionMarker(entry.noticeId, {
        intakeId: intake.id,
        inputSha256: Buffer.alloc(32, 5),
        promptVersion: 'test-email-lock-v1',
        model: 'test-model',
        structuredOutput: { summary: 'Waiting output' },
      }),
    ).resolves.toBe(false)
    const retained = await readCopyrightRetentionColumns(entry.noticeId)
    expect(retained.copyright_notice_email_intake_recommendations).toEqual([])
  })
})
