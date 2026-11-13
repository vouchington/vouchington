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
import { createCopyrightRestorationHoldFixture } from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  seedActionDeliveryRestriction,
  prepareActionDeliveryRestore,
  seedUnavailableActionDelivery,
} from '@voucha/test-helpers/copyright-action-delivery-contract-fixtures'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { assertActionDeliveryTerminalJob } from '@voucha/test-helpers/copyright-action-delivery-contract-job'
import { actionDeliveryOwner } from '@voucha/test-helpers/copyright-action-delivery-authority-subject'
import {
  assertActionDeliveryOutageJob,
  assertPreparedActionCompensation,
} from '@voucha/test-helpers/copyright-action-delivery-outage-subject'
import { prepublishCopyrightImagePlacementDenial } from './action-delivery-edge.mts'

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
    await assertActionDeliveryTerminalJob({
      noticeId: notice.id,
      restrictionId: restriction.id,
      placementId: target.placement_id,
      accountId: claimant.id,
      intentId: withhold.id,
      now: new Date(),
      outcome: 'stale',
      message: 'Authoritative placement no longer matches the intent revision and asset.',
    })
    await expect(getImagePlacementForCopyright(target.placement_id)).resolves.toMatchObject({
      withheld: false,
      revision: target.placement_revision + 2,
    })
    expect(edge.put).not.toHaveBeenCalled()
  })

  it('completes an unavailable restore without projecting a deleted placement', async () => {
    const scene = await openHeldCounterNoticeRestore()
    await markImageModerationFlagged(scene.target.image_id)
    edge.put.mockClear()
    await assertActionDeliveryTerminalJob({
      ...actionDeliveryOwner(scene),
      intentId: scene.restore.id,
      now: scene.restorationAt,
      outcome: 'unavailable',
    })
    expect(edge.put).not.toHaveBeenCalled()
  })

  it('describes a committed unavailable resolution once and replays without duplicate statements', async () => {
    const scene = await openHeldCounterNoticeRestore()
    await markImageModerationFlagged(scene.target.image_id)
    await seedUnavailableActionDelivery(scene)
    const statements = (await readTestCopyrightStatementIntents(scene.notice.id)).filter(
      row => row.delivery_kind === 'poster_restoration_notice',
    )
    expect(statements).toHaveLength(2)
    const email = statements.find(row => row.channel === 'email')!
    expect(email.text).toContain('The image is unavailable.')
    expect(email.text).toContain(
      'ended automatically when the counter-notice waiting period expired',
    )
    expect(email.text).not.toContain('A person made this decision')
    await assertActionDeliveryTerminalJob({
      ...actionDeliveryOwner(scene),
      intentId: scene.restore.id,
      now: scene.restorationAt,
      outcome: 'replay',
    })
    expect(
      (await readTestCopyrightStatementIntents(scene.notice.id)).filter(
        row => row.delivery_kind === 'poster_restoration_notice',
      ),
    ).toHaveLength(2)
  })

  it('republishes withhold and fails closed when restore finalization sees a changed tuple', async () => {
    expect.hasAssertions()
    const scene = await openHeldCounterNoticeRestore()
    rejectTestMediaDeliveryEdgeState(edge, 'withheld', new Error('rollback outage'))
    await assertActionDeliveryOutageJob(scene)
  })

  it('keeps committed preparation statements accurate through a real rollback provider outage', async () => {
    const scene = await openHeldCounterNoticeRestore()
    const prepared = await prepareActionDeliveryRestore(scene)
    await expect(
      withholdImagePlacementForCopyright({
        placementId: prepared.placementId,
        expectedRevision: prepared.revision,
      }),
    ).resolves.toMatchObject({ status: 'applied' })
    rejectTestMediaDeliveryEdgeState(edge, 'withheld', new Error('rollback outage'))
    await assertPreparedActionCompensation(scene, prepared)
    // The provider seam is exercised unconditionally even when compensation's own SSI snapshot aborts.
    await expect(prepublishCopyrightImagePlacementDenial(prepared)).rejects.toThrow(
      'rollback outage',
    )
    const statements = (await readTestCopyrightStatementIntents(scene.notice.id)).filter(
      row => row.delivery_kind === 'poster_restoration_notice' && row.channel === 'email',
    )
    expect(statements).toHaveLength(1)
    expect(statements[0]!.text).toContain('Restoration is authorized.')
    expect(statements[0]!.text).toContain('when restoration delivery completes')
    expect(statements[0]!.text).not.toContain('The image is visible again.')
  })
})
