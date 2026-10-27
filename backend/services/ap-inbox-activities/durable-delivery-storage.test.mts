import { describe, expect, it } from 'vitest'
import { createActivityPubInboxEnvelope } from '@voucha/test-helpers/activitypub-inbox-contract-fixtures'
import {
  acceptTestDelivery,
  registerActivityPubInboxAdmission,
} from '@voucha/test-helpers/activitypub-inbox-transitions'
import { ACTIVITYPUB_INBOX_STORAGE_POLICY } from '@modules/activitypub-inbox-storage-policy'
import {
  ageActivityPubInboxCleanupFixturesForTest,
  expireActivityPubInboxDeliveryForTest,
  getActivityPubInboxRetentionStateForTest,
  getActivityPubInboxStorageTriggerDefinitionsForTest,
  getExistingActivityPubInboxDeliveryIdsForTest,
  makeActivityPubInboxFailureExpiredForTest,
  measureActivityPubInboxOwnedStorageCounterForTest,
} from '@voucha/test-helpers'
import { activityPubInboxDeliveryTransitions, expireActivityPubInboxDeliveries } from './index.mts'
import { createRemoteActorFixture } from '@voucha/test-helpers/ap-inbox-activity-fixtures'

registerActivityPubInboxAdmission()

describe('ActivityPub inbox durable storage bounds', () => {
  it('adds owned raw-body bytes to the storage counter and removes them on delete', async () => {
    const firstBody = Buffer.from('one')
    const secondBody = Buffer.from('second')
    const rawBodyBytes = firstBody.byteLength + secondBody.byteLength
    const measured = await measureActivityPubInboxOwnedStorageCounterForTest('insert-delete', [
      firstBody,
      secondBody,
    ])

    expect(measured.afterOwnedWrite).toEqual({
      retainedRows: measured.before.retainedRows + 2,
      retainedRawBodyBytes: measured.before.retainedRawBodyBytes + rawBodyBytes,
      unverifiedRows: measured.before.unverifiedRows + 2,
      unverifiedRawBodyBytes: measured.before.unverifiedRawBodyBytes + rawBodyBytes,
    })
    expect(measured.afterScenario).toEqual(measured.before)
  })

  it('rejects only writes that would increase an exceeded unverified capacity dimension', async () => {
    const { updateDefinition: definition } =
      await getActivityPubInboxStorageTriggerDefinitionsForTest()

    expect(definition).toContain('unverified_rows_delta <= 0')
    expect(definition).toContain('unverified_bytes_delta <= 0')
    expect(definition).not.toContain('pg_advisory')
  })

  it('serializes capacity decisions through the singleton counter row', async () => {
    const definitions = await getActivityPubInboxStorageTriggerDefinitionsForTest()

    expect(definitions.insertDefinition).toContain(
      'UPDATE activitypub_inbox_delivery_storage_counters',
    )
    expect(definitions.updateDefinition).toContain(
      'UPDATE activitypub_inbox_delivery_storage_counters',
    )
  })

  it('assigns one-hour retention to never-failed unverified intake and clears it on verification', async () => {
    const envelope = createActivityPubInboxEnvelope()
    const delivery = await acceptTestDelivery(envelope)
    const initial = await getActivityPubInboxRetentionStateForTest(delivery.deliveryId)
    if (!initial.retention_expires_at) throw new Error('Expected unverified retention deadline')
    expect(initial.retention_expires_at.getTime() - initial.received_at.getTime()).toBe(
      ACTIVITYPUB_INBOX_STORAGE_POLICY.unverifiedRetentionMs,
    )

    const actor = await createRemoteActorFixture()
    const measured = await measureActivityPubInboxOwnedStorageCounterForTest(
      'verify',
      [envelope.rawBody],
      actor.id,
    )
    expect(measured.afterOwnedWrite).toEqual({
      retainedRows: measured.before.retainedRows + 1,
      retainedRawBodyBytes: measured.before.retainedRawBodyBytes + envelope.rawBody.byteLength,
      unverifiedRows: measured.before.unverifiedRows + 1,
      unverifiedRawBodyBytes: measured.before.unverifiedRawBodyBytes + envelope.rawBody.byteLength,
    })
    expect(measured.afterScenario).toEqual({
      retainedRows: measured.afterOwnedWrite.retainedRows,
      retainedRawBodyBytes: measured.afterOwnedWrite.retainedRawBodyBytes,
      unverifiedRows: measured.before.unverifiedRows,
      unverifiedRawBodyBytes: measured.before.unverifiedRawBodyBytes,
    })

    await activityPubInboxDeliveryTransitions.verify(delivery.deliveryId, actor.id)

    expect(
      (await getActivityPubInboxRetentionStateForTest(delivery.deliveryId)).retention_expires_at,
    ).toBeNull()
  })

  it('records the first operational failure and preserves its sticky deadline through rearm', async () => {
    const actor = await createRemoteActorFixture()
    const delivery = await acceptTestDelivery(createActivityPubInboxEnvelope(), actor.id)
    await activityPubInboxDeliveryTransitions.exhaust(delivery.deliveryId, new Error('failed'))
    const failed = await getActivityPubInboxRetentionStateForTest(delivery.deliveryId)

    const rearmed = (await activityPubInboxDeliveryTransitions.rearm([delivery.deliveryId])).find(
      candidate => candidate.deliveryId === delivery.deliveryId,
    )
    expect(rearmed?.deliveryId).toBe(delivery.deliveryId)
    const afterRearm = await getActivityPubInboxRetentionStateForTest(delivery.deliveryId)
    expect(afterRearm.first_failed_at).toEqual(failed.first_failed_at)
    expect(afterRearm.retention_expires_at).toEqual(failed.retention_expires_at)
  })

  it('prevents expired deliveries from load, recovery, and rearm', async () => {
    const delivery = await acceptTestDelivery(createActivityPubInboxEnvelope())
    await expireActivityPubInboxDeliveryForTest(delivery.deliveryId)

    expect(await activityPubInboxDeliveryTransitions.load(delivery.deliveryId)).toEqual({
      outcome: 'stale',
    })
    expect(
      await activityPubInboxDeliveryTransitions.recover([delivery.deliveryId]),
    ).not.toContainEqual(expect.objectContaining({ deliveryId: delivery.deliveryId }))

    await makeActivityPubInboxFailureExpiredForTest(delivery.deliveryId)
    expect(
      await activityPubInboxDeliveryTransitions.rearm([delivery.deliveryId]),
    ).not.toContainEqual(expect.objectContaining({ deliveryId: delivery.deliveryId }))
  })

  it('deletes expired rows in deterministic bounded batches', async () => {
    const active = await acceptTestDelivery(createActivityPubInboxEnvelope())
    const stale = await acceptTestDelivery(createActivityPubInboxEnvelope())
    const idle = await acceptTestDelivery(createActivityPubInboxEnvelope())
    const foreign = await acceptTestDelivery(createActivityPubInboxEnvelope())
    await ageActivityPubInboxCleanupFixturesForTest(
      active.deliveryId,
      stale.deliveryId,
      idle.deliveryId,
    )
    await expireActivityPubInboxDeliveryForTest(foreign.deliveryId)
    await makeActivityPubInboxFailureExpiredForTest(foreign.deliveryId)
    const ownedIds = [active.deliveryId, stale.deliveryId, idle.deliveryId]

    expect(await expireActivityPubInboxDeliveries('unverified', 2, ownedIds)).toMatchObject({
      deletedRows: 2,
    })
    const remaining = await getExistingActivityPubInboxDeliveryIdsForTest([
      ...ownedIds,
      foreign.deliveryId,
    ])
    expect(remaining).toContain(foreign.deliveryId)
    expect(remaining.filter(id => ownedIds.includes(id))).toHaveLength(1)
  })

  it('rolls the storage counter back with the owned insert', async () => {
    const rawBody = Buffer.from('rollback')
    const measured = await measureActivityPubInboxOwnedStorageCounterForTest('rollback', [rawBody])

    expect(measured.afterOwnedWrite).toEqual({
      retainedRows: measured.before.retainedRows + 1,
      retainedRawBodyBytes: measured.before.retainedRawBodyBytes + rawBody.byteLength,
      unverifiedRows: measured.before.unverifiedRows + 1,
      unverifiedRawBodyBytes: measured.before.unverifiedRawBodyBytes + rawBody.byteLength,
    })
    expect(measured.afterScenario).toEqual(measured.before)
  })
})
