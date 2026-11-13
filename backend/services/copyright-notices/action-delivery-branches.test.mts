import * as copyrightCache from './action-delivery-cache.mts'
import { invalidateCopyrightPlacementCache } from './action-delivery-cache.mts'
import { readTestCopyrightStatementIntents } from '@voucha/test-helpers/copyright-statement-notices'
import { closeServer, listen } from '@voucha/test-helpers/api/http-boundary'
import type { AddressInfo } from 'node:net'
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
import * as cachePurge from '@services/entity-cache/purge'

describe('copyright action delivery branches', () => {
  let edge: ReturnType<typeof installTestMediaDeliveryEdge>

  beforeEach(() => {
    edge = installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('rejects a missing cache owner so legal delivery can retry eviction', async () => {
    await expect(invalidateCopyrightPlacementCache(crypto.randomUUID())).rejects.toThrow(
      'Copyright placement owner unavailable after committed legal mutation',
    )
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
    const purge = vi.spyOn(cachePurge, 'purgeCacheTags')

    await expect(processCopyrightActionIntent(withhold.id, new Date())).resolves.toBe('stale')

    await expect(getImagePlacementForCopyright(target.placement_id)).resolves.toMatchObject({
      withheld: false,
      revision: target.placement_revision + 2,
    })
    expect(edge.put).not.toHaveBeenCalled()
    expect(purge).not.toHaveBeenCalled()
  })

  it('keeps a withhold owed until its legal cache purge succeeds', async () => {
    const { aggregate, assessment, moderator, notice } =
      await createCopyrightRestorationHoldFixture()
    await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.id,
      targetId: aggregate.targets[0]!.id,
      assessmentId: assessment.id,
      imposedAt: new Date('2026-07-01T12:00:00.000Z'),
      imposedById: moderator.id,
    })
    const withhold = (await getActionIntent(notice.id, 'withhold'))!
    const purge = vi.spyOn(cachePurge, 'purgeCacheTags')
    const now = new Date()
    let requests = 0
    const server = await listen((_request, response) => {
      requests++
      response.writeHead(requests === 1 ? 503 : 200).end()
    })
    vi.stubEnv('CF_WORKER_ROUTE', `http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    vi.stubEnv('CF_WORKER_SECRET', 'test-secret')
    vi.stubEnv('SKIP_CACHE_PURGE', 'false')
    try {
      await expect(processCopyrightActionIntent(withhold.id, now)).rejects.toThrow(
        'Cache purge request failed',
      )
      expect(requests).toBe(1)
      expect(purge).toHaveBeenCalledExactlyOnceWith(['legal-removal'])
      expect(await getActionIntent(notice.id, 'withhold')).toMatchObject({
        state: 'pending',
        completed_at: null,
        failure_message: 'Cache purge request failed',
      })

      await expect(
        processCopyrightActionIntent(withhold.id, new Date(now.getTime() + 61_000)),
      ).resolves.toBe('applied')
      expect(requests).toBe(2)
      expect(purge).toHaveBeenCalledTimes(2)
      expect(await getActionIntent(notice.id, 'withhold')).toMatchObject({
        state: 'completed',
        completed_at: expect.any(Date),
      })
    } finally {
      await closeServer(server)
    }
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
  it('evicts snapshots again after a restore is denied at finalization', async () => {
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
    const evictions = vi.spyOn(copyrightCache, 'invalidateCopyrightPlacementCache')

    await expect(
      processCopyrightActionIntent(restore.id, restore.now, {
        // Re-withholds between preparation and finalization so the restore is denied afterwards.
        publishStagedMediaDeliveryRecord: async () => {
          const current = await getImagePlacementForCopyright(target.placement_id)
          if (!current) throw new Error('restored placement disappeared')
          await withholdImagePlacementForCopyright({
            placementId: current.placementId,
            expectedRevision: current.revision,
          })
        },
      }),
    ).resolves.toBe('stale')

    // Once after the committed restore, and again after the denial that follows it.
    expect(evictions).toHaveBeenCalledTimes(2)
    expect(evictions).toHaveBeenLastCalledWith(target.placement_id)
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
