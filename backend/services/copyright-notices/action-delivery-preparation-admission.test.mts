import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import {
  getImagePlacementForCopyright,
  restoreImagePlacementForCopyright,
} from '@services/images/placements'
import { processCopyrightActionIntent } from './index.mts'
import { failCopyrightActionIntent } from './action-delivery-state.mts'

describe('copyright preparation denial receipt', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('propagates a postcommit denial receipt lease loss through compensation', async () => {
    const edge = installTestMediaDeliveryEdge()
    const scene = await openHeldCounterNoticeRestore()
    const current = await getImagePlacementForCopyright(scene.target.placement_id)
    if (!current) throw new Error('Placement disappeared')
    await restoreImagePlacementForCopyright({
      placementId: current.placementId,
      expectedRevision: current.revision,
    })
    await appendTestCopyrightNoticeSubmission({
      noticeId: scene.notice.id,
      kind: 'court_or_ccb_hold',
      receivedAt: scene.restorationAt,
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `receipt-filing-${crypto.randomUUID()}`,
    })
    edge.put.mockClear()
    let released = false
    const restore = beforePostgresTransactionQueryForTest(
      '/* completeCopyrightActionIntentInTransaction */',
      values => values.includes(scene.restore.id),
      async () => {
        released = true
        const claimed = (
          await getCopyrightNoticePrivateAggregate(scene.notice.id)
        )?.actionIntents.find(row => row.id === scene.restore.id)
        if (!claimed?.lease_token) throw new Error('Claimed lease disappeared')
        await expect(
          failCopyrightActionIntent({
            intentId: scene.restore.id,
            leaseToken: claimed.lease_token,
            failedAt: scene.restorationAt,
            failureMessage: 'A concurrent execution released the receipt lease.',
          }),
        ).resolves.toBe('retrying')
      },
    )
    try {
      await expect(
        processCopyrightActionIntent(scene.restore.id, scene.restorationAt),
      ).rejects.toThrow('Copyright action lease expired before completion')
    } finally {
      restore()
    }
    expect(released).toBe(true)
    expect(edge.put.mock.calls.map(([record]) => record.state)).toEqual(['withheld'])
    expect(
      (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.actionIntents.find(
        row => row.id === scene.restore.id,
      ),
    ).toMatchObject({
      state: 'pending',
      failure_message: 'A concurrent execution released the receipt lease.',
    })
  })
})
