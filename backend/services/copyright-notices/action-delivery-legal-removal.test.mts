import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as rssSnapshotGeneration from '@services/entity-cache/rss-snapshot-generation'
import {
  getImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
} from '@services/images/placements'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import {
  createCopyrightRestorationHoldFixture,
  createCounterNoticeRestoreIntent,
} from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import * as copyrightCache from './action-delivery-cache.mts'
import { processCopyrightActionIntent } from './index.mts'
import { acceptCopyrightNoticeAndImposeRestriction } from './restrictions.mts'

describe('copyright legal-removal surfaces', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps a withhold owed until the RSS snapshot generation advances', async () => {
    const scene = await restrictedScene()
    const generation = await rssSnapshotGeneration.getRssSnapshotLegalGeneration()
    vi.spyOn(rssSnapshotGeneration, 'invalidateRssSnapshotsForLegalRemoval').mockRejectedValueOnce(
      new Error('generation outage'),
    )
    const now = new Date()

    await expect(processCopyrightActionIntent(scene.withhold.id, now)).rejects.toThrow(
      'generation outage',
    )
    expect(await getActionIntent(scene.notice.id, 'withhold')).toMatchObject({
      state: 'pending',
      completed_at: null,
    })
    expect(await rssSnapshotGeneration.getRssSnapshotLegalGeneration()).toBe(generation)

    await expect(
      processCopyrightActionIntent(scene.withhold.id, new Date(now.getTime() + 61_000)),
    ).resolves.toBe('applied')
    expect(await getActionIntent(scene.notice.id, 'withhold')).toMatchObject({
      state: 'completed',
    })
    expect(await rssSnapshotGeneration.getRssSnapshotLegalGeneration()).not.toBe(generation)
  })

  it.each(['placement changed', 'blocker admitted'] as const)(
    'evicts legal-removal surfaces once a restore denied after delivery commits (%s)',
    async scenario => {
      const scene = await restrictedScene()
      await expect(processCopyrightActionIntent(scene.withhold.id, new Date())).resolves.toBe(
        'applied',
      )
      const { now, restore } = await createCounterNoticeRestoreIntent({
        claimant: scene.claimant,
        noticeId: scene.notice.id,
        moderator: scene.moderator,
        targetId: scene.target.id,
        restrictionId: scene.restriction.id,
        placementRevision: scene.target.placement_revision,
      })
      const generation = await rssSnapshotGeneration.getRssSnapshotLegalGeneration()
      const evictions = vi.spyOn(copyrightCache, 'invalidateCopyrightLegalRemovalSurfaces')

      await expect(
        processCopyrightActionIntent(restore.id, now, {
          // Denies the restore between preparation and finalization.
          publishStagedMediaDeliveryRecord: async () => {
            if (scenario === 'blocker admitted') {
              await appendTestCopyrightNoticeSubmission({
                noticeId: scene.notice.id,
                kind: 'court_or_ccb_hold',
                receivedAt: now,
                sourceKind: 'email',
                submittedByUserId: null,
                bodyCiphertext: `filing-${crypto.randomUUID()}`,
              })
              return
            }
            const current = await getImagePlacementForCopyright(scene.target.placement_id)
            if (!current) throw new Error('restored placement disappeared')
            await withholdImagePlacementForCopyright({
              placementId: current.placementId,
              expectedRevision: current.revision,
            })
          },
        }),
      ).resolves.toBe('stale')

      // Only the denial evicts: the restore never completed, so it never evicted on its own.
      expect(evictions).toHaveBeenCalledExactlyOnceWith(
        { placement_id: scene.target.placement_id, action: 'withhold' },
        expect.anything(),
      )
      expect(await getActionIntent(scene.notice.id, 'restore')).toMatchObject({
        state: scenario === 'blocker admitted' ? 'blocked' : 'stale',
      })
      expect(await rssSnapshotGeneration.getRssSnapshotLegalGeneration()).not.toBe(generation)
    },
  )
})

async function restrictedScene() {
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
  return { claimant, moderator, notice, restriction, target, withhold }
}

async function getActionIntent(noticeId: string, action: 'withhold' | 'restore') {
  return (await getCopyrightNoticePrivateAggregate(noticeId))?.actionIntents.find(
    intent => intent.action === action,
  )
}
