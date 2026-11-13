import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { rejectTestMediaDeliveryEdgeState } from '@voucha/test-helpers/copyright-delivery-edge'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { markImageModerationFlagged } from '@voucha/test-helpers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getImagePlacementForCopyright,
  restoreImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
} from '@services/images/placements'
import { processCopyrightActionIntent } from './index.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'
import {
  createCopyrightRestorationHoldFixture,
  createCounterNoticeRestoreIntent,
} from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import * as cachePurgeEnqueues from '../../queues/cache-purge/enqueues.mts'

describe('copyright action delivery branches', () => {
  let edge: ReturnType<typeof installTestMediaDeliveryEdge>

  beforeEach(() => {
    edge = installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('marks a withhold stale when the placement transition is no longer current', async () => {
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
    const withhold = (await getActionIntent(notice.id, 'withhold'))!
    await expect(
      withholdImagePlacementForCopyright({
        placementId: target.placement_id,
        expectedRevision: target.placement_revision,
      }),
    ).resolves.toMatchObject({ status: 'applied' })
    await expect(
      restoreImagePlacementForCopyright({
        placementId: target.placement_id,
        expectedRevision: target.placement_revision + 1,
      }),
    ).resolves.toMatchObject({ status: 'applied' })
    edge.put.mockClear()
    const purgeEnqueue = vi.spyOn(cachePurgeEnqueues, 'enqueueLegalRemovalPurgeCacheTag')

    await expect(processCopyrightActionIntent(withhold.id, new Date())).resolves.toBe('stale')

    await expect(getImagePlacementForCopyright(target.placement_id)).resolves.toMatchObject({
      withheld: false,
      revision: target.placement_revision + 2,
    })
    expect(edge.put).not.toHaveBeenCalled()
    expect(purgeEnqueue).not.toHaveBeenCalled()
  })

  it('completes an unavailable restore without projecting a deleted placement', async () => {
    const { aggregate, assessment, claimant, moderator, notice } =
      await createCopyrightRestorationHoldFixture()
    const target = aggregate.targets[0]!
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: assessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    const restore = await createRestoreIntent({
      claimant,
      moderator,
      noticeId: notice.id,
      restrictionId: restriction.id,
      target,
    })
    await markImageModerationFlagged(target.image_id)
    edge.put.mockClear()

    await expect(processCopyrightActionIntent(restore.id, restore.now)).resolves.toBe('applied')

    expect(edge.put).not.toHaveBeenCalled()
    const statements = (await readTestCopyrightStatementIntents(notice.id)).filter(
      row => row.delivery_kind === 'poster_restoration_notice',
    )
    expect(statements).toHaveLength(2)
    expect(statements.find(row => row.channel === 'email')?.text).toContain(
      'The image is unavailable.',
    )
    expect(statements.find(row => row.channel === 'email')?.text).toContain(
      'ended automatically when the counter-notice waiting period expired',
    )
    expect(statements.find(row => row.channel === 'email')?.text).not.toContain(
      'A person made this decision',
    )
    await processCopyrightActionIntent(restore.id, restore.now)
    expect(
      (await readTestCopyrightStatementIntents(notice.id)).filter(
        row => row.delivery_kind === 'poster_restoration_notice',
      ),
    ).toHaveLength(2)
  })

  it('republishes withhold and fails closed when restore finalization sees a changed tuple', async () => {
    const { aggregate, assessment, claimant, moderator, notice } =
      await createCopyrightRestorationHoldFixture()
    const target = aggregate.targets[0]!
    const restriction = await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: target.id,
      assessmentId: assessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    const withhold = (await getActionIntent(notice.id, 'withhold'))!
    await expect(processCopyrightActionIntent(withhold.id, new Date())).resolves.toBe('applied')
    const restore = await createRestoreIntent({
      claimant,
      moderator,
      noticeId: notice.id,
      restrictionId: restriction.id,
      target,
    })
    rejectTestMediaDeliveryEdgeState(edge, 'withheld', new Error('rollback outage'))

    await expect(
      processCopyrightActionIntent(restore.id, restore.now, {
        // Withholds the placement again between preparation and finalization, so finalization sees
        // a placement whose withheld state no longer matches the restore.
        publishStagedMediaDeliveryRecord: async () => {
          const current = await getImagePlacementForCopyright(target.placement_id)
          if (!current) throw new Error('restored placement disappeared')
          await withholdImagePlacementForCopyright({
            placementId: current.placementId,
            expectedRevision: current.revision,
          })
        },
      }),
    ).rejects.toThrow('rollback outage')

    const statements = (await readTestCopyrightStatementIntents(notice.id)).filter(
      row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
    )
    expect(statements).toHaveLength(1)
    expect(statements[0]?.text).toContain('Restoration is authorized.')
    expect(statements[0]?.text).toContain('when restoration delivery completes')
    expect(statements[0]?.text).not.toContain('The image is visible again.')
  })
})

async function getActionIntent(noticeId: string, action: 'withhold' | 'restore') {
  return (await getCopyrightNoticePrivateAggregate(noticeId))?.actionIntents.find(
    intent => intent.action === action,
  )
}

async function createRestoreIntent(input: {
  claimant: { id: string; roles: readonly string[] }
  moderator: { id: string; roles: readonly string[] }
  noticeId: string
  restrictionId: string
  target: { id: string; placement_revision: number }
}) {
  const { now, restore } = await createCounterNoticeRestoreIntent({
    claimant: input.claimant as never,
    noticeId: input.noticeId,
    moderator: input.moderator as never,
    targetId: input.target.id,
    restrictionId: input.restrictionId,
    placementRevision: input.target.placement_revision,
  })
  return { id: restore.id, now }
}
