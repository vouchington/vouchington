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

  it.each(['before_facts', 'before_completion_generation'] as const)(
    'denies the actual published tuple when a filing preempts %s, and retains scoped recovery',
    async boundary => {
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
        boundary === 'before_facts'
          ? '/* readCopyrightActionDeliveryForCompletion */'
          : '/* lockCopyrightActionGenerationForWrite */',
        values =>
          published &&
          values.includes(boundary === 'before_facts' ? scene.restore.id : scene.notice.id),
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
        const outcome = await Promise.allSettled([
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
        ])
        const rejected = expect.objectContaining({
          status: 'rejected',
          reason: new Error('Copyright action lease expired before completion'),
        })
        expect(outcome[0]).toEqual(
          boundary === 'before_facts' ? { status: 'fulfilled', value: 'not_claimed' } : rejected,
        )
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
      expect(
        (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.lifecycleEvents.filter(
          row =>
            row.copyright_notice_action_intent_id === scene.restore.id &&
            row.change_type === 'placement_restored',
        ),
      ).toEqual([])
      const recovered = await readMediaDeliveryRegistryItem(deliveryKey)
      expect({ immediately: immediately?.state, recovered: recovered?.state }).toEqual({
        immediately: 'withheld',
        recovered: 'withheld',
      })
    },
  )

  it.each(['before_write', 'after_write'] as const)(
    'preserves the newer current-revision allow when reversal commits %s',
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
      let newerIntentId = ''
      let originalRevision = 0
      try {
        const outcomes = await raceCopyrightRepairWithReversal({
          phase,
          placementId: scene.target.placement_id,
          recordId: () => recordId,
          newerIntentId: () => newerIntentId,
          beforeCompletion: async () => {
            const filing = await appendCopyrightGuestFiling({
              noticeId: scene.notice.id,
              token: capability.token,
              now: scene.restorationAt,
              kind: 'court_or_ccb_hold',
              statement: 'A federal court proceeding has commenced.',
            })
            submissionId = filing.id
            denialGeneration = ''
          },
          original: () =>
            processCopyrightActionIntent(scene.restore.id, scene.restorationAt, {
              publishStagedMediaDeliveryRecord: async id => {
                recordId = id
                await publishStagedMediaDeliveryRecord(id)
                const tuple = await getImagePlacementForCopyright(scene.target.placement_id)
                if (!tuple) throw new Error('Restored tuple disappeared')
                originalRevision = tuple.revision
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
          newer: async () => {
            const readyCase = await getCopyrightNoticePrivateAggregate(scene.notice.id)
            const ground = readyCase?.restrictions.find(
              row => row.copyright_notice_submission_id === submissionId && row.lifted_at === null,
            )
            const ready = readyCase?.actionIntents.find(
              row =>
                row.action === 'restore' &&
                row.state === 'pending' &&
                row.copyright_restriction_id === ground?.id,
            )
            if (!ready)
              throw new Error('Filing reversal did not queue its current-revision restoration')
            newerIntentId = ready.id
            return processCopyrightActionIntent(
              ready.id,
              new Date(Math.max(Date.now(), scene.restorationAt.getTime()) + 61_000),
            )
          },
        })
        expect(outcomes).toEqual([
          { status: 'fulfilled', value: 'not_claimed' },
          { status: 'fulfilled', value: 'applied' },
        ])
        const current = await getImagePlacementForCopyright(scene.target.placement_id)
        if (!current) throw new Error('The newer restored placement disappeared')
        expect(current.withheld).toBe(false)
        expect(current.revision).toBeGreaterThan(originalRevision)
        const item = await readMediaDeliveryRegistryItem(
          getImagePlacementDeliveryKey({
            placementId: current.placementId,
            revision: current.revision,
            imageId: current.imageId,
          }),
        )
        expect(item?.state).toBe('allow')
        const old = await readMediaDeliveryRegistryItem(deliveryKey)
        expect(old?.state).toBe('withheld')
        expect(BigInt(old!.generation)).toBeGreaterThan(BigInt(initialGeneration))
        expect(Boolean(denialGeneration)).toBe(true)
        expect(BigInt(item!.generation)).toBeGreaterThan(BigInt(denialGeneration))
        const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
        expect(after?.actionIntents.find(row => row.id === newerIntentId)).toMatchObject({
          state: 'completed',
        })
        expect(after?.actionIntents.find(row => row.id === scene.restore.id)).toMatchObject({
          state: 'blocked',
        })
      } finally {
        vi.restoreAllMocks()
      }
    },
  )
})
