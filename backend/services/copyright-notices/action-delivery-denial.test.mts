import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { getTestMediaDeliveryRecordSnapshot } from '@voucha/test-helpers/entities/media-delivery-retry'
import {
  getImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
} from '@services/images/placements'
import { publishStagedMediaDeliveryRecord } from '@services/media-delivery-safety'
import { claimCopyrightActionIntent } from './action-delivery-state.mts'
import { processCopyrightActionIntent } from './action-delivery-process.mts'

describe('copyright denial lease ownership', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it.each(['before_read', 'after_read'] as const)(
    'preserves newer ownership when takeover happens %s',
    async boundary => {
      const edge = installTestMediaDeliveryEdge()
      const scene = await openHeldCounterNoticeRestore()
      let published = false
      let recordId = ''
      let before: Record<string, unknown> | null = null
      let callsBefore = 0
      const restore = beforePostgresTransactionQueryForTest(
        boundary === 'before_read'
          ? '/* readCopyrightActionDeliveryForCompletion */'
          : '/* getImagePlacementsForCopyright */',
        values =>
          published &&
          (boundary === 'before_read'
            ? values.includes(scene.restore.id)
            : values.some(
                value => Array.isArray(value) && value.includes(scene.target.placement_id),
              )),
        async () => {
          const now = new Date(Date.now() + 6 * 60_000)
          const result =
            boundary === 'before_read'
              ? await processCopyrightActionIntent(scene.restore.id, now)
              : await claimCopyrightActionIntent(scene.restore.id, now)
          const expectedClaim = expect.objectContaining({ id: scene.restore.id })
          expect(result).toEqual(boundary === 'before_read' ? 'applied' : expectedClaim)
          before = await getTestMediaDeliveryRecordSnapshot(recordId)
          callsBefore = edge.put.mock.calls.length
        },
      )
      let outcome: Awaited<ReturnType<typeof processCopyrightActionIntent>> | undefined
      try {
        outcome = await processCopyrightActionIntent(scene.restore.id, scene.restorationAt, {
          publishStagedMediaDeliveryRecord: async id => {
            recordId = id
            await publishStagedMediaDeliveryRecord(id)
            const current = await getImagePlacementForCopyright(scene.target.placement_id)
            if (!current) throw new Error('Restored placement disappeared')
            if (boundary === 'after_read')
              await withholdImagePlacementForCopyright({
                placementId: current.placementId,
                expectedRevision: current.revision,
              })
            published = true
          },
        })
      } finally {
        restore()
      }
      expect(before).not.toBeNull()
      expect(await getTestMediaDeliveryRecordSnapshot(recordId)).toEqual(before)
      expect(edge.put).toHaveBeenCalledTimes(callsBefore)
      expect(outcome).toBe('not_claimed')
      expect(
        (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.actionIntents.find(
          row => row.id === scene.restore.id,
        ),
      ).toMatchObject({
        state: boundary === 'before_read' ? 'completed' : 'claimed',
        attempt_count: 2,
      })
    },
  )
})
