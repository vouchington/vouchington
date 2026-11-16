import { readCopyrightFilingProjection } from '@voucha/test-helpers/copyright-filing-projection'
import { createCopyrightCourtFilingScene } from '@voucha/test-helpers/copyright-court-filing-scene'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mediaDeliveryEdgeEnvironment,
  readMediaDeliveryRegistryItem,
} from '@voucha/test-helpers/media-delivery-emulator'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import {
  raceCopyrightFilingWithPublication,
  admitCopyrightFilingWhilePublisherPaused,
} from '@voucha/test-helpers/copyright-filing-publication-race'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { getImagePlacementForCopyright } from '../images/placements.mts'
import { processCopyrightActionIntent } from '../copyright-notices/action-delivery-process.mts'
import { issueCopyrightGuestCapability } from '../copyright-notices/guest-capabilities.mts'
import { appendCopyrightGuestFiling } from '../copyright-notices/guest-filings.mts'
import { stageImagePlacementDeliveryRecord } from './delivery-registry-staging.mts'
import { processMediaDeliveryRegistryRecord } from './delivery-registry-process.mts'
import {
  processReconcileMediaDeliveryRegistry,
  processApplyMediaDeliveryRegistryRecord,
} from '../../workers/notifications/processors/media-delivery-registry.mts'

describe('standalone delivery publication racing court admission', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it.each(['before_proof', 'after_proof'] as const)(
    'durably stages court denial when publication already reached %s',
    async boundary => {
      for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
        vi.stubEnv(key, value)
      const scene = await openHeldCounterNoticeRestore()
      await expect(
        processCopyrightActionIntent(scene.restore.id, scene.restorationAt),
      ).resolves.toBe('applied')
      const placement = await getImagePlacementForCopyright(scene.target.placement_id)
      if (!placement) throw new Error('Restored placement disappeared')
      const tuple = {
        placementId: placement.placementId,
        revision: placement.revision,
        imageId: placement.imageId,
      }
      const key = getImagePlacementDeliveryKey(tuple)
      const { mediaDeliveryRegistryRecordId: recordId } = await stageImagePlacementDeliveryRecord(
        { ...tuple, state: 'allow' },
        { forceGeneration: true },
      )
      const capability = await issueCopyrightGuestCapability({
        currentUser: scene.moderator,
        noticeId: scene.notice.id,
        issuedAt: scene.restorationAt,
        expiresAt: new Date(scene.restorationAt.getTime() + 60 * 60_000),
      })
      const outcomes = await raceCopyrightFilingWithPublication({
        placementId: tuple.placementId,
        boundary,
        publisher: () => processMediaDeliveryRegistryRecord(recordId),
        filing: async () => {
          const filing = await appendCopyrightGuestFiling({
            noticeId: scene.notice.id,
            token: capability.token,
            now: scene.restorationAt,
            kind: 'court_or_ccb_hold',
            statement: 'A federal court proceeding has commenced.',
          })
          return filing
        },
      })
      expect(outcomes[0]).toEqual({ status: 'fulfilled', value: 'completed' })
      expect(outcomes[1]).toMatchObject({
        status: 'fulfilled',
        value: { kind: 'court_or_ccb_hold' },
      })
      const [currentRecord] = await readCopyrightFilingProjection(tuple.placementId)
      expect(currentRecord).toMatchObject({ desired_state: 'withheld', state: 'pending' })
      if (!currentRecord) throw new Error('Committed court denial missing')
      await processMediaDeliveryRegistryRecord(currentRecord.id)
      const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
      expect(after?.submissions.filter(row => row.kind === 'court_or_ccb_hold')).toHaveLength(1)
      expect(
        after?.lifecycleEvents.filter(row => row.change_type === 'court_or_ccb_hold_received'),
      ).toHaveLength(1)
      expect(after?.actionIntents.find(row => row.id === scene.restore.id)).toMatchObject({
        state: 'completed',
      })
      await processReconcileMediaDeliveryRegistry(
        {},
        { recordIds: [recordId], imageIds: [scene.target.image_id] },
        1,
        3,
      )
      await processApplyMediaDeliveryRegistryRecord({ mediaDeliveryRegistryRecordId: recordId })
      const recovered = await readMediaDeliveryRegistryItem(key)
      expect((await getImagePlacementForCopyright(tuple.placementId))?.withheld).toBe(true)
      expect(recovered?.state).toBe('withheld')
    },
  )

  it('commits current denial work before a claimed standalone publisher resumes', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const scene = await createCopyrightCourtFilingScene()
    const tuple = {
      placementId: scene.surface.placementId,
      revision: scene.surface.placementRevision,
      imageId: scene.surface.imageId,
    }
    const oldKey = getImagePlacementDeliveryKey(tuple)
    const staged = await stageImagePlacementDeliveryRecord(
      { ...tuple, state: 'allow' },
      { forceGeneration: true },
    )
    let currentKey = ''
    let filingId = ''
    let currentRecordId = ''
    const outcomes = await admitCopyrightFilingWhilePublisherPaused({
      placementId: tuple.placementId,
      publisher: () => processMediaDeliveryRegistryRecord(staged.mediaDeliveryRegistryRecordId),
      filing: async () => {
        const filing = await scene.file()
        filingId = filing.id
        const current = await getImagePlacementForCopyright(tuple.placementId)
        if (!current) throw new Error('Committed filing placement disappeared')
        expect(current.withheld).toBe(true)
        currentKey = getImagePlacementDeliveryKey({
          placementId: current.placementId,
          revision: current.revision,
          imageId: current.imageId,
        })
        const [currentRecord] = await readCopyrightFilingProjection(tuple.placementId)
        expect(currentRecord).toMatchObject({ desired_state: 'withheld', state: 'pending' })
        if (!currentRecord) throw new Error('Committed court denial missing')
        currentRecordId = currentRecord.id
        return filing
      },
    })
    expect(outcomes[0]).toEqual({ status: 'fulfilled', value: 'completed' })
    expect(outcomes[1]).toMatchObject({ status: 'fulfilled', value: { kind: 'court_or_ccb_hold' } })
    await expect(processMediaDeliveryRegistryRecord(currentRecordId)).resolves.toBe('completed')
    expect(await readMediaDeliveryRegistryItem(oldKey)).toMatchObject({ state: 'withheld' })
    expect(await readMediaDeliveryRegistryItem(currentKey)).toMatchObject({ state: 'withheld' })
    const after = await getCopyrightNoticePrivateAggregate(scene.notice.id)
    expect(after?.submissions.filter(row => row.kind === 'court_or_ccb_hold')).toHaveLength(1)
    expect(
      after?.lifecycleEvents.filter(row => row.change_type === 'court_or_ccb_hold_received'),
    ).toHaveLength(1)
    expect(after?.restrictions).toContainEqual(
      expect.objectContaining({ copyright_notice_submission_id: filingId, lifted_at: null }),
    )
  })
})
