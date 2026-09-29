import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  getTestMediaDeliveryRecord,
  getTestMediaDeliveryRecordSnapshot,
  markTestMediaDeliveryRecordFailed,
} from '@voucha/test-helpers'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { advanceTestDeliveryPlacementRevision } from '@voucha/test-helpers/entities/media-delivery-repair'
import { fenceTestMediaDeliveryRegistry } from '@voucha/test-helpers/media-delivery-recovery'
import { createTestDeliverySurface } from '@voucha/test-helpers/media-delivery-surface'
import {
  processMediaDeliveryRegistryRecord,
  replayFailedMediaDeliveryRegistryRecords,
  stageCurrentImagePlacementDeliveryRecordsForImageIds,
  stageImagePlacementDeliveryRecord,
} from './index.mts'

type Edge = ReturnType<typeof installTestMediaDeliveryEdge>
type Fixture = Awaited<ReturnType<typeof createTestDeliverySurface>>

// A retained edge record that a freshly restored PostgreSQL row has never seen.
const EDGE_LEAD = 1_000_000n

async function registryGeneration(deliveryKey: string): Promise<bigint> {
  const snapshot = await getTestMediaDeliveryRecordSnapshot(deliveryKey)
  return BigInt(String(snapshot?.generation))
}

async function retainEdgeAhead(edge: Edge, deliveryKey: string, state: 'allow' | 'withheld') {
  const record = {
    deliveryKey,
    state,
    generation: String((await registryGeneration(deliveryKey)) + EDGE_LEAD),
  }
  edge.records.set(deliveryKey, record)
  return record
}

async function publishedSurface(): Promise<Fixture> {
  const fixture = await createTestDeliverySurface()
  await processMediaDeliveryRegistryRecord(fixture.deliveryKey)
  return fixture
}

describe('coordinated reset and restore generation safety', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('never lets a restored generation overwrite the retained edge, and replay cannot fix it', async () => {
    const edge = installTestMediaDeliveryEdge()
    const { deliveryKey } = await createTestDeliverySurface()
    const retained = await retainEdgeAhead(edge, deliveryKey, 'withheld')
    const restoredGeneration = await registryGeneration(deliveryKey)

    await expect(processMediaDeliveryRegistryRecord(deliveryKey)).rejects.toThrow(
      'Stale edge generation',
    )
    expect(edge.records.get(deliveryKey)).toEqual(retained)
    expect(edge.invalidatePath).not.toHaveBeenCalled()
    expect(await getTestMediaDeliveryRecordSnapshot(deliveryKey)).toMatchObject({
      state: 'pending',
      failure_message: 'Stale edge generation',
    })

    await markTestMediaDeliveryRecordFailed(deliveryKey)
    await expect(
      replayFailedMediaDeliveryRegistryRecords({ deliveryKeys: [deliveryKey] }),
    ).resolves.toBe(1)
    await expect(processMediaDeliveryRegistryRecord(deliveryKey)).rejects.toThrow(
      'Stale edge generation',
    )
    expect(edge.records.get(deliveryKey)).toEqual(retained)
    expect(await registryGeneration(deliveryKey)).toBe(restoredGeneration)
  })

  it('publishes a tightened state above the retained generation only after the fence', async () => {
    const edge = installTestMediaDeliveryEdge()
    const { tuple, deliveryKey } = await publishedSurface()
    await stageImagePlacementDeliveryRecord({ ...tuple, state: 'withheld' })
    const retained = await retainEdgeAhead(edge, deliveryKey, 'allow')

    await fenceTestMediaDeliveryRegistry({
      edgeHighWater: retained.generation,
      reopenDeliveryKeys: [deliveryKey],
    })
    await expect(processMediaDeliveryRegistryRecord(deliveryKey)).resolves.toBe('completed')

    const published = edge.records.get(deliveryKey)
    expect(published?.state).toBe('withheld')
    expect(BigInt(published!.generation)).toBeGreaterThan(BigInt(retained.generation))
    expect(edge.invalidatePath).toHaveBeenCalledWith(
      `/images/placements/${tuple.placementId}/${tuple.revision}/${tuple.imageId}`,
    )
    expect(await getTestMediaDeliveryRecordSnapshot(deliveryKey)).toMatchObject({
      state: 'completed',
      desired_state: 'withheld',
      generation: Number(published!.generation),
      projected_at: expect.any(String),
      invalidated_at: expect.any(String),
    })
  })

  it('holds a withheld edge denial only while paused: a later fresh generation republishes the restored allow', async () => {
    const edge = installTestMediaDeliveryEdge()
    const held = await publishedSurface()
    const denial = await retainEdgeAhead(edge, held.deliveryKey, 'withheld')
    await fenceTestMediaDeliveryRegistry({
      edgeHighWater: denial.generation,
      reopenDeliveryKeys: [],
    })

    // Restored authority still says allow, yet nothing reopens the completed row while paused.
    await expect(
      stageCurrentImagePlacementDeliveryRecordsForImageIds([held.tuple.imageId]),
    ).resolves.toBe(0)
    await expect(processMediaDeliveryRegistryRecord(held.deliveryKey)).resolves.toBe('not_claimed')
    expect(edge.records.get(held.deliveryKey)).toEqual(denial)

    // Any later fresh generation (repair marker, owner change, republish) now beats the lifted fence.
    await fenceTestMediaDeliveryRegistry({ reopenDeliveryKeys: [held.deliveryKey] })
    await expect(processMediaDeliveryRegistryRecord(held.deliveryKey)).resolves.toBe('completed')
    expect(edge.records.get(held.deliveryKey)?.state).toBe('allow')
  })

  it('keeps a held key withheld through republish once authority withholds it again', async () => {
    const edge = installTestMediaDeliveryEdge()
    const held = await publishedSurface()
    const denial = await retainEdgeAhead(edge, held.deliveryKey, 'withheld')
    await fenceTestMediaDeliveryRegistry({
      edgeHighWater: denial.generation,
      reopenDeliveryKeys: [],
    })

    // Re-apply the lost takedown through authority, then let reconciliation stage the result.
    await using transaction = await beginTransaction()
    await advanceTestDeliveryPlacementRevision(transaction, held.tuple.placementId)
    await transaction.commit()
    await expect(
      stageCurrentImagePlacementDeliveryRecordsForImageIds([held.tuple.imageId]),
    ).resolves.toBeGreaterThan(0)
    await expect(processMediaDeliveryRegistryRecord(held.deliveryKey)).resolves.toBe('completed')

    const published = edge.records.get(held.deliveryKey)
    expect(published?.state).toBe('withheld')
    expect(BigInt(published!.generation)).toBeGreaterThan(BigInt(denial.generation))

    await fenceTestMediaDeliveryRegistry({ reopenDeliveryKeys: [held.deliveryKey] })
    await expect(processMediaDeliveryRegistryRecord(held.deliveryKey)).resolves.toBe('completed')
    expect(edge.records.get(held.deliveryKey)?.state).toBe('withheld')
  })

  it('needs an explicit reopen before a rebuilt empty edge serves a completed row', async () => {
    const edge = installTestMediaDeliveryEdge()
    const { tuple, deliveryKey } = await publishedSurface()
    edge.records.clear()

    await expect(
      stageCurrentImagePlacementDeliveryRecordsForImageIds([tuple.imageId]),
    ).resolves.toBe(0)
    await expect(processMediaDeliveryRegistryRecord(deliveryKey)).resolves.toBe('not_claimed')
    expect(edge.records.has(deliveryKey)).toBe(false)

    await fenceTestMediaDeliveryRegistry({ reopenDeliveryKeys: [deliveryKey] })
    await expect(processMediaDeliveryRegistryRecord(deliveryKey)).resolves.toBe('completed')
    expect(edge.records.get(deliveryKey)).toEqual({
      deliveryKey,
      state: 'allow',
      generation: String(await registryGeneration(deliveryKey)),
    })
  })

  it('keeps a retained pre-reset edge allow in force beside independent fresh keys', async () => {
    const edge = installTestMediaDeliveryEdge()
    const staleKey = `image-placement:${crypto.randomUUID()}:1:${crypto.randomUUID()}`
    const stale = { deliveryKey: staleKey, state: 'allow' as const, generation: '9000000000' }
    edge.records.set(staleKey, stale)

    const { deliveryKey } = await publishedSurface()

    expect(deliveryKey).not.toBe(staleKey)
    expect(edge.records.get(deliveryKey)?.state).toBe('allow')
    expect(edge.records.get(staleKey)).toEqual(stale)
    expect(await getTestMediaDeliveryRecord(staleKey)).toBeNull()
  })
})
