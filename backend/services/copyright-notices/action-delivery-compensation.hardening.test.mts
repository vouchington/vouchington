import { stageCurrentDeliveryRecords } from '../media-delivery-safety/delivery-registry-staging-current.mts'
import { recordImageDeliveryRepairMarker } from '../media-delivery-safety/delivery-repair-markers.mts'
import { reconcileTestDeliveryRepairMarker } from '@voucha/test-helpers/entities/media-delivery-repair'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mediaDeliveryEdgeEnvironment,
  readMediaDeliveryRegistryItem,
} from '@voucha/test-helpers/media-delivery-emulator'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { raceCopyrightCompensationWithPublisherAndGuest } from '@voucha/test-helpers/copyright-compensation-publisher-guest-race'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { publishStagedMediaDeliveryRecord } from '@services/media-delivery-safety'
import { claimCopyrightActionIntent } from './action-delivery-state.mts'
import { prepareCopyrightAction } from './action-delivery-preparation.mts'
import { compensateCopyrightActionFailure } from './action-delivery-compensation.mts'
import { issueCopyrightGuestCapability } from './guest-capabilities.mts'
import { appendCopyrightGuestFiling } from './guest-filings.mts'

describe('compensation, duplicate allow publication and court filing', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it.each(['publish', 'stage', 'repair'] as const)(
    'settles %s with the compensation diagnostic and a committed court filing',
    async mode => {
      for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
        vi.stubEnv(key, value)
      const scene = await openHeldCounterNoticeRestore()
      const claimed = await claimCopyrightActionIntent(scene.restore.id, scene.restorationAt)
      if (!claimed) throw new Error('Restore could not be claimed')
      const prepared = await prepareCopyrightAction(claimed, scene.restorationAt)
      if (typeof prepared === 'string' || !prepared.mediaDeliveryRegistryRecordId)
        throw new Error('Restore could not be prepared')
      const recordId = prepared.mediaDeliveryRegistryRecordId
      await publishStagedMediaDeliveryRecord(recordId)
      const tuple = {
        placementId: prepared.placement.placementId,
        revision: prepared.placement.revision,
        imageId: prepared.placement.imageId,
      }
      const key = getImagePlacementDeliveryKey(tuple)
      expect(await readMediaDeliveryRegistryItem(key)).toMatchObject({ state: 'allow' })
      const capability = await issueCopyrightGuestCapability({
        currentUser: scene.moderator,
        noticeId: scene.notice.id,
        issuedAt: scene.restorationAt,
        expiresAt: new Date(scene.restorationAt.getTime() + 60 * 60_000),
      })
      if (mode === 'repair') await recordImageDeliveryRepairMarker(tuple)
      const originalError = new Error('Provider receipt failed before compensation.')
      const outcomes = await raceCopyrightCompensationWithPublisherAndGuest({
        placementId: tuple.placementId,
        noticeId: scene.notice.id,
        intentId: scene.restore.id,
        publisher: () =>
          mode === 'publish'
            ? publishStagedMediaDeliveryRecord(recordId)
            : mode === 'repair'
              ? reconcileTestDeliveryRepairMarker(recordId)
              : stageCurrentDeliveryRecords([
                  {
                    placement_id: tuple.placementId,
                    placement_revision: tuple.revision,
                    image_id: tuple.imageId,
                  },
                ]),
        filing: () =>
          appendCopyrightGuestFiling({
            noticeId: scene.notice.id,
            token: capability.token,
            now: scene.restorationAt,
            kind: 'court_or_ccb_hold',
            statement: 'A federal court proceeding has commenced.',
          }),
        compensate: () =>
          compensateCopyrightActionFailure(claimed, scene.restorationAt, tuple, originalError),
      })
      expect(outcomes).toEqual([
        { status: 'fulfilled', value: undefined },
        {
          status: 'fulfilled',
          value: expect.objectContaining({ kind: 'court_or_ccb_hold' }),
        },
        { status: 'rejected', reason: originalError },
      ])
      expect(
        (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.actionIntents.find(
          row => row.id === scene.restore.id,
        ),
      ).toMatchObject({ state: 'blocked' })
      expect(
        (await getCopyrightNoticePrivateAggregate(scene.notice.id))?.submissions.filter(
          row => row.kind === 'court_or_ccb_hold',
        ),
      ).toHaveLength(1)
      expect(await readMediaDeliveryRegistryItem(key)).toMatchObject({ state: 'withheld' })
    },
  )
})
