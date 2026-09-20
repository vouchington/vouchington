import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  readCopyrightNoticeTargetId,
  readCopyrightNoticeTargetIds,
} from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import {
  copyrightAppealRecommendations,
  createCopyrightAppeal,
  createCopyrightCounterNotice,
  createCopyrightFormIntake,
  getCopyrightNoticePrivateAggregate,
  prepareCopyrightEmailDelivery,
  reviewCopyrightAppeal,
  reviewCopyrightCounterNotice,
} from './index.mts'
import {
  appendCopyrightFormScreening,
  applyNonSpamSignedInCopyrightFormScreening,
} from './form-screenings.mts'

async function createRestrictedFixture(targetCount = 1) {
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
    requesterUserId: claimant.id,
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
        postId,
        imageId,
        hostedUseUrl: `https://voucha.ai/posts/${postId}`,
      })),
    },
  })
  await appendCopyrightFormScreening({
    intakeId: intake.intake.id,
    inputSha256: Buffer.alloc(32, 4),
    recommendation: 'not_obviously_invalid',
    rationale: 'No obvious spam or invalidity.',
    promptVersion: 'copyright-form-screening-v2',
    model: 'test-model',
  })
  await applyNonSpamSignedInCopyrightFormScreening(intake.intake.copyright_notice_submission_id)
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
  it('loads a signed-in appeal from its submission-bound encrypted payload', async () => {
    const fixture = await createRestrictedFixture()
    const appeal = await createCopyrightAppeal(
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
    const fixture = await createRestrictedFixture()
    const appeal = await createCopyrightAppeal(
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

    const result = await reviewCopyrightAppeal({
      submissionId: appeal.submission.id,
      currentUser: fixture.moderator,
      recommendationId: recommendation.id,
      manualFallbackReason: null,
      rationale: 'The supplied record supports reversal.',
      decisions: [{ restrictionId: fixture.restrictionId, action: 'reverse' }],
    })
    expect(result.reviewIds).toHaveLength(1)
    const reviewed = await getCopyrightNoticePrivateAggregate(fixture.noticeId)
    expect(reviewed?.restrictions[0]).toMatchObject({
      human_review_action: 'reverse',
      lifted_by_id: fixture.moderator.id,
    })
    expect(reviewed?.restrictions[0]?.lifted_at).not.toBeNull()
    expect(reviewed?.appealReviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: result.reviewIds[0], action: 'reverse' }),
      ]),
    )
  })

  it('requires one decision for every active restriction named by an appeal', async () => {
    const fixture = await createRestrictedFixture(2)
    const appeal = await createCopyrightAppeal(
      fixture.poster,
      fixture.noticeId,
      crypto.randomUUID(),
      { reason: 'I created both images.', targetIds: fixture.targetIds },
    )
    await expect(
      reviewCopyrightAppeal({
        submissionId: appeal.submission.id,
        currentUser: fixture.moderator,
        recommendationId: null,
        manualFallbackReason: 'The record is sufficient without an agent recommendation.',
        rationale: 'All appealed restrictions require a single complete decision.',
        decisions: [{ restrictionId: fixture.restrictionIds[0]!, action: 'reverse' }],
      }),
    ).rejects.toMatchObject({ status: 422 })
    const aggregate = await getCopyrightNoticePrivateAggregate(fixture.noticeId)
    expect(aggregate?.restrictions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.restrictionIds[0], human_reviewed_at: null }),
        expect.objectContaining({ id: fixture.restrictionIds[1], human_reviewed_at: null }),
      ]),
    )
  })

  it('starts the statutory clock only after a moderator accepts the counter-notice', async () => {
    const fixture = await createRestrictedFixture()
    const counter = await createCopyrightCounterNotice(
      fixture.poster,
      fixture.noticeId,
      crypto.randomUUID(),
      {
        name: 'Poster',
        address: '1 Main Street',
        telephone: '555-0100',
        consentToFederalJurisdiction: true,
        consentToServiceOfProcess: true,
        goodFaithMisidentificationUnderPenaltyOfPerjury: true,
        electronicSignature: 'Poster',
        targetIds: [fixture.targetId],
      },
    )
    const result = await reviewCopyrightCounterNotice({
      submissionId: counter.submission.id,
      currentUser: fixture.moderator,
      accepted: true,
      rationale: 'The structured counter-notice is formally complete.',
    })
    expect(result.deadlineId).not.toBeNull()
    const aggregate = await getCopyrightNoticePrivateAggregate(fixture.noticeId)
    expect(aggregate?.deadlines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ qualifying_counter_notice_assessment_id: result.assessmentId }),
      ]),
    )
    expect(aggregate?.counterNoticeReviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          copyright_notice_submission_assessment_id: result.assessmentId,
          accepted: true,
        }),
      ]),
    )
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
    expect(delivery.text).toContain('Consent to service of process:')
    expect(delivery.text).toContain('Electronic signature: Poster')
  })
})
