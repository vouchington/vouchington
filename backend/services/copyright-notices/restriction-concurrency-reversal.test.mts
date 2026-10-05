import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { describe, expect, it, vi } from 'vitest'
import type { prepublishImagePlacementDenial } from '@services/media-delivery-safety'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  completeCopyrightMandatoryHumanReview,
  processCopyrightActionIntent,
} from './index.mts'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

describe('copyright restriction reversal concurrency', () => {
  it('cancels a queued withhold after reversal restores the placement', async () => {
    const [poster, moderatorRecord] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const postId = await insertTestPost({
      title: `copyright stale withhold ${crypto.randomUUID()}`,
      slug: `copyright-stale-withhold-${crypto.randomUUID()}`,
      createdById: poster.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(poster.id)
    await insertTestPostImage({ postId, imageId })
    const placement = await requireTestPostImagePlacement(postId, imageId)
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date('2026-07-01T12:00:00.000Z'),
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
          placementId: placement.placement_id,
          placementRevision: placement.placement_revision,
          imageId,
          bindingFamily: 'post',
          hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
        },
      ],
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    if (!aggregate) throw new Error('fixture notice disappeared')
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: aggregate.submissions[0]!.id,
      assessedAt: new Date('2026-07-01T12:01:00.000Z'),
      currentUser: moderator,
      substantiallyCompliant: true,
    })
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: aggregate.targets[0]!.id,
      assessmentId: assessment.id,
      imposedAt: new Date('2026-07-01T12:02:00.000Z'),
      imposedById: null,
    })
    await completeCopyrightMandatoryHumanReview({
      noticeId: notice.id,
      restrictionId: restriction.id,
      currentUser: moderator,
      action: 'reverse',
      rationale: 'The automated restriction was incorrect.',
      reviewedAt: new Date('2026-07-01T12:03:00.000Z'),
    })
    const reversed = await getCopyrightNoticePrivateAggregate(notice.id)
    const restoreIntent = reversed?.actionIntents.find(intent => intent.action === 'restore')
    const withholdIntent = reversed?.actionIntents.find(intent => intent.action === 'withhold')
    if (!restoreIntent || !withholdIntent) throw new Error('reversal intents disappeared')
    const publish = vi.fn<typeof prepublishImagePlacementDenial>().mockResolvedValue(undefined)
    await expect(
      processCopyrightActionIntent(restoreIntent.id, new Date(), {
        ...createTestCopyrightDeliveryDependencies(publish),
      }),
    ).resolves.toBe('applied')
    await expect(
      processCopyrightActionIntent(withholdIntent.id, new Date(), {
        ...createTestCopyrightDeliveryDependencies(publish),
      }),
    ).resolves.toBe('stale')

    const statements = await readTestCopyrightStatementIntents(notice.id)
    expect(statements.filter(row => row.delivery_kind === 'poster_review_notice')).toHaveLength(2)
    expect(
      statements.filter(row => row.delivery_kind === 'poster_restoration_notice'),
    ).toHaveLength(2)
    expect(
      statements.find(
        row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
      )?.text,
    ).toContain('human review reversed the decision')
    await expect(getImagePlacementForCopyright(placement.placement_id)).resolves.toEqual(
      expect.objectContaining({ withheld: false }),
    )
  })
})

async function requireTestPostImagePlacement(postId: string, imageId: string) {
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error(`Missing image placement for ${postId}`)
  return placement
}
