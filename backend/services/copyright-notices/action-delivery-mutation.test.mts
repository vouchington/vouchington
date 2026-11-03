import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { createCopyrightRestorationHoldFixture } from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import {
  retireTestCopyrightRestorationPlacement,
  supersedeTestCopyrightRestorationPlacementRevision,
} from '@voucha/test-helpers/services/copyright-notices/hold-restoration'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { processCopyrightActionIntent } from './index.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'

describe('copyright action delivery placement mutation', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each([
    {
      status: 'stale',
      // Two copyright toggles commit after the claim read the placement, so its revision moved on.
      change: supersedeTestCopyrightRestorationPlacementRevision,
    },
    {
      status: 'deleted',
      // The owner removes the placement after the claim read it as live.
      change: retireTestCopyrightRestorationPlacement,
    },
  ])(
    'completes a withhold as stale when the placement is $status at mutation time',
    async ({ status, change }) => {
      const { aggregate, assessment, moderator, notice } =
        await createCopyrightRestorationHoldFixture()
      const target = aggregate.targets[0]!
      await acceptCopyrightNoticeAndImposeRestriction({
        noticeId: notice.id,
        targetId: target.id,
        assessmentId: assessment.id,
        imposedAt: new Date('2026-07-01T12:00:00.000Z'),
        imposedById: moderator.id,
      })
      const withhold = (await getCopyrightNoticePrivateAggregate(notice.id))!.actionIntents.find(
        intent => intent.action === 'withhold',
      )!
      // Acts after the placement read and before the placement row lock, as a concurrent commit would.
      const restore = runBeforePostgresStatementForTest(
        'lockImageDeliveryMutation:lockPlacements',
        async () => {
          await change(target.placement_id)
        },
      )
      onTestFinished(restore)

      await expect(processCopyrightActionIntent(withhold.id, new Date())).resolves.toBe('stale')

      const completed = (await getCopyrightNoticePrivateAggregate(notice.id))!.actionIntents.find(
        intent => intent.id === withhold.id,
      )
      expect(completed).toMatchObject({
        state: 'stale',
        failure_message: `Placement transition was ${status}.`,
      })
      await expect(getImagePlacementForCopyright(target.placement_id)).resolves.toMatchObject({
        withheld: false,
      })
    },
  )
})
