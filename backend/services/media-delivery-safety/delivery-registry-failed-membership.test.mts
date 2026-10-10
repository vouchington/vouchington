import { describe, expect, it } from 'vitest'
import {
  membership,
  rollbackMediaReplayMembership,
  rejectOldGenerationMediaReplayMembership,
  regenerateMediaReplayMembership,
  completeMediaReplayMembership,
  appendLowerUuidMediaDeliveryTransition,
  claimTestMediaDeliveryMembership,
} from '@voucha/test-helpers/media-delivery-membership-fixtures'
import {
  createFailedMediaDeliveryReplayFixture,
  useTestMediaDeliveryReplayProviders,
} from '@voucha/test-helpers/copyright-route-replay-setup'
import {
  getTestMediaDeliveryRecordSnapshot,
  getTestMediaDeliveryTransitionHistory,
} from '@voucha/test-helpers/entities/media-delivery-retry'
import { processMediaDeliveryRegistryRecord } from './delivery-registry-process.mts'
import { replayFailedMediaDeliveryRegistryRecords } from './delivery-registry-reconciliation.mts'
import {
  getMediaDeliveryRegistryScanBefore,
  listRecoverableMediaDeliveryRegistryIds,
} from './delivery-registry-recovery-scan.mts'

describe('derived media replay membership', () => {
  useTestMediaDeliveryReplayProviders()
  it('makes a lower-UUID completion current and removes its projection work', async () => {
    const fixture = await createFailedMediaDeliveryReplayFixture()
    const id = fixture.mediaDeliveryRegistryRecordId
    await replayFailedMediaDeliveryRegistryRecords({
      actorUserId: fixture.moderator.id,
      recordIds: [id],
    })
    const claim = await claimTestMediaDeliveryMembership(id)
    expect((await membership(id))[0]).toMatchObject({ lease_token: claim.lease_token })
    const before = await getTestMediaDeliveryRecordSnapshot(id)
    const history = await getTestMediaDeliveryTransitionHistory(id)
    const completion = await appendLowerUuidMediaDeliveryTransition(id, 'completed')
    expect(completion.id.localeCompare(String(before!.latest_change_id))).toBeLessThan(0)
    expect(await getTestMediaDeliveryRecordSnapshot(id)).toMatchObject({
      latest_change_id: completion.id,
      generation: before!.generation,
      desired_state: before!.desired_state,
      state: 'completed',
    })
    expect(await membership(id)).toEqual([])
    expect(await getTestMediaDeliveryTransitionHistory(id)).toEqual([
      {
        generation: claim.generation,
        desired_state: before!.desired_state,
        change_type: 'completed',
      },
      ...history,
    ])
    expect(await processMediaDeliveryRegistryRecord(id)).toBe('not_claimed')
  })
  it('makes a lower-UUID actor replay current and eligible for normal publication', async () => {
    const fixture = await createFailedMediaDeliveryReplayFixture()
    const id = fixture.mediaDeliveryRegistryRecordId
    const before = await getTestMediaDeliveryRecordSnapshot(id)
    const replay = await appendLowerUuidMediaDeliveryTransition(id, 'pending', fixture.moderator.id)
    expect(replay.id.localeCompare(String(before!.latest_change_id))).toBeLessThan(0)
    expect(replay.changed_by_id).toBe(fixture.moderator.id)
    expect(await getTestMediaDeliveryRecordSnapshot(id)).toMatchObject({
      latest_change_id: replay.id,
      state: 'pending',
      generation: before!.generation,
    })
    expect((await membership(id))[0]).toMatchObject({
      failed_change_id: null,
      lease_token: null,
      attempt_count: 0,
    })
    expect(await processMediaDeliveryRegistryRecord(id)).toBe('completed')
    expect(await getTestMediaDeliveryRecordSnapshot(id)).toMatchObject({ state: 'completed' })
    expect(await membership(id)).toEqual([])
  })
  it('retains the exact failed transition without making it normal recovery work', async () => {
    const fixture = await createFailedMediaDeliveryReplayFixture()
    const id = fixture.mediaDeliveryRegistryRecordId
    const snapshot = await getTestMediaDeliveryRecordSnapshot(id)
    const before = await membership(id)
    expect(before).toHaveLength(1)
    expect(before[0]).toMatchObject({
      failed_change_id: snapshot!.latest_change_id,
      lease_token: null,
    })
    expect(await processMediaDeliveryRegistryRecord(id)).toBe('not_claimed')
    const recoverable = await listRecoverableMediaDeliveryRegistryIds({
      limit: 1,
      scanBefore: await getMediaDeliveryRegistryScanBefore(),
      recordIds: [id],
    })
    expect(recoverable.results).toEqual([])
    expect(
      await replayFailedMediaDeliveryRegistryRecords({
        actorUserId: fixture.moderator.id,
        recordIds: [id],
      }),
    ).toMatchObject({ replayed: 1 })
    expect((await membership(id))[0]).toMatchObject({ failed_change_id: null, attempt_count: 0 })
  })
  it('rolls back replay membership and rejects acknowledgements from an older generation', async () => {
    const fixture = await createFailedMediaDeliveryReplayFixture()
    const id = fixture.mediaDeliveryRegistryRecordId
    const before = await membership(id)
    const snapshot = await getTestMediaDeliveryRecordSnapshot(id)
    const history = await getTestMediaDeliveryTransitionHistory(id)
    expect(await rollbackMediaReplayMembership(id)).toBeNull()
    expect(await membership(id)).toEqual(before)
    expect(await getTestMediaDeliveryRecordSnapshot(id)).toEqual(snapshot)
    expect(await getTestMediaDeliveryTransitionHistory(id)).toEqual(history)
    const stale = await rejectOldGenerationMediaReplayMembership(id)
    expect(stale.rowCount).toBe(0)
    expect(await membership(id)).toEqual(before)
  })
  it('clears failed membership on a new generation and removes it on current completion', async () => {
    const fixture = await createFailedMediaDeliveryReplayFixture()
    const id = fixture.mediaDeliveryRegistryRecordId
    expect((await membership(id))[0]!.failed_change_id).not.toBeNull()
    await regenerateMediaReplayMembership(id)
    expect((await membership(id))[0]).toMatchObject({ failed_change_id: null, attempt_count: 0 })
    await completeMediaReplayMembership(id)
    expect(await membership(id)).toEqual([])
  })
})
