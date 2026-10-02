import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  readCopyrightEmailIntakeResponses,
  readCopyrightEmailIntakeReviewRecord,
} from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { createParsedCopyrightEmailIntake } from './email-intake-test-fixtures.mts'
import {
  promoteCopyrightEmailIntake,
  recordCopyrightEmailIntakeLegalProcess,
  rejectCopyrightEmailIntake,
} from './index.mts'

async function createModerator() {
  const record = await createTestUser()
  return { ...record, roles: ['moderator'] } as typeof record
}

async function approvalInput(moderator: Awaited<ReturnType<typeof createModerator>>, id: string) {
  const poster = await createTestUser()
  const postId = await insertTestPost({
    title: `Legal process approval ${crypto.randomUUID()}`,
    slug: `legal-process-approval-${crypto.randomUUID()}`,
    createdById: poster.id,
    markdown: 'Hosted copyright target.',
  })
  const imageId = await insertTestImage(poster.id)
  const placementId = await insertTestPostImage({ postId, imageId })
  return {
    currentUser: moderator,
    intakeId: id,
    recommendationId: null,
    manualFallbackReason: 'The extraction agent was unavailable.',
    jurisdiction: 'us_dmca' as const,
    claimantDisplayName: 'Claimant',
    claimantContact: 'claimant@example.test',
    claimantEmail: 'claimant@example.test',
    workDescription: 'Original photograph',
    goodFaithBelief: true as const,
    accuracyAuthorityUnderPenaltyOfPerjury: true as const,
    electronicSignature: 'Claimant',
    targets: [
      {
        placementId,
        placementRevision: 1,
        imageId,
        hostedUseUrl: `https://voucha.ai/posts/${postId}`,
      },
    ],
    rationale: 'The email contains the statutory notice statements.',
  }
}

describe('a copyright email intake recorded as legal process', () => {
  it('cannot be rejected, and no reply is queued', async () => {
    const moderator = await createModerator()
    const intake = await createParsedCopyrightEmailIntake()
    await recordCopyrightEmailIntakeLegalProcess({
      currentUser: moderator,
      intakeId: intake.id,
      reason: 'Subpoena for subscriber records.',
    })

    for (const decision of [
      { responseKind: 'rejected', responseMessage: null },
      { responseKind: 'needs_information', responseMessage: 'Please send more detail.' },
    ] as const) {
      await expect(
        rejectCopyrightEmailIntake({
          currentUser: moderator,
          intakeId: intake.id,
          recommendationId: null,
          manualFallbackReason: 'No agent output.',
          rationale: 'Not a copyright notice.',
          ...decision,
        }),
      ).rejects.toMatchObject({ status: 409 })
    }

    await expect(readCopyrightEmailIntakeResponses(intake.id)).resolves.toEqual([])
    await expect(readCopyrightEmailIntakeReviewRecord(intake.id)).resolves.toMatchObject([
      { decision: 'legal_process' },
    ])
  })

  it('cannot be approved, and no case is opened', async () => {
    const moderator = await createModerator()
    const intake = await createParsedCopyrightEmailIntake()
    await recordCopyrightEmailIntakeLegalProcess({
      currentUser: moderator,
      intakeId: intake.id,
      reason: 'Subpoena for subscriber records.',
    })

    await expect(
      promoteCopyrightEmailIntake(await approvalInput(moderator, intake.id)),
    ).rejects.toMatchObject({ status: 409 })

    await expect(readCopyrightEmailIntakeReviewRecord(intake.id)).resolves.toMatchObject([
      { decision: 'legal_process', promoted_copyright_notice_id: null },
    ])
  })

  it('cannot be recorded after an approval', async () => {
    const moderator = await createModerator()
    const intake = await createParsedCopyrightEmailIntake()
    const approved = await promoteCopyrightEmailIntake(await approvalInput(moderator, intake.id))

    await expect(
      recordCopyrightEmailIntakeLegalProcess({
        currentUser: moderator,
        intakeId: intake.id,
        reason: 'Subpoena.',
      }),
    ).rejects.toMatchObject({ status: 409 })

    await expect(readCopyrightEmailIntakeReviewRecord(intake.id)).resolves.toMatchObject([
      { decision: 'approved', promoted_copyright_notice_id: approved.noticeId },
    ])
  })
})
