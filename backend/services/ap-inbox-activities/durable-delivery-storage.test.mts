import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { ACTIVITYPUB_INBOX_STORAGE_POLICY } from '@modules/activitypub-inbox-storage-policy'
import {
  ageActivityPubInboxCleanupFixturesForTest,
  cleanupActivityPubInboxStorageFixturesForTest,
  expireActivityPubInboxDeliveryForTest,
  getActivityPubInboxRetentionStateForTest,
  getActivityPubInboxStorageTriggerDefinitionsForTest,
  getExistingActivityPubInboxDeliveryIdsForTest,
  makeActivityPubInboxFailureExpiredForTest,
  measureActivityPubInboxOwnedStorageCounterForTest,
} from '@voucha/test-helpers'
import {
  activityPubInboxDeliveryTransitions,
  expireActivityPubInboxDeliveries,
  type ActivityPubInboxEnvelope,
} from './index.mts'
import { createRemoteActorFixture } from '@voucha/test-helpers/ap-inbox-activity-fixtures'
import { runIsolatedDatabaseCase } from '../../../test-helpers/vitest-isolated-database-case.mts'
import { getIsolatedDatabaseCaseMode } from '../../../test-helpers/vitest-isolated-database-cases.mts'

const ownedActivityIds = new Set<string>()

describe('ActivityPub inbox durable storage bounds', () => {
  afterEach(async () => {
    if (ownedActivityIds.size === 0) return
    await cleanupActivityPubInboxStorageFixturesForTest([...ownedActivityIds])
    ownedActivityIds.clear()
  })

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
    const envelope = makeEnvelope()
    const delivery = await accept(envelope)
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

    await activityPubInboxDeliveryTransitions.claim(
      delivery.deliveryId,
      delivery.processingAttemptId,
    )
    await activityPubInboxDeliveryTransitions.verify(
      delivery.deliveryId,
      delivery.processingAttemptId,
      actor.id,
    )

    expect(
      (await getActivityPubInboxRetentionStateForTest(delivery.deliveryId)).retention_expires_at,
    ).toBeNull()
  })

  it('records the first operational failure and preserves its sticky deadline through rearm', async () => {
    const actor = await createRemoteActorFixture()
    const delivery = await accept(makeEnvelope(), actor.id)
    await activityPubInboxDeliveryTransitions.claim(
      delivery.deliveryId,
      delivery.processingAttemptId,
    )
    await activityPubInboxDeliveryTransitions.exhaust(
      delivery.deliveryId,
      delivery.processingAttemptId,
      new Error('failed'),
    )
    const failed = await getActivityPubInboxRetentionStateForTest(delivery.deliveryId)

    const rearmed = (await activityPubInboxDeliveryTransitions.rearm([delivery.deliveryId])).find(
      candidate => candidate.deliveryId === delivery.deliveryId,
    )
    expect(rearmed?.deliveryId).toBe(delivery.deliveryId)
    const afterRearm = await getActivityPubInboxRetentionStateForTest(delivery.deliveryId)
    expect(afterRearm.first_failed_at).toEqual(failed.first_failed_at)
    expect(afterRearm.retention_expires_at).toEqual(failed.retention_expires_at)
  })

  it('prevents expired deliveries from claim, recovery, and rearm', async () => {
    const delivery = await accept(makeEnvelope())
    await expireActivityPubInboxDeliveryForTest(delivery.deliveryId)

    expect(
      await activityPubInboxDeliveryTransitions.claim(
        delivery.deliveryId,
        delivery.processingAttemptId,
      ),
    ).toEqual({ outcome: 'stale' })
    expect(
      await activityPubInboxDeliveryTransitions.recover([delivery.deliveryId]),
    ).not.toContainEqual(expect.objectContaining({ deliveryId: delivery.deliveryId }))

    await makeActivityPubInboxFailureExpiredForTest(delivery.deliveryId)
    expect(
      await activityPubInboxDeliveryTransitions.rearm([delivery.deliveryId]),
    ).not.toContainEqual(expect.objectContaining({ deliveryId: delivery.deliveryId }))
  })

  it('deletes expired rows in deterministic lease-aware locked batches', async () => {
    if (getIsolatedDatabaseCaseMode('activitypub-expiry') === 'parent') {
      await runIsolatedDatabaseCase('activitypub-expiry')
      return
    }
    const active = await accept(makeEnvelope())
    const stale = await accept(makeEnvelope())
    const idle = await accept(makeEnvelope())
    await ageActivityPubInboxCleanupFixturesForTest(
      active.deliveryId,
      stale.deliveryId,
      idle.deliveryId,
    )

    expect(await expireActivityPubInboxDeliveries('unverified', 2)).toMatchObject({
      deletedRows: 2,
    })
    expect(
      await getExistingActivityPubInboxDeliveryIdsForTest([
        active.deliveryId,
        stale.deliveryId,
        idle.deliveryId,
      ]),
    ).toEqual([active.deliveryId])
  }, 240_000)

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

async function accept(envelope: ActivityPubInboxEnvelope, remoteActorId?: string) {
  ownedActivityIds.add(envelope.claimedActivityId)
  const result = await activityPubInboxDeliveryTransitions.accept(envelope, remoteActorId)
  if (result.outcome !== 'applied') throw new Error('Test delivery unexpectedly exceeded capacity')
  return result.value
}

function makeEnvelope(rawBody = Buffer.from('body')): ActivityPubInboxEnvelope {
  const suffix = randomUUID()
  const actor = `https://${suffix}.example/users/alice`
  return {
    requestMethod: 'POST',
    requestTarget: `/ap/inbox?delivery=${suffix}`,
    expectedHost: 'voucha.example',
    signatureHeader: 'signature',
    digestHeader: 'digest',
    dateHeader: new Date().toUTCString(),
    rawBody,
    claimedActivityId: `${actor}/activities/${suffix}`,
    claimedActivityType: 'Create',
    claimedActorUri: actor,
    senderHostname: `${suffix}.example`,
  }
}
