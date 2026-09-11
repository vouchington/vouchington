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
  exhaustTestDelivery as markActivityPubInboxDeliveryFailed,
  rejectTestDelivery as deleteActivityPubInboxDelivery,
  releaseTestDelivery as releaseActivityPubInboxDeliveryForRetry,
  verifyTestDelivery as markActivityPubInboxDeliveryVerified,
} from './durable-delivery-transitions.test-support.mts'
import { createRemoteActorFixture } from './test-fixtures.mts'

const claimRecoverableActivityPubInboxDeliveries = activityPubInboxDeliveryTransitions.recover
const rearmFailedActivityPubInboxDeliveries = activityPubInboxDeliveryTransitions.rearm

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
        constraint => constraint.constraintName === 'ap_inbox_deliveries__verified_actor_paired',
      )?.definition,
    ).toContain('(verified_at IS NULL) = (remote_actor_id IS NULL)')
    expect(
      constraints.find(
        constraint => constraint.constraintName === 'ap_inbox_deliveries_remote_actor_id_fkey',
      )?.deleteAction,
    ).toBe('RESTRICT')
    expect(
      constraints.find(
        constraint =>
          constraint.constraintName ===
          'ap_inbox_deliveries__sender_admission_requires_verification',
      )?.definition,
    ).toContain('sender_allowed_at IS NULL')
    expect(
      constraints.find(
        constraint => constraint.constraintName === 'ap_inbox_deliveries__deferral_state_valid',
      )?.definition,
    ).toContain('processing_at IS NULL')
    expect(
      constraints.find(
        constraint => constraint.constraintName === 'ap_inbox_deliveries__failure_state_valid',
      )?.definition,
    ).toContain('processing_at IS NOT NULL')
    expect(
      constraints.find(
        constraint =>
          constraint.constraintName === 'ap_inbox_deliveries__terminal_diagnostics_present',
      )?.definition,
    ).toContain('last_error IS NOT NULL')
  })

  it('round-trips the exact request bytes, signed headers, and untrusted claims', async () => {
    const envelope = makeEnvelope()
    const created = await createActivityPubInboxDelivery(envelope)
    const claimed = await claimActivityPubInboxDelivery(
      created.deliveryId,
      created.processingAttemptId,
    )

    expect(claimed).toMatchObject(envelope)
    expect(claimed?.rawBody.equals(envelope.rawBody)).toBe(true)
    expect(claimed?.remoteActorId).toBeNull()
    expect(claimed?.verifiedAt).toBeNull()
    expect(claimed?.senderAllowedAt).toBeNull()
    await deleteActivityPubInboxDelivery(created.deliveryId, created.processingAttemptId)
  })

  it('fences stale queue jobs by processing-attempt token', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())

    expect(await claimActivityPubInboxDelivery(created.deliveryId, randomUUID())).toBeNull()
    expect(
      await claimActivityPubInboxDelivery(created.deliveryId, created.processingAttemptId),
    ).not.toBeNull()
    await deleteActivityPubInboxDelivery(created.deliveryId, created.processingAttemptId)
  })

  it('allows exactly one concurrent claim for the same processing-attempt token', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())

    const claims = await Promise.all([
      claimActivityPubInboxDelivery(created.deliveryId, created.processingAttemptId),
      claimActivityPubInboxDelivery(created.deliveryId, created.processingAttemptId),
    ])

    expect(claims.filter(Boolean)).toHaveLength(1)
    await deleteActivityPubInboxDelivery(created.deliveryId, created.processingAttemptId)
  })

  it('allows a non-final retry after the active claim releases its lease', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())
    expect(
      await claimActivityPubInboxDelivery(created.deliveryId, created.processingAttemptId),
    ).not.toBeNull()

    expect(
      await releaseActivityPubInboxDeliveryForRetry(
        created.deliveryId,
        created.processingAttemptId,
        new Error('temporary failure'),
      ),
    ).toBe(true)
    expect(
      await claimActivityPubInboxDelivery(created.deliveryId, created.processingAttemptId),
    ).not.toBeNull()
    await deleteActivityPubInboxDelivery(created.deliveryId, created.processingAttemptId)
  })

  it('leases a recovered row so an immediate second recovery cannot rotate its token again', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())
    await makeActivityPubInboxDeliveryRecoverableForTest(created.deliveryId, 'unstarted')

    const first = (await claimRecoverableActivityPubInboxDeliveries()).find(
      delivery => delivery.deliveryId === created.deliveryId,
    )
    expect(first).toBeDefined()
    expect(
      (await claimRecoverableActivityPubInboxDeliveries()).some(
        delivery => delivery.deliveryId === created.deliveryId,
      ),
    ).toBe(false)
    if (first) await deleteActivityPubInboxDelivery(created.deliveryId, first.processingAttemptId)
  })

  it('rotates the fencing token when recovering a crashed processing lease', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())
    await makeActivityPubInboxDeliveryRecoverableForTest(created.deliveryId, 'stale')

    const recovered = (await claimRecoverableActivityPubInboxDeliveries()).find(
      delivery => delivery.deliveryId === created.deliveryId,
    )
    expect(recovered?.processingAttemptId).not.toBe(created.processingAttemptId)
    if (recovered)
      await deleteActivityPubInboxDelivery(created.deliveryId, recovered.processingAttemptId)
  })

  it('rotates the token and excludes a delivery until a sender deferral is due', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())
    const actor = await createRemoteActorFixture()
    await claimActivityPubInboxDelivery(created.deliveryId, created.processingAttemptId)
    await markActivityPubInboxDeliveryVerified(
      created.deliveryId,
      created.processingAttemptId,
      actor.id,
    )
    const deferred = await deferActivityPubInboxDelivery(
      created.deliveryId,
      created.processingAttemptId,
      new Date(Date.now() + 60_000),
    )

    expect(deferred?.processingAttemptId).not.toBe(created.processingAttemptId)
    expect(
      await claimActivityPubInboxDelivery(
        created.deliveryId,
        deferred?.processingAttemptId ?? randomUUID(),
      ),
    ).toBeNull()
  })

  it('does not recover an old received row only one minute after its sender deferral is due', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())
    const actor = await createRemoteActorFixture()
    let cleanupAttemptId = created.processingAttemptId

    try {
      await claimActivityPubInboxDelivery(created.deliveryId, created.processingAttemptId)
      await markActivityPubInboxDeliveryVerified(
        created.deliveryId,
        created.processingAttemptId,
        actor.id,
      )
      const deferred = await deferActivityPubInboxDelivery(
        created.deliveryId,
        created.processingAttemptId,
        new Date(Date.now() - 60_000),
      )
      expect(deferred).not.toBeNull()
      if (!deferred) return
      cleanupAttemptId = deferred.processingAttemptId
      await ageActivityPubInboxDeliveryReceivedAtForTest(created.deliveryId)

      const recovered = (await claimRecoverableActivityPubInboxDeliveries()).find(
        delivery => delivery.deliveryId === created.deliveryId,
      )
      if (recovered) cleanupAttemptId = recovered.processingAttemptId
      expect(recovered).toBeUndefined()
      expect(
        await claimActivityPubInboxDelivery(created.deliveryId, deferred.processingAttemptId),
      ).not.toBeNull()
    } finally {
      await deleteActivityPubInboxDelivery(created.deliveryId, cleanupAttemptId)
    }
  })

  it('recovers an old received row more than five minutes after its sender deferral is due', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())
    const actor = await createRemoteActorFixture()
    let cleanupAttemptId = created.processingAttemptId

    try {
      await claimActivityPubInboxDelivery(created.deliveryId, created.processingAttemptId)
      await markActivityPubInboxDeliveryVerified(
        created.deliveryId,
        created.processingAttemptId,
        actor.id,
      )
      const deferred = await deferActivityPubInboxDelivery(
        created.deliveryId,
        created.processingAttemptId,
        new Date(Date.now() - 6 * 60_000),
      )
      expect(deferred).not.toBeNull()
      if (!deferred) return
      cleanupAttemptId = deferred.processingAttemptId
      await ageActivityPubInboxDeliveryReceivedAtForTest(created.deliveryId)

      const recovered = (await claimRecoverableActivityPubInboxDeliveries()).find(
        delivery => delivery.deliveryId === created.deliveryId,
      )
      expect(recovered).toBeDefined()
      if (!recovered) return
      cleanupAttemptId = recovered.processingAttemptId
      expect(recovered.processingAttemptId).not.toBe(deferred.processingAttemptId)
      expect(
        await claimActivityPubInboxDelivery(created.deliveryId, deferred.processingAttemptId),
      ).toBeNull()
      expect(
        await claimActivityPubInboxDelivery(created.deliveryId, recovered.processingAttemptId),
      ).not.toBeNull()
    } finally {
      await deleteActivityPubInboxDelivery(created.deliveryId, cleanupAttemptId)
    }
  })

  it('re-arms exhausted operational failures with a new token for manual replay', async () => {
    const created = await createActivityPubInboxDelivery(makeEnvelope())
    await claimActivityPubInboxDelivery(created.deliveryId, created.processingAttemptId)
    await markActivityPubInboxDeliveryFailed(
      created.deliveryId,
      created.processingAttemptId,
      new Error('temporary actor host outage'),
    )

    const rearmed = (await rearmFailedActivityPubInboxDeliveries()).find(
      delivery => delivery.deliveryId === created.deliveryId,
    )
    expect(rearmed?.processingAttemptId).not.toBe(created.processingAttemptId)
    expect(
      await claimActivityPubInboxDelivery(
        created.deliveryId,
        rearmed?.processingAttemptId ?? randomUUID(),
      ),
    ).not.toBeNull()
    if (rearmed)
      await deleteActivityPubInboxDelivery(created.deliveryId, rearmed.processingAttemptId)
  })
})
