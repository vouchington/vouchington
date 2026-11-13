import { assertServiceCounterReview } from '@voucha/test-helpers/copyright-service-counter-review-outcome'
import { seedRestorationCounterApproval } from '@voucha/test-helpers/copyright-restoration-counter-approval-fixture'
import {
  assertServiceAppealReview,
  assertServiceIncompleteAppeal,
} from '@voucha/test-helpers/copyright-service-appeal-outcome'
import { seedEffectiveAppealDecision } from '@voucha/test-helpers/copyright-effective-review-decisions'
import { seedServiceReviewRestriction } from '@voucha/test-helpers/copyright-service-review-prerequisites'
import { seedServiceReviewAppeal } from '@voucha/test-helpers/copyright-service-appeal-prerequisite'
import { seedRestorationCounterNotice } from '@voucha/test-helpers/copyright-restoration-counter-notice-fixture'
import { seedCompletedTestCopyrightFormScreening } from '@voucha/test-helpers/copyright-form-screenings'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
  removeTestPostImage,
} from '@voucha/test-helpers'
import {
  readCopyrightNoticeTargetId,
  readCopyrightNoticeTargetIds,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  copyrightAppealRecommendations,
  createCopyrightFormIntake,
  getCopyrightParticipantNoticeDetail,
  prepareCopyrightEmailDelivery,
} from './index.mts'
import { useAutomaticProvisionalWithholding } from '@voucha/test-helpers/services/copyright-notices/automatic-withholding'
import { testCopyrightFormGuidance } from '@voucha/test-helpers/services/copyright-notices/form-guidance'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

async function createRestrictedFixture(targetCount = 1, detachBeforeScreening = false) {
  const [poster, claimant, moderatorRecord] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser(),
  ])
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
  const postId = await insertTestPost({
    title: `copyright review ${crypto.randomUUID()}`,
    slug: `copyright-review-${crypto.randomUUID()}`,
    createdById: poster.id,
    markdown: 'image',
  })
  const imageIds = await Promise.all(
    Array.from({ length: targetCount }, () => insertTestImage(poster.id)),
  )
  await Promise.all(imageIds.map(imageId => insertTestPostImage({ postId, imageId })))
  const intake = await createCopyrightFormIntake({
    currentUser: claimant,
    requesterIdentity: `user:${claimant.id}`,
    idempotencyKey: crypto.randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: 'Claimant',
      claimantContact: 'claimant@example.test',
      claimantEmail: 'claimant@example.test',
      workDescription: 'Claimed photograph',
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: 'Claimant',
      claimantTargets: imageIds.map(imageId => ({
        surfaceKind: 'post-image' as const,
        postId,
        imageId,
        hostedUseUrl: `https://voucha.ai/posts/${postId}`,
      })),
    },
  })
  const screeningId = await seedCompletedTestCopyrightFormScreening({
    intakeId: intake.intake.id,
    inputSha256: Buffer.alloc(32, 4),
    recommendation: 'not_obviously_invalid',
    rationale: 'No obvious spam or invalidity.',
    guidance: testCopyrightFormGuidance,
    promptVersion: 'copyright-form-screening-v2',
    model: 'test-model',
  })
  if (detachBeforeScreening) {
    for (const imageId of imageIds) {
      await removeTestPostImage(postId, imageId)
    }
  }
  await seedServiceReviewRestriction(intake, moderator, screeningId)
  const aggregate = await getCopyrightNoticePrivateAggregate(intake.intake.copyright_notice_id)
  if (!aggregate?.restrictions[0]) throw new Error('fixture restriction missing')
  return {
    poster,
    moderator,
    noticeId: intake.intake.copyright_notice_id,
    targetId: await readCopyrightNoticeTargetId(intake.intake.copyright_notice_id),
    targetIds: await readCopyrightNoticeTargetIds(intake.intake.copyright_notice_id),
    restrictionId: aggregate.restrictions[0].id,
    restrictionIds: aggregate.restrictions.map(restriction => restriction.id),
  }
}

describe('copyright submission moderator reviews', () => {
  useAutomaticProvisionalWithholding()

  it('keeps the immutable placement owner authorized and notified after the image is detached', async () => {
    const fixture = await createRestrictedFixture(1, true)
    const participant = await getCopyrightParticipantNoticeDetail(fixture.noticeId, fixture.poster)
    const aggregate = await getCopyrightNoticePrivateAggregate(fixture.noticeId)

    expect(participant).toMatchObject({
      viewer_role: 'poster',
      respondable_target_ids: [fixture.targetId],
    })
    expect(aggregate?.deliveryIntents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipient_user_id: fixture.poster.id,
          recipient_role: 'poster',
          delivery_kind: 'poster_restriction_notice',
        }),
      ]),
    )
  })

  it('loads a signed-in appeal from its submission-bound encrypted payload', async () => {
    const fixture = await createRestrictedFixture()
    const appeal = await seedServiceReviewAppeal(
      fixture.poster,
      fixture.noticeId,
      crypto.randomUUID(),
      { reason: 'I created this image.', targetIds: [fixture.targetId] },
    )

    await expect(copyrightAppealRecommendations.get(appeal.submission.id)).resolves.toMatchObject({
      appeal: { reason: 'I created this image.', targetIds: [fixture.targetId] },
      notice: { workDescription: 'Claimed photograph', restrictedTargetCount: 1 },
    })
  })

  it('records advisory provenance and reverses an appealed restriction only by moderator action', async () => {
    expect.hasAssertions()
    const fixture = await createRestrictedFixture()
    const appeal = await seedServiceReviewAppeal(
      fixture.poster,
      fixture.noticeId,
      crypto.randomUUID(),
      { reason: 'I created this image.', targetIds: [fixture.targetId] },
    )
    await copyrightAppealRecommendations.append({
      submissionId: appeal.submission.id,
      inputSha256: Buffer.alloc(32, 8),
      promptVersion: 'copyright-appeal-v1',
      model: 'test-model',
      recommendation: 'reverse',
      rationale: 'The appeal warrants human review.',
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(fixture.noticeId)
    const recommendation = aggregate?.appealRecommendations[0]
    if (!recommendation) throw new Error('fixture recommendation missing')

    const input = {
      submissionId: appeal.submission.id,
      currentUser: fixture.moderator,
      recommendationId: recommendation.id,
      manualFallbackReason: null,
      rationale: 'The supplied record supports reversal.',
      decisions: [{ restrictionId: fixture.restrictionId, action: 'reverse' as const }],
    }
    await assertServiceAppealReview(input, fixture)
  })

  it('replays a committed appeal with its advisory provenance and no extra effects', async () => {
    expect.hasAssertions()
    const fixture = await createRestrictedFixture()
    const appeal = await seedServiceReviewAppeal(
      fixture.poster,
      fixture.noticeId,
      crypto.randomUUID(),
      {
        reason: 'I created this image.',
        targetIds: [fixture.targetId],
      },
    )
    await copyrightAppealRecommendations.append({
      submissionId: appeal.submission.id,
      inputSha256: Buffer.alloc(32, 8),
      promptVersion: 'copyright-appeal-v1',
      model: 'test-model',
      recommendation: 'reverse',
      rationale: 'The appeal warrants human review.',
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(fixture.noticeId)
    const input = {
      submissionId: appeal.submission.id,
      currentUser: fixture.moderator,
      recommendationId: aggregate!.appealRecommendations[0]!.id,
      manualFallbackReason: null,
      rationale: 'The same completed review may be safely replayed.',
      decisions: [{ restrictionId: fixture.restrictionId, action: 'reverse' as const }],
    }
    await seedEffectiveAppealDecision(input, fixture.noticeId)
    await assertServiceAppealReview(input, fixture, { replay: true })
  })

  it('requires one decision for every active restriction named by an appeal', async () => {
    const fixture = await createRestrictedFixture(2)
    const appeal = await seedServiceReviewAppeal(
      fixture.poster,
      fixture.noticeId,
      crypto.randomUUID(),
      { reason: 'I created both images.', targetIds: fixture.targetIds },
    )
    await assertServiceIncompleteAppeal(
      {
        submissionId: appeal.submission.id,
        currentUser: fixture.moderator,
        recommendationId: null,
        manualFallbackReason: 'The record is sufficient without an agent recommendation.',
        rationale: 'All appealed restrictions require a single complete decision.',
        decisions: [{ restrictionId: fixture.restrictionIds[0]!, action: 'reverse' }],
      },
      fixture.noticeId,
      fixture.poster.id,
    )
    const aggregate = await getCopyrightNoticePrivateAggregate(fixture.noticeId)
    expect(aggregate?.restrictions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.restrictionIds[0], human_reviewed_at: null }),
        expect.objectContaining({ id: fixture.restrictionIds[1], human_reviewed_at: null }),
      ]),
    )
  })

  it('starts the statutory clock only after a moderator accepts the counter-notice', async () => {
    expect.hasAssertions()
    const fixture = await createRestrictedFixture()
    const counter = await seedRestorationCounterNotice(fixture.poster, fixture.noticeId, [
      fixture.targetId,
    ])
    await assertServiceCounterReview(
      {
        submissionId: counter.submission.id,
        currentUser: fixture.moderator,
        is_accepted: true,
        rationale: 'The structured counter-notice is formally complete.',
      },
      fixture,
    )
  })

  it('forwards a committed accepted counter-notice and replays its clock without extra effects', async () => {
    const fixture = await createRestrictedFixture()
    const counter = await seedRestorationCounterNotice(fixture.poster, fixture.noticeId, [
      fixture.targetId,
    ])
    await seedRestorationCounterApproval({
      noticeId: fixture.noticeId,
      submissionId: counter.submission.id,
      moderator: fixture.moderator,
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(fixture.noticeId)
    const forwarding = aggregate?.deliveryIntents.find(
      intent =>
        intent.copyright_notice_submission_id === counter.submission.id &&
        intent.delivery_kind === 'counter_notice_forwarding' &&
        intent.channel === 'email',
    )
    if (!forwarding) throw new Error('counter-notice forwarding was not queued')
    const delivery = await prepareCopyrightEmailDelivery(forwarding.id)
    expect(delivery.recipientEmail).toBe('claimant@example.test')
    expect(delivery.text).toContain(`Target ID: ${fixture.targetId}`)
    expect(delivery.text).toContain('Hosted URL:')
    expect(delivery.text).toContain('Name: Poster')
    expect(delivery.text).toContain('Address: 1 Main Street')
    expect(delivery.text).toContain('Telephone: 555-0100')
    expect(delivery.text).toContain('Statement under penalty of perjury:')
    expect(delivery.text).toContain('Consent to federal jurisdiction:')
    expect(delivery.text).toContain('if my address is outside the United States')
    expect(delivery.text).toContain('Consent to service of process:')
    expect(delivery.text).toContain('Electronic signature: Poster')
    await assertServiceCounterReview(
      {
        submissionId: counter.submission.id,
        currentUser: fixture.moderator,
        is_accepted: true,
        rationale: 'The completed review may be safely replayed.',
      },
      fixture,
      { replay: true },
    )
  })
})
