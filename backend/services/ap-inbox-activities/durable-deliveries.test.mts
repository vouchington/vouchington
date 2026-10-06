import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ageActivityPubInboxDeliveryReceivedAtForTest,
  getActivityPubInboxVerificationConstraintsForTest,
  makeActivityPubInboxDeliveryRecoverableForTest,
} from '@voucha/test-helpers'
import { activityPubInboxDeliveryTransitions } from './durable-delivery-transitions.mts'
import type { ActivityPubInboxEnvelope } from './durable-delivery-transition-contract.mts'
import {
  acceptTestDelivery as createActivityPubInboxDelivery,
  claimTestDelivery as claimActivityPubInboxDelivery,
  deferTestDelivery as deferActivityPubInboxDelivery,
  rejectTestDelivery as deleteActivityPubInboxDelivery,
  releaseTestDelivery as releaseActivityPubInboxDeliveryForRetry,
  verifyTestDelivery as markActivityPubInboxDeliveryVerified,
} from '@voucha/test-helpers/services/ap-inbox-activities/durable-delivery-transitions.test-support'
import { createRemoteActorFixture } from '@voucha/test-helpers/ap-inbox-activity-fixtures'

const claimRecoverableActivityPubInboxDeliveries = activityPubInboxDeliveryTransitions.recover

function makeEnvelope(): ActivityPubInboxEnvelope {
  const suffix = randomUUID()
  const actor = `https://${suffix}.example/users/alice`
  return {
    requestMethod: 'POST',
    requestTarget: `/ap/inbox?delivery=${suffix}`,
    expectedHost: 'voucha.example',
    signatureHeader: `keyId="${actor}#main-key",headers="(request-target) host date digest",signature="bytes"`,
    digestHeader: 'SHA-256=exact-digest',
    dateHeader: 'Thu, 01 Jan 2026 00:00:00 GMT',
    contentTypeHeader: 'application/activity+json',
    rawBody: Buffer.from([0, 1, 2, 255]),
    claimedActivityId: `${actor}/activities/${suffix}`,
    claimedActivityType: 'Create',
    claimedActorUri: actor,
    senderHostname: `${suffix}.example`,
  }
}

describe('durable ActivityPub inbox deliveries', () => {
  it('keeps verification timestamp and actor identity paired and restricts actor deletion', async () => {
    const constraints = await getActivityPubInboxVerificationConstraintsForTest()

    expect(constraints).toHaveLength(6)
    expect(
      constraints.find(
        constraint =>
          constraint.constraintName === 'activitypub_inbox_work_items__verified_actor_paired',
      )?.definition,
    ).toContain('(verified_at IS NULL) = (remote_actor_id IS NULL)')
    expect(
      constraints.find(
        constraint =>
          constraint.constraintName ===
          'activitypub_inbox_delivery_work_items_remote_actor_id_fkey',
      )?.deleteAction,
    ).toBe('RESTRICT')
    expect(
      constraints.find(
        constraint =>
          constraint.constraintName ===
          'activitypub_inbox_work_items__sender_requires_verification',
      )?.definition,
    ).toContain('sender_allowed_at IS NULL')
    expect(
      constraints.find(
        constraint =>
          constraint.constraintName === 'activitypub_inbox_work_items__deferral_state_valid',
      )?.definition,
    ).toContain('leased_at IS NULL')
    expect(
      constraints.find(
        constraint =>
          constraint.constraintName === 'activitypub_inbox_work_items__failure_state_valid',
      )?.definition,
    ).toContain('leased_at IS NOT NULL')
    expect(
      constraints.find(
        constraint =>
          constraint.constraintName ===
          'activitypub_inbox_work_items__terminal_diagnostics_present',
      )?.definition,
    ).toContain('last_error IS NOT NULL')
  })

  it('round-trips the exact request bytes, signed headers, and untrusted claims', async () => {
    const envelope = makeEnvelope()
    const created = await createActivityPubInboxDelivery(envelope)
    const claimed = await claimActivityPubInboxDelivery(created.deliveryId, created.leaseToken)

    expect(claimed).toMatchObject(envelope)
    expect(claimed?.rawBody.equals(envelope.rawBody)).toBe(true)
    expect(claimed?.remoteActorId).toBeNull()
    expect(claimed?.verifiedAt).toBeNull()
    expect(claimed?.senderAllowedAt).toBeNull()
    await deleteActivityPubInboxDelivery(created.deliveryId, created.leaseToken)
  })

  it('fences stale queue jobs by processing-attempt token', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())

    expect(await claimActivityPubInboxDelivery(created.deliveryId, randomUUID())).toBeNull()
    expect(
      await claimActivityPubInboxDelivery(created.deliveryId, created.leaseToken),
    ).not.toBeNull()
    await deleteActivityPubInboxDelivery(created.deliveryId, created.leaseToken)
  })

  it('allows exactly one concurrent claim for the same processing-attempt token', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())

    const claims = await Promise.all([
      claimActivityPubInboxDelivery(created.deliveryId, created.leaseToken),
      claimActivityPubInboxDelivery(created.deliveryId, created.leaseToken),
    ])

    expect(claims.filter(Boolean)).toHaveLength(1)
    await deleteActivityPubInboxDelivery(created.deliveryId, created.leaseToken)
  })

  it('allows a non-final retry after the active claim releases its lease', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())
    expect(
      await claimActivityPubInboxDelivery(created.deliveryId, created.leaseToken),
    ).not.toBeNull()

    expect(
      await releaseActivityPubInboxDeliveryForRetry(
        created.deliveryId,
        created.leaseToken,
        new Error('temporary failure'),
      ),
    ).toBe(true)
    expect(
      await claimActivityPubInboxDelivery(created.deliveryId, created.leaseToken),
    ).not.toBeNull()
    await deleteActivityPubInboxDelivery(created.deliveryId, created.leaseToken)
  })

  it('leases a recovered row so an immediate second recovery cannot rotate its token again', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())
    const unrelated = await createActivityPubInboxDelivery(makeEnvelope())
    await makeActivityPubInboxDeliveryRecoverableForTest(created.deliveryId, 'unstarted')
    await makeActivityPubInboxDeliveryRecoverableForTest(unrelated.deliveryId, 'unstarted')

    const selected = await claimRecoverableActivityPubInboxDeliveries([created.deliveryId])
    expect(selected.map(delivery => delivery.deliveryId)).toEqual([created.deliveryId])
    const first = selected[0]
    expect(first).toBeDefined()
    expect(
      (await claimRecoverableActivityPubInboxDeliveries([created.deliveryId])).some(
        delivery => delivery.deliveryId === created.deliveryId,
      ),
    ).toBe(false)
    const unrelatedRecovery = await claimRecoverableActivityPubInboxDeliveries([
      unrelated.deliveryId,
    ])
    expect(unrelatedRecovery.map(delivery => delivery.deliveryId)).toEqual([unrelated.deliveryId])
    if (first) await deleteActivityPubInboxDelivery(created.deliveryId, first.leaseToken)
    if (unrelatedRecovery[0])
      await deleteActivityPubInboxDelivery(unrelated.deliveryId, unrelatedRecovery[0].leaseToken)
  })

  it('rotates the fencing token when recovering a crashed processing lease', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())
    await makeActivityPubInboxDeliveryRecoverableForTest(created.deliveryId, 'stale')

    const recovered = (await claimRecoverableActivityPubInboxDeliveries([created.deliveryId])).find(
      delivery => delivery.deliveryId === created.deliveryId,
    )
    expect(recovered?.leaseToken).not.toBe(created.leaseToken)
    if (recovered) await deleteActivityPubInboxDelivery(created.deliveryId, recovered.leaseToken)
  })

  it('rotates the token and excludes a delivery until a sender deferral is due', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())
    const actor = await createRemoteActorFixture()
    await claimActivityPubInboxDelivery(created.deliveryId, created.leaseToken)
    await markActivityPubInboxDeliveryVerified(created.deliveryId, created.leaseToken, actor.id)
    const deferred = await deferActivityPubInboxDelivery(
      created.deliveryId,
      created.leaseToken,
      new Date(Date.now() + 60_000),
    )

    expect(deferred?.leaseToken).not.toBe(created.leaseToken)
    expect(
      await claimActivityPubInboxDelivery(created.deliveryId, deferred?.leaseToken ?? randomUUID()),
    ).toBeNull()
  })

  it('does not recover an old received row only one minute after its sender deferral is due', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())
    const actor = await createRemoteActorFixture()
    let cleanupAttemptId = created.leaseToken

    try {
      await claimActivityPubInboxDelivery(created.deliveryId, created.leaseToken)
      await markActivityPubInboxDeliveryVerified(created.deliveryId, created.leaseToken, actor.id)
      const deferred = await deferActivityPubInboxDelivery(
        created.deliveryId,
        created.leaseToken,
        new Date(Date.now() - 60_000),
      )
      expect(deferred).not.toBeNull()
      if (!deferred) return
      cleanupAttemptId = deferred.leaseToken
      await ageActivityPubInboxDeliveryReceivedAtForTest(created.deliveryId)

      const recovered = (
        await claimRecoverableActivityPubInboxDeliveries([created.deliveryId])
      ).find(delivery => delivery.deliveryId === created.deliveryId)
      if (recovered) cleanupAttemptId = recovered.leaseToken
      expect(recovered).toBeUndefined()
      expect(
        await claimActivityPubInboxDelivery(created.deliveryId, deferred.leaseToken),
      ).not.toBeNull()
    } finally {
      await deleteActivityPubInboxDelivery(created.deliveryId, cleanupAttemptId)
    }
  })

  it('recovers an old received row more than five minutes after its sender deferral is due', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())
    const actor = await createRemoteActorFixture()
    let cleanupAttemptId = created.leaseToken

    try {
      await claimActivityPubInboxDelivery(created.deliveryId, created.leaseToken)
      await markActivityPubInboxDeliveryVerified(created.deliveryId, created.leaseToken, actor.id)
      const deferred = await deferActivityPubInboxDelivery(
        created.deliveryId,
        created.leaseToken,
        new Date(Date.now() - 6 * 60_000),
      )
      expect(deferred).not.toBeNull()
      if (!deferred) return
      cleanupAttemptId = deferred.leaseToken
      await ageActivityPubInboxDeliveryReceivedAtForTest(created.deliveryId)

      const recovered = (
        await claimRecoverableActivityPubInboxDeliveries([created.deliveryId])
      ).find(delivery => delivery.deliveryId === created.deliveryId)
      expect(recovered).toBeDefined()
      if (!recovered) return
      cleanupAttemptId = recovered.leaseToken
      expect(recovered.leaseToken).not.toBe(deferred.leaseToken)
      expect(
        await claimActivityPubInboxDelivery(created.deliveryId, deferred.leaseToken),
      ).toBeNull()
      expect(
        await claimActivityPubInboxDelivery(created.deliveryId, recovered.leaseToken),
      ).not.toBeNull()
    } finally {
      await deleteActivityPubInboxDelivery(created.deliveryId, cleanupAttemptId)
    }
  })
})
