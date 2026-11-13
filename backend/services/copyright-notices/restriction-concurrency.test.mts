import { reviewAndRestoreCopyrightRestriction } from '@voucha/test-helpers/copyright-restriction-assessment-race'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { processCopyrightActionIntent } from './index.mts'
import { seedCopyrightSubmissionAssessment } from '@voucha/test-helpers/copyright-notice-submissions'
import {
  seedCopyrightUnreviewedRestriction,
  seedCopyrightRaceCounterDeadline,
} from '@voucha/test-helpers/copyright-assessment-race-fixtures'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
  readCopyrightAssessmentRaceState,
} from '@voucha/test-helpers/copyright-assessment-race-outcomes'
import { isCopyrightStaydownMatchingEnabled } from './config.mts'
import { createCopyrightRestorationHoldFixture } from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

describe('copyright restriction concurrency', () => {
  let edge: ReturnType<typeof installTestMediaDeliveryEdge>

  beforeEach(() => {
    edge = installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('notifies only the poster at the restricted post-image placement', async () => {
    const [targetPoster, unrelatedPoster, moderatorRecord] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const imageId = await insertTestImage(targetPoster.id)
    const [targetPostId, unrelatedPostId] = await Promise.all([
      insertTestPost({
        title: `copyright target placement ${crypto.randomUUID()}`,
        slug: `copyright-target-placement-${crypto.randomUUID()}`,
        createdById: targetPoster.id,
        markdown: 'image',
      }),
      insertTestPost({
        title: `copyright unrelated placement ${crypto.randomUUID()}`,
        slug: `copyright-unrelated-placement-${crypto.randomUUID()}`,
        createdById: unrelatedPoster.id,
        markdown: 'image',
      }),
    ])
    await Promise.all([
      insertTestPostImage({ postId: targetPostId, imageId }),
      insertTestPostImage({ postId: unrelatedPostId, imageId }),
    ])
    const targetPlacement = await requireTestPostImagePlacement(targetPostId, imageId)
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date('2026-06-30T16:00:00.000Z'),
      claimantUserId: null,
      claimantDisplayName: null,
      claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
      workDescription: `work-${crypto.randomUUID()}`,
      policyVersion: 'test-v1',
      initialSubmission: {
        kind: 'notice',
        sourceKind: 'signed_in_form',
        bodyCiphertext: `notice-${crypto.randomUUID()}`,
      },
      targets: [
        {
          placementId: targetPlacement.placement_id,
          placementRevision: targetPlacement.placement_revision,
          imageId,
          bindingFamily: 'post',
          hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
        },
      ],
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    if (!aggregate) throw new Error('fixture notice disappeared')
    const assessment = await seedCopyrightSubmissionAssessment({
      submissionId: aggregate.submissions[0].id,
      assessedAt: new Date('2026-07-01T11:00:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
    })

    // Acceptance races are covered independently; this processor subject starts committed.
    await seedCopyrightUnreviewedRestriction({
      noticeId: notice.id,
      targetId: aggregate.targets[0].id,
      assessmentId: assessment.id,
      revision: targetPlacement.placement_revision,
    })

    const restricted = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(
      new Set(
        restricted?.deliveryIntents
          .filter(intent => intent.delivery_kind === 'poster_restriction_notice')
          .map(intent => intent.recipient_user_id),
      ),
    ).toEqual(new Set([targetPoster.id]))
    expect(restricted?.actionIntents).toContainEqual(
      expect.objectContaining({
        action: 'withhold',
        expected_placement_revision: targetPlacement.placement_revision,
        state: 'pending',
      }),
    )
    const withholdIntent = restricted?.actionIntents.find(intent => intent.action === 'withhold')
    if (!withholdIntent) throw new Error('withhold intent disappeared')
    await expect(processCopyrightActionIntent(withholdIntent.id, new Date())).resolves.toBe(
      'applied',
    )
    const withheldPlacement = await getImagePlacementForCopyright(targetPlacement.placement_id)
    if (!withheldPlacement) throw new Error('withheld placement disappeared')
    expect(
      edge.records.get(
        getImagePlacementDeliveryKey({
          placementId: withheldPlacement.placementId,
          revision: withheldPlacement.revision,
          imageId,
        }),
      )?.state,
    ).toBe('withheld')
    const completed = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(completed?.actionIntents).toContainEqual(
      expect.objectContaining({
        id: withholdIntent.id,
        state: 'completed',
        completed_at_reason: 'completed',
      }),
    )
  })

  it('commits review and rolls back a restoration from the earlier snapshot', async () => {
    const {
      claimant,
      moderator,
      notice,
      aggregate,
      assessment: noticeAssessment,
    } = await createCopyrightRestorationHoldFixture()
    const target = aggregate.targets[0]!
    const restriction = await seedCopyrightUnreviewedRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: noticeAssessment.id,
      revision: target.placement_revision,
    })
    const deadline = await seedCopyrightRaceCounterDeadline({
      noticeId: notice.id,
      targetId: target.id,
      claimantId: claimant.id,
      moderator,
    })
    const before = await readCopyrightAssessmentRaceState(notice.id)
    const staydown = await isCopyrightStaydownMatchingEnabled()
    const result = await reviewAndRestoreCopyrightRestriction(
      {
        noticeId: notice.id,
        restrictionId: restriction.id,
        currentUser: moderator,
        action: 'confirm',
        rationale: 'The restriction remains appropriate after review.',
        reviewedAt: new Date('2026-07-02T12:00:00.000Z'),
      },
      {
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: restriction.id,
        deadlineId: deadline.id,
        expectedPlacementRevision: target.placement_revision,
        now: new Date(deadline.earliest_restoration_at.getTime() + 60_000),
      },
    )
    const after = await readCopyrightAssessmentRaceState(notice.id)
    const reviewed = {
      ...before,
      restrictions: before.restrictions.map(row => ({
        ...row,
        review: 'confirm',
        reviewer: moderator.id,
      })),
      events: [...before.events, 'mandatory_human_review_completed'].toSorted(),
      deliveries: [
        ...before.deliveries,
        `poster_review_notice:email:${claimant.id}`,
        `poster_review_notice:in_app:${claimant.id}`,
        `claimant_decision_notice:in_app:${claimant.id}`,
        `claimant_decision_notice:email:${claimant.id}`,
      ].toSorted(),
      correspondence: [...before.correspondence, 'decision_notice', 'decision_notice'].toSorted(),
      incidents: 1,
      staydown: staydown ? 1 : 0,
    }
    const abortedReview = {
      status: 'rejected',
      statusCode: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright case change',
      causeCode: '40001',
    }
    const ineligible = {
      status: 'rejected',
      statusCode: 409,
      code: undefined,
      message: 'Copyright restoration is not eligible',
      causeCode: undefined,
    }
    // With no committed review, restoration is ineligible; SSI may also reject its snapshot.
    expect([
      {
        review: {
          status: 'fulfilled',
          id: restriction.id,
          target: target.id,
          assessment: noticeAssessment.id,
          imposedBy: null,
          review: 'confirm',
          reviewer: moderator.id,
        },
        restoration: nativeCopyrightSerializationConflict,
        state: reviewed,
      },
      {
        review: {
          status: 'fulfilled',
          id: restriction.id,
          target: target.id,
          assessment: noticeAssessment.id,
          imposedBy: null,
          review: 'confirm',
          reviewer: moderator.id,
        },
        restoration: ineligible,
        state: reviewed,
      },
      { review: abortedReview, restoration: nativeCopyrightSerializationConflict, state: before },
      { review: abortedReview, restoration: ineligible, state: before },
    ]).toContainEqual({
      review: copyrightRaceResult(result.review),
      restoration: copyrightRaceResult(result.restoration),
      state: after,
    })
  })
})

async function requireTestPostImagePlacement(postId: string, imageId: string) {
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error(`Missing image placement for ${postId}`)
  return placement
}
