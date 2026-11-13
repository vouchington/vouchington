import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createCopyrightRestorationHoldFixture } from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedActionDeliveryRestriction } from '@voucha/test-helpers/copyright-action-delivery-contract-fixtures'
import { assertActionDeliveryMutation } from '@voucha/test-helpers/copyright-action-delivery-mutation-subject'

describe('copyright action delivery placement mutation', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each(['stale', 'deleted'] as const)(
    'completes a withhold as stale when the placement is %s at mutation time',
    async change => {
      expect.hasAssertions()
      const { aggregate, assessment, claimant, moderator, notice } =
        await createCopyrightRestorationHoldFixture()
      const target = aggregate.targets[0]!
      const restriction = await seedActionDeliveryRestriction({
        noticeId: notice.id,
        targetId: target.id,
        assessmentId: assessment.id,
        imposedAt: new Date('2026-07-01T12:00:00.000Z'),
        imposedById: moderator.id,
      })
      const withhold = (await getCopyrightNoticePrivateAggregate(notice.id))!.actionIntents.find(
        row => row.action === 'withhold',
      )!
      await assertActionDeliveryMutation({
        noticeId: notice.id,
        restrictionId: restriction.id,
        placementId: target.placement_id,
        accountId: claimant.id,
        intentId: withhold.id,
        now: new Date(),
        change,
      })
    },
  )
})
