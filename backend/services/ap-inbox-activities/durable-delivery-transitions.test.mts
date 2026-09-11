import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT,
  activityPubInboxDeliveryTransitions,
  type ActivityPubInboxDeliveryTransitionDimensions,
  type ActivityPubInboxDeliveryTransitionName,
  type ActivityPubInboxEnvelope,
} from './durable-delivery-transitions.mts'

describe('ActivityPub inbox durable-delivery transition facade', () => {
  it('exposes exactly one implementation for every named transition', () => {
    expect(Object.keys(activityPubInboxDeliveryTransitions).sort()).toEqual([
      'accept',
      'acknowledgeEnqueue',
      'admitSender',
      'claim',
      'complete',
      'defer',
      'exhaust',
      'expire',
      'rearm',
      'recover',
      'reject',
      'release',
      'verify',
    ])
  })

  it('describes the accepted lifecycle and checkpoint edges exhaustively', () => {
    expect(Object.keys(ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT).sort()).toEqual([
      'accept',
      'acknowledge-enqueue',
      'admit-sender',
      'claim',
      'complete',
      'defer',
      'exhaust',
      'expire',
      'rearm',
      'recover',
      'reject',
      'release',
      'verify',
    ])
    expect(ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.claim).toEqual({
      from: ['available', 'deferred'],
      to: 'processing',
      checkpoint: 'preserved',
      fence: 'current',
      consistency: 'primary',
      atomicBoundary: 'single-row-mutation',
      postCommitEffects: ['none'],
    })
    expect(ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.defer).toEqual({
      from: ['processing'],
      to: 'deferred',
      checkpoint: 'verified',
      fence: 'rotate',
      consistency: 'primary',
      atomicBoundary: 'single-row-mutation',
      postCommitEffects: ['delayed-awaited-enqueue'],
    })
    expect(ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT.complete).toEqual({
      from: ['processing'],
      to: 'deleted',
      checkpoint: 'sender-allowed',
      fence: 'current',
      consistency: 'primary',
      atomicBoundary: 'dedup-core-effect-envelope',
      postCommitEffects: ['follow-accept'],
    })
  })

  it('declares fencing, consistency, atomicity, and effects for every transition', () => {
    const dimensions = Object.fromEntries(
      Object.entries(ACTIVITYPUB_INBOX_DELIVERY_TRANSITION_CONTRACT).map(([name, definition]) => [
        name,
        {
          fence: definition.fence,
          consistency: definition.consistency,
          atomicBoundary: definition.atomicBoundary,
          postCommitEffects: definition.postCommitEffects,
        },
      ]),
    )
    const expected = {
      accept: {
        fence: 'mint',
        consistency: 'primary',
        atomicBoundary: 'single-row-mutation',
        postCommitEffects: ['initial-awaited-enqueue'],
      },
      'acknowledge-enqueue': {
        fence: 'current',
        consistency: 'primary',
        atomicBoundary: 'single-row-mutation',
        postCommitEffects: ['none'],
      },
      claim: {
        fence: 'current',
        consistency: 'primary',
        atomicBoundary: 'single-row-mutation',
        postCommitEffects: ['none'],
      },
      verify: {
        fence: 'current',
        consistency: 'primary',
        atomicBoundary: 'single-row-mutation',
        postCommitEffects: ['none'],
      },
      'admit-sender': {
        fence: 'current',
        consistency: 'primary',
        atomicBoundary: 'single-row-mutation',
        postCommitEffects: ['none'],
      },
      defer: {
        fence: 'rotate',
        consistency: 'primary',
        atomicBoundary: 'single-row-mutation',
        postCommitEffects: ['delayed-awaited-enqueue'],
      },
      release: {
        fence: 'current',
        consistency: 'primary',
        atomicBoundary: 'single-row-mutation',
        postCommitEffects: ['none'],
      },
      exhaust: {
        fence: 'current',
        consistency: 'primary',
        atomicBoundary: 'single-row-mutation',
        postCommitEffects: ['none'],
      },
      expire: {
        fence: 'invalidate',
        consistency: 'primary',
        atomicBoundary: 'bounded-locking-delete',
        postCommitEffects: ['none'],
      },
      reject: {
        fence: 'current',
        consistency: 'primary',
        atomicBoundary: 'single-row-mutation',
        postCommitEffects: ['none'],
      },
      complete: {
        fence: 'current',
        consistency: 'primary',
        atomicBoundary: 'dedup-core-effect-envelope',
        postCommitEffects: ['follow-accept'],
      },
      recover: {
        fence: 'rotate',
        consistency: 'primary',
        atomicBoundary: 'bounded-locking-claim',
        postCommitEffects: ['recovery-bulk-awaited-enqueue'],
      },
      rearm: {
        fence: 'rotate',
        consistency: 'primary',
        atomicBoundary: 'bounded-locking-claim',
        postCommitEffects: ['sequential-backfill-enqueue'],
      },
    } as const satisfies Record<
      ActivityPubInboxDeliveryTransitionName,
      ActivityPubInboxDeliveryTransitionDimensions
    >

    expect(dimensions).toEqual(expected)
  })

  it('returns stale for every fencing-token mutation when the token is stale', async () => {
    const accepted = await activityPubInboxDeliveryTransitions.accept(makeEnvelope())
    if (accepted.outcome !== 'applied')
      throw new Error('Test delivery unexpectedly exceeded capacity')
    const delivery = accepted.value
    const staleToken = randomUUID()

    expect(
      await activityPubInboxDeliveryTransitions.acknowledgeEnqueue(delivery.deliveryId, staleToken),
    ).toEqual({ outcome: 'stale' })
    expect(
      await activityPubInboxDeliveryTransitions.claim(delivery.deliveryId, staleToken),
    ).toEqual({ outcome: 'stale' })
    expect(
      await activityPubInboxDeliveryTransitions.verify(
        delivery.deliveryId,
        staleToken,
        randomUUID(),
      ),
    ).toEqual({ outcome: 'stale' })
    expect(
      await activityPubInboxDeliveryTransitions.admitSender(delivery.deliveryId, staleToken),
    ).toEqual({ outcome: 'stale' })
    expect(
      await activityPubInboxDeliveryTransitions.defer(delivery.deliveryId, staleToken, new Date()),
    ).toEqual({ outcome: 'stale' })
    expect(
      await activityPubInboxDeliveryTransitions.release(
        delivery.deliveryId,
        staleToken,
        new Error('stale'),
      ),
    ).toEqual({ outcome: 'stale' })
    expect(
      await activityPubInboxDeliveryTransitions.exhaust(
        delivery.deliveryId,
        staleToken,
        new Error('stale'),
      ),
    ).toEqual({ outcome: 'stale' })
    expect(
      await activityPubInboxDeliveryTransitions.reject(delivery.deliveryId, staleToken),
    ).toEqual({ outcome: 'stale' })
    expect(
      await activityPubInboxDeliveryTransitions.complete(delivery.deliveryId, staleToken),
    ).toEqual({ outcome: 'stale' })

    expect(
      await activityPubInboxDeliveryTransitions.claim(
        delivery.deliveryId,
        delivery.processingAttemptId,
      ),
    ).toMatchObject({ outcome: 'applied' })
    expect(
      await activityPubInboxDeliveryTransitions.reject(
        delivery.deliveryId,
        delivery.processingAttemptId,
      ),
    ).toMatchObject({ outcome: 'applied' })
  })

  it('does not reject an exhausted failed delivery', async () => {
    const accepted = await activityPubInboxDeliveryTransitions.accept(makeEnvelope())
    if (accepted.outcome !== 'applied')
      throw new Error('Test delivery unexpectedly exceeded capacity')
    const delivery = accepted.value
    expect(
      await activityPubInboxDeliveryTransitions.claim(
        delivery.deliveryId,
        delivery.processingAttemptId,
      ),
    ).toMatchObject({ outcome: 'applied' })
    expect(
      await activityPubInboxDeliveryTransitions.exhaust(
        delivery.deliveryId,
        delivery.processingAttemptId,
        new Error('retry attempts exhausted'),
      ),
    ).toMatchObject({ outcome: 'applied' })

    expect(
      await activityPubInboxDeliveryTransitions.reject(
        delivery.deliveryId,
        delivery.processingAttemptId,
      ),
    ).toEqual({ outcome: 'stale' })

    const rearmed = (await activityPubInboxDeliveryTransitions.rearm()).find(
      candidate => candidate.deliveryId === delivery.deliveryId,
    )
    expect(rearmed).toBeDefined()
    if (!rearmed) return
    await activityPubInboxDeliveryTransitions.claim(rearmed.deliveryId, rearmed.processingAttemptId)
    await activityPubInboxDeliveryTransitions.reject(
      rearmed.deliveryId,
      rearmed.processingAttemptId,
    )
  })
})

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
