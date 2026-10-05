import { describe, expect, it } from 'vitest'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { processCopyrightActionIntent } from './index.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'

describe('restoration notices with another active restriction', () => {
  it('records the lift without claiming that an independently restricted image is visible', async () => {
    const dependencies = createTestCopyrightDeliveryDependencies(async () => undefined)
    const scene = await openHeldCounterNoticeRestore(dependencies)
    const other = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date(),
      claimantUserId: scene.claimant.id,
      claimantDisplayName: null,
      claimantContactCiphertext: 'private',
      workDescription: 'Other work',
      policyVersion: 'test',
      initialSubmission: {
        kind: 'notice',
        sourceKind: 'signed_in_form',
        bodyCiphertext: 'private',
      },
      targets: [
        {
          placementId: scene.target.placement_id,
          placementRevision: scene.target.placement_revision,
          imageId: scene.target.image_id,
          bindingFamily: 'post',
          hostedUseUrl: scene.target.hosted_use_url,
        },
      ],
    })
    const aggregate = (await getCopyrightNoticePrivateAggregate(other.id))!
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: aggregate.submissions[0].id,
      assessedAt: new Date(),
      currentUser: scene.moderator,
      substantiallyCompliant: true,
    })
    await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: other.id,
      targetId: aggregate.targets[0]!.id,
      assessmentId: assessment.id,
      imposedAt: new Date(),
      imposedById: scene.moderator.id,
    })
    expect(
      await processCopyrightActionIntent(scene.restore.id, scene.restorationAt, dependencies),
    ).toBe('applied')
    const statements = (await readTestCopyrightStatementIntents(scene.notice.id)).filter(
      row => row.delivery_kind === 'poster_restoration_notice',
    )
    expect(statements).toHaveLength(2)
    expect(statements.find(row => row.channel === 'email')?.text).toContain(
      'Another restriction keeps the image hidden.',
    )
    expect(
      (await getCopyrightNoticePrivateAggregate(other.id))!.restrictions[0]!.lifted_at,
    ).toBeNull()
  })
})
