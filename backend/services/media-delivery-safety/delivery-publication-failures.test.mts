import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  insertTestImage,
  getTestMediaDeliveryRecord,
} from '@voucha/test-helpers'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createTestDeliverySurface } from '@voucha/test-helpers/media-delivery-surface'
import {
  getTestDeliveryRepairMarker,
  reconcileTestDeliveryRepairMarker,
  testDeliveryAutocommitQuery,
} from '@voucha/test-helpers/entities/media-delivery-repair'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import { prepublishImageDeliveryDenials } from './delivery-denials.mts'
import {
  publishImagePlacementDeliveryRecord,
  publishLegacyImageDeliveryRecord,
  publishStagedMediaDeliveryRecord,
} from './delivery-registry-publish.mts'
import { stageImagePlacementDeliveryRecord } from './delivery-registry-staging.mts'
import { publishPersistedDeliveryRecord } from './delivery-registry-acknowledgement.mts'
import { getLegacyImageDeliveryKey } from './delivery-registry-types.mts'

describe('publication failure and recovery boundaries', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('rejects autocommit authority before any external transition', async () => {
    const fixture = await createTestDeliverySurface()
    const edge = installTestMediaDeliveryEdge()
    await expect(
      lockImageDeliveryMutation(testDeliveryAutocommitQuery, {
        placementIds: [fixture.tuple.placementId],
      }),
    ).rejects.toThrow('retained transaction')
    await expect(
      publishStagedMediaDeliveryRecord(fixture.deliveryKey, { query: testDeliveryAutocommitQuery }),
    ).rejects.toThrow('retained transaction')
    expect(edge.put).not.toHaveBeenCalled()
  })

  it('publishes an exact current allow through the owner boundary', async () => {
    const fixture = await createTestDeliverySurface()
    const edge = installTestMediaDeliveryEdge()
    await publishImagePlacementDeliveryRecord({ ...fixture.tuple, state: 'allow' })
    expect(edge.records.get(fixture.deliveryKey)?.state).toBe('allow')
    expect(await getTestMediaDeliveryRecord(fixture.deliveryKey)).toMatchObject({
      state: 'completed',
    })
  })

  it('repairs an autonomous legacy denial and publishes fresh committed authority', async () => {
    const user = await createTestUserDirect()
    const imageId = await insertTestImage(user.id)
    const key = getLegacyImageDeliveryKey(imageId)
    const edge = installTestMediaDeliveryEdge()
    await prepublishImageDeliveryDenials(imageId)
    const denied = edge.records.get(key)!
    expect(denied.state).toBe('withheld')
    expect(await getTestDeliveryRepairMarker(key)).not.toBeNull()
    await reconcileTestDeliveryRepairMarker(key)
    expect(await getTestDeliveryRepairMarker(key)).toBeNull()
    expect(await getTestMediaDeliveryRecord(key)).toMatchObject({
      desired_state: 'allow',
      state: 'pending',
    })
    await publishLegacyImageDeliveryRecord(imageId, 'allow')
    const restored = edge.records.get(key)!
    expect(restored.state).toBe('allow')
    expect(BigInt(restored.generation)).toBeGreaterThan(BigInt(denied.generation))
  })

  it('does not invalidate or acknowledge when edge publication fails', async () => {
    const fixture = await createTestDeliverySurface()
    const edge = installTestMediaDeliveryEdge()
    edge.put.mockRejectedValueOnce(new Error('edge unavailable'))
    await expect(publishStagedMediaDeliveryRecord(fixture.deliveryKey)).rejects.toThrow(
      'edge unavailable',
    )
    expect(edge.invalidatePath).not.toHaveBeenCalled()
    expect(await getTestMediaDeliveryRecord(fixture.deliveryKey)).toMatchObject({
      state: 'pending',
    })
    await publishStagedMediaDeliveryRecord(fixture.deliveryKey)
    expect(await getTestMediaDeliveryRecord(fixture.deliveryKey)).toMatchObject({
      state: 'completed',
    })
  })

  it('rejects acknowledgement of a superseded generation without completing its successor', async () => {
    const fixture = await createTestDeliverySurface()
    const edge = installTestMediaDeliveryEdge()
    const captured = await stageImagePlacementDeliveryRecord({ ...fixture.tuple, state: 'allow' })
    const successor = await stageImagePlacementDeliveryRecord(
      { ...fixture.tuple, state: 'allow' },
      { forceGeneration: true },
    )
    await using transaction = await beginTransaction()
    await expect(
      publishPersistedDeliveryRecord(
        {
          delivery_key: fixture.deliveryKey,
          desired_state: 'allow',
          route_kind: 'placement',
          placement_id: fixture.tuple.placementId,
          placement_revision: fixture.tuple.revision,
          asset_id: fixture.tuple.imageId,
          generation: captured.generation,
        },
        transaction,
      ),
    ).rejects.toThrow('generation changed')
    expect(edge.invalidatePath).toHaveBeenCalledOnce()
    expect(await getTestMediaDeliveryRecord(fixture.deliveryKey)).toMatchObject({
      state: 'pending',
      desired_state: 'allow',
    })
    const current = await stageImagePlacementDeliveryRecord(
      { ...fixture.tuple, state: 'allow' },
      { query: transaction },
    )
    expect(current.generation).toBe(successor.generation)
    expect(BigInt(current.generation)).toBeGreaterThan(BigInt(captured.generation))
  })
})
