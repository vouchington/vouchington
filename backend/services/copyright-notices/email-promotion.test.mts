import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { readCopyrightEmailIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  getCopyrightNoticePrivateAggregate,
  markCopyrightEmailIntakeResponseBouncedBySesMessageId,
  markCopyrightEmailIntakeResponseFailed,
  markCopyrightEmailIntakeResponseSent,
  prepareCopyrightEmailIntakeResponseDelivery,
  promoteCopyrightEmailIntake,
  rejectCopyrightEmailIntake,
} from './index.mts'
import { createParsedCopyrightEmailIntake } from './email-intake-test-fixtures.mts'

describe('copyright email promotion', () => {
  it('requires a moderator to promote an email intake before imposing its restrictions', async () => {
    const [poster, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `Copyright email approval ${crypto.randomUUID()}`,
      slug: `copyright-email-approval-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'Hosted copyright target.',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const intake = await createParsedCopyrightEmailIntake()
    const approved = await promoteCopyrightEmailIntake({
      currentUser: moderator,
      intakeId: intake.id,
      recommendationId: null,
      manualFallbackReason: 'The extraction agent was unavailable.',
      jurisdiction: 'us_dmca',
      claimantDisplayName: 'Claimant',
      claimantContact: 'claimant@example.test',
      claimantEmail: 'claimant@example.test',
      workDescription: 'Original photograph',
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Claimant',
      targets: [
        {
          placementKey: `post-image:${postId}:${imageId}`,
          placementRevision: 1,
          imageId,
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
      rationale: 'The email contains the statutory notice statements.',
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(approved.noticeId)
    expect(aggregate?.submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: approved.submissionId, source_kind: 'email' }),
      ]),
    )
    expect(aggregate?.restrictions).toEqual(
      expect.arrayContaining([expect.objectContaining({ imposed_by_id: moderator.id })]),
    )
    await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([
      { accepted: true, promoted_copyright_notice_id: approved.noticeId },
    ])
    await expect(
      promoteCopyrightEmailIntake({
        currentUser: moderator,
        intakeId: intake.id,
        recommendationId: null,
        manualFallbackReason: 'The extraction agent was unavailable.',
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Claimant',
        claimantContact: 'claimant@example.test',
        claimantEmail: 'claimant@example.test',
        workDescription: 'Original photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        targets: [
          {
            placementKey: `post-image:${postId}:${imageId}`,
            placementRevision: 1,
            imageId,
            hostedUseUrl: `https://voucha.ai/posts/${postId}`,
          },
        ],
        rationale: 'The prior moderator decision may be safely replayed.',
      }),
    ).resolves.toEqual(approved)
  })

  it('sends and records a bounced staff response to a rejected email', async () => {
    const responseId = await rejectParsedIntakeWithResponse({
      responseKind: 'needs_information',
      responseMessage: 'Please identify the work and the hosted material.',
    })
    const first = await prepareCopyrightEmailIntakeResponseDelivery(responseId)
    expect(first.subject).toContain('More information')
    expect(first.text).toContain('Please identify the work')
    const outboundMessageId = `ses-outbound-${crypto.randomUUID()}`
    expect(
      await markCopyrightEmailIntakeResponseSent({ responseId, sesMessageId: outboundMessageId }),
    ).toBe(true)
    expect(await markCopyrightEmailIntakeResponseBouncedBySesMessageId(outboundMessageId)).toBe(
      true,
    )
  })

  it('records a retryable failure only after claiming an email response', async () => {
    const responseId = await rejectParsedIntakeWithResponse({
      responseKind: 'rejected',
      responseMessage: null,
    })
    await prepareCopyrightEmailIntakeResponseDelivery(responseId)
    await expect(
      markCopyrightEmailIntakeResponseFailed({
        responseId,
        error: 'The email provider timed out.',
      }),
    ).resolves.toBe(true)
    await expect(
      markCopyrightEmailIntakeResponseSent({
        responseId,
        sesMessageId: `ses-should-not-send-${crypto.randomUUID()}`,
      }),
    ).resolves.toBe(false)
  })

  it('rejects a recommendation that does not belong to the intake', async () => {
    const [poster, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `Copyright rec scope ${crypto.randomUUID()}`,
      slug: `copyright-rec-scope-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'Hosted copyright target.',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const intake = await createParsedCopyrightEmailIntake()
    const foreignRecommendationId = '00000000-0000-7000-8000-000000000099'
    await expect(
      promoteCopyrightEmailIntake({
        currentUser: moderator,
        intakeId: intake.id,
        recommendationId: foreignRecommendationId,
        manualFallbackReason: null,
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Claimant',
        claimantContact: 'claimant@example.test',
        claimantEmail: 'claimant@example.test',
        workDescription: 'Original photograph',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Claimant',
        targets: [
          {
            placementKey: `post-image:${postId}:${imageId}`,
            placementRevision: 1,
            imageId,
            hostedUseUrl: `https://voucha.ai/posts/${postId}`,
          },
        ],
        rationale: 'The recommendation belongs to a different intake.',
      }),
    ).rejects.toMatchObject({ status: 422 })
    await expect(
      rejectCopyrightEmailIntake({
        currentUser: moderator,
        intakeId: intake.id,
        recommendationId: foreignRecommendationId,
        manualFallbackReason: null,
        rationale: 'The recommendation belongs to a different intake.',
        responseKind: 'rejected',
        responseMessage: null,
      }),
    ).rejects.toMatchObject({ status: 422 })
  })
})

async function rejectParsedIntakeWithResponse(
  response: Pick<
    Parameters<typeof rejectCopyrightEmailIntake>[0],
    'responseKind' | 'responseMessage'
  >,
): Promise<string> {
  const moderatorRecord = await createTestUser()
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
  const intake = await createParsedCopyrightEmailIntake()
  const { responseId } = await rejectCopyrightEmailIntake({
    currentUser: moderator,
    intakeId: intake.id,
    recommendationId: null,
    manualFallbackReason: 'The extraction agent was unavailable.',
    rationale: 'The message lacks the required declarations.',
    ...response,
  })
  if (!responseId) throw new Error('response was not created')
  return responseId
}
