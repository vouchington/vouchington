import { raceCopyrightRepairWithReversal } from '@voucha/test-helpers/copyright-preemption-reversal-race'
import { appendCopyrightLegalHoldAssessment } from './holds.mts'
import * as mediaProvider from '@modules/aws/media-delivery-registry'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import {
  mediaDeliveryEdgeEnvironment,
  readMediaDeliveryRegistryItem,
} from '@voucha/test-helpers/media-delivery-emulator'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  withTestMediaRecoveryBacklog,
  readTestAppliedMediaRegistryJobs,
} from '@voucha/test-helpers/media-delivery-recovery'
import { getTestMediaDeliveryRecordSnapshot } from '@voucha/test-helpers/entities/media-delivery-retry'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { publishStagedMediaDeliveryRecord } from '@services/media-delivery-safety'
import {
  processReconcileMediaDeliveryRegistry,
  processApplyMediaDeliveryRegistryRecord,
} from '../../workers/notifications/processors/media-delivery-registry.mts'
import { processCopyrightActionIntent } from './action-delivery-process.mts'
import { issueCopyrightGuestCapability } from './guest-capabilities.mts'
import { appendCopyrightGuestFiling } from './guest-filings.mts'

describe('court filing after restored allow publication', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('denies the actual published tuple when a filing preempts completion, and retains scoped recovery', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const scene = await openHeldCounterNoticeRestore()
    const capability = await issueCopyrightGuestCapability({
      currentUser: scene.moderator,
      noticeId: scene.notice.id,
      issuedAt: scene.restorationAt,
      expiresAt: new Date(scene.restorationAt.getTime() + 60 * 60_000),
    })
    let published = false
    let recordId = ''
    let deliveryKey = ''
    const restore = beforePostgresTransactionQueryForTest(
      '/* readCopyrightActionDeliveryForCompletion */',
      values => published && values.includes(scene.restore.id),
      async () => {
        await appendCopyrightGuestFiling({
          noticeId: scene.notice.id,
          token: capability.token,
          now: scene.restorationAt,
          kind: 'court_or_ccb_hold',
          statement: 'A federal court proceeding has commenced.',
        })
      },
    )
    try {
      await expect(
        processCopyrightActionIntent(scene.restore.id, scene.restorationAt, {
          publishStagedMediaDeliveryRecord: async id => {
            recordId = id
            await publishStagedMediaDeliveryRecord(id)
            const tuple = await getImagePlacementForCopyright(scene.target.placement_id)
            if (!tuple) throw new Error('Restored tuple disappeared')
            deliveryKey = getImagePlacementDeliveryKey({
              placementId: tuple.placementId,
              revision: tuple.revision,
              imageId: tuple.imageId,
            })
            expect(await readMediaDeliveryRegistryItem(deliveryKey)).toMatchObject({
              state: 'allow',
            })
            published = true
          },
        }),
      ).resolves.toBe('not_claimed')
    } finally {
      restore()
    }
    const immediately = await readMediaDeliveryRegistryItem(deliveryKey)
    expect(
      (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.actionIntents.find(
        row => row.id === scene.restore.id,
      ),
    ).toMatchObject({ state: 'blocked' })

    await withTestMediaRecoveryBacklog(scene.claimant.id, 1, async outsider => {
      const outsiderId = outsider.recordIds[0]!
      const before = await getTestMediaDeliveryRecordSnapshot(outsiderId)
      await processReconcileMediaDeliveryRegistry(
        {},
        { recordIds: [recordId], imageIds: [scene.target.image_id] },
        1,
        3,
      )
      await processApplyMediaDeliveryRegistryRecord({ mediaDeliveryRegistryRecordId: recordId })
      expect(await getTestMediaDeliveryRecordSnapshot(outsiderId)).toEqual(before)
      expect(await readTestAppliedMediaRegistryJobs([outsiderId])).toEqual([])
    })
    const recovered = await readMediaDeliveryRegistryItem(deliveryKey)
    expect({ immediately: immediately?.state, recovered: recovered?.state }).toEqual({
      immediately: 'withheld',
      recovered: 'withheld',
    })
  })

  it.each(['before_write', 'after_write'] as const)(
    'preserves the newer same-tuple allow when reversal commits %s',
    async phase => {
      for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
        vi.stubEnv(key, value)
      const scene = await openHeldCounterNoticeRestore()
      const capability = await issueCopyrightGuestCapability({
        currentUser: scene.moderator,
        noticeId: scene.notice.id,
        issuedAt: scene.restorationAt,
        expiresAt: new Date(scene.restorationAt.getTime() + 60 * 60_000),
      })
      let recordId = ''
      let deliveryKey = ''
      let initialGeneration = ''
      let denialGeneration = ''
      const realPut = mediaProvider.putMediaDeliveryRegistryRecord
      vi.spyOn(mediaProvider, 'putMediaDeliveryRegistryRecord').mockImplementation(async input => {
        const result = await realPut(input)
        if (input.deliveryKey === deliveryKey && input.state === 'withheld')
          denialGeneration = input.generation
        return result
      })
      let submissionId = ''
      try {
        const outcomes = await raceCopyrightRepairWithReversal({
          phase,
          placementId: scene.target.placement_id,
          recordId: () => recordId,
          beforeCompletion: async () => {
            const filing = await appendCopyrightGuestFiling({
              noticeId: scene.notice.id,
              token: capability.token,
              now: scene.restorationAt,
              kind: 'court_or_ccb_hold',
              statement: 'A federal court proceeding has commenced.',
            })
            submissionId = filing.id
          },
          original: () =>
            processCopyrightActionIntent(scene.restore.id, scene.restorationAt, {
              publishStagedMediaDeliveryRecord: async id => {
                recordId = id
                await publishStagedMediaDeliveryRecord(id)
                const tuple = await getImagePlacementForCopyright(scene.target.placement_id)
                if (!tuple) throw new Error('Restored tuple disappeared')
                deliveryKey = getImagePlacementDeliveryKey({
                  placementId: tuple.placementId,
                  revision: tuple.revision,
                  imageId: tuple.imageId,
                })
                const item = await readMediaDeliveryRegistryItem(deliveryKey)
                expect(item?.state).toBe('allow')
                initialGeneration = item!.generation
              },
            }),
          resolveFiling: async () => {
            await appendCopyrightLegalHoldAssessment({
              currentUser: scene.moderator,
              submissionId,
              assessedAt: scene.restorationAt,
              fromOriginalClaimant: false,
              proceedingKind: null,
              ccbClaimKind: null,
              commencedAt: null,
              receivedByDesignatedAgentAt: null,
              sameMaterial: false,
              targetIds: [scene.target.id],
              rationale: 'The filing does not qualify for a hold on this material.',
            })
          },
          newer: () =>
            processCopyrightActionIntent(
              scene.restore.id,
              new Date(Math.max(Date.now(), scene.restorationAt.getTime()) + 61_000),
            ),
        })
        expect(outcomes).toEqual([
          { status: 'fulfilled', value: 'not_claimed' },
          { status: 'fulfilled', value: 'applied' },
        ])
        const item = await readMediaDeliveryRegistryItem(deliveryKey)
        expect(item?.state).toBe('allow')
        expect(BigInt(item!.generation) > BigInt(initialGeneration)).toBe(phase === 'after_write')
        expect(Boolean(denialGeneration)).toBe(phase === 'after_write')
        const supersedesDenial = denialGeneration
          ? BigInt(item!.generation) > BigInt(denialGeneration)
          : false
        expect(supersedesDenial).toBe(phase === 'after_write')
        expect(
          (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.actionIntents.find(
            row => row.id === scene.restore.id,
          ),
        ).toMatchObject({ state: 'completed' })
      } finally {
        vi.restoreAllMocks()
      }
    },
  )
})
