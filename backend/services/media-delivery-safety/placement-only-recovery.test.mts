import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  createTestUserDirect,
  getTestMediaDeliveryRecord,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { createTestDeliverySurface } from '@voucha/test-helpers/media-delivery-surface'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import {
  advanceTestDeliveryPlacementRevision,
  getTestDeliveryRepairMarker,
  reconcileTestDeliveryRepairMarker,
} from '@voucha/test-helpers/entities/media-delivery-repair'
import {
  insertTestPlacementRepairKey,
  getTestPlacementRepairForeignKey,
  readTestPlacementDeliveryColumns,
} from '@voucha/test-helpers/entities/placement-delivery-schema'
import { getImagePlacementDeliveryKey } from './delivery-registry-types.mts'
import {
  processMediaDeliveryRegistryRecord,
  prepublishImagePlacementDenial,
  publishStagedMediaDeliveryRecord,
  stageImagePlacementDeliveryRecord,
} from './index.mts'
import { recordImageDeliveryRepairMarker } from './delivery-repair-markers.mts'

describe('concrete image placement recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('leaves no repair marker or allow after its first registry insert rolls back', async () => {
    const user = await createTestUserDirect()
    const [postId, imageId] = await Promise.all([
      insertTestPost({
        title: 'image recovery',
        slug: crypto.randomUUID(),
        createdById: user.id,
        markdown: 'image',
      }),
      insertTestImage(user.id),
    ])
    await insertTestPostImage({ postId, imageId })
    const binding = await getTestPostImagePlacement(postId, imageId)
    if (!binding) throw new Error('Committed placement missing')
    const tuple = {
      placementId: binding.placement_id,
      revision: binding.placement_revision,
      imageId,
    }
    const key = getImagePlacementDeliveryKey(tuple)
    expect(await getTestMediaDeliveryRecord(key)).toBeNull()
    const edge = installTestMediaDeliveryEdge()
    {
      await using transaction = await beginTransaction()
      await prepublishImagePlacementDenial({ ...tuple }, { query: transaction })
    }
    expect(await getTestMediaDeliveryRecord(key)).toBeNull()
    expect(await getTestDeliveryRepairMarker(key)).toBeNull()
    expect(edge.records.get(key)?.state).toBe('withheld')
    expect(edge.put.mock.calls.every(([record]) => record.state === 'withheld')).toBe(true)

    {
      await using transaction = await beginTransaction()
      await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' }, { query: transaction })
      await expect(publishStagedMediaDeliveryRecord(key)).rejects.toThrow('Missing staged')
      expect(edge.records.get(key)?.state).toBe('withheld')
    }
    expect(await getTestMediaDeliveryRecord(key)).toBeNull()
    expect(await getTestDeliveryRepairMarker(key)).toBeNull()
    const deniedGeneration = edge.records.get(key)!.generation
    {
      await using transaction = await beginTransaction()
      await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' }, { query: transaction })
      await transaction.commit()
    }
    await publishStagedMediaDeliveryRecord(key)
    expect(edge.records.get(key)?.state).toBe('allow')
    expect(BigInt(edge.records.get(key)!.generation)).toBeGreaterThan(BigInt(deniedGeneration))
    expect(await getTestMediaDeliveryRecord(key)).toMatchObject({
      desired_state: 'allow',
      state: 'completed',
    })
  })

  it('skips a key whose image belongs to a different placement without inserting a marker', async () => {
    const [first, sibling] = await Promise.all([
      createTestDeliverySurface(),
      createTestDeliverySurface(),
    ])
    const tuple = { ...first.tuple, imageId: sibling.tuple.imageId }
    const key = getImagePlacementDeliveryKey(tuple)
    const edge = installTestMediaDeliveryEdge()
    await recordImageDeliveryRepairMarker(tuple)
    expect(edge.put).not.toHaveBeenCalled()
    expect(await getTestMediaDeliveryRecord(key)).toBeNull()
    expect(await getTestDeliveryRepairMarker(key)).toBeNull()
  })

  it('denies a historical revision without substituting the current revision', async () => {
    const fixture = await createTestDeliverySurface()
    const edge = installTestMediaDeliveryEdge()
    await using transaction = await beginTransaction()
    await advanceTestDeliveryPlacementRevision(transaction, fixture.tuple.placementId)
    await transaction.commit()
    await recordImageDeliveryRepairMarker(fixture.tuple)
    await reconcileTestDeliveryRepairMarker(fixture.deliveryKey)
    expect(await getTestMediaDeliveryRecord(fixture.deliveryKey)).toMatchObject({
      desired_state: 'withheld',
    })
    await processMediaDeliveryRegistryRecord(fixture.deliveryKey)
    expect(edge.records.get(fixture.deliveryKey)?.state).toBe('withheld')
  })

  it('stores only the canonical delivery key and wakeup token, not owner tuple snapshots', async () => {
    const columns = await readTestPlacementDeliveryColumns()
    expect(columns.media_delivery_repair_markers).toEqual([
      'delivery_key',
      'marker_token',
      'created_at',
      'updated_at',
    ])
    expect(columns.media_delivery_registry_records).toContain('image_id')
    expect(columns.media_delivery_registry_records).not.toContain('asset_id')
    expect(columns.media_delivery_registry_records).not.toContain('route_kind')
    expect(columns.media_delivery_registry_records).not.toContain('media_kind')
    expect(columns.media_placements).not.toContain('placement_kind')
    expect(await getTestPlacementRepairForeignKey()).toEqual({
      parent_table: 'media_delivery_registry_records',
      delete_action: 'r',
    })
  })

  it('rejects orphan image and placement parents in the authoritative outbox', async () => {
    const fixture = await createTestDeliverySurface()
    await expect(
      stageImagePlacementDeliveryRecord({
        ...fixture.tuple,
        imageId: crypto.randomUUID(),
        state: 'allow',
      }),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      stageImagePlacementDeliveryRecord({
        ...fixture.tuple,
        placementId: crypto.randomUUID(),
        state: 'allow',
      }),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('rejects repair keys without a committed registry parent', async () => {
    const fixture = await createTestDeliverySurface()
    await expect(
      insertTestPlacementRepairKey(fixture.deliveryKey.toUpperCase()),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      insertTestPlacementRepairKey(
        getImagePlacementDeliveryKey({
          ...fixture.tuple,
          revision: 2147483648,
        }),
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })
})
