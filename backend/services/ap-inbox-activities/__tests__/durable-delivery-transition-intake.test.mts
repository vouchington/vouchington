import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { activityPubInboxDeliveryExistsOnPrimaryForTest } from '@voucha/test-helpers/entities/activitypub-inbox'
import { cleanupActivityPubInboxStorageFixturesForTest } from '@voucha/test-helpers/entities/activitypub-inbox-storage'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { acceptActivityPubInboxDelivery } from '../durable-delivery-transition-intake.mts'
import type { ActivityPubInboxEnvelope } from '../durable-delivery-transition-contract.mts'

describe('ActivityPub inbox intake database failure', () => {
  it('rethrows an unexpected insert failure without recording a delivery or reporting capacity exhaustion', async () => {
    const suffix = randomUUID()
    const senderHostname = `intake-${suffix}.example.com`
    const actor = `https://${senderHostname}/users/alice`
    const activityId = `${actor}/activities/${suffix}`
    const envelope: ActivityPubInboxEnvelope = {
      requestMethod: 'POST',
      requestTarget: `/ap/inbox?delivery=${suffix}`,
      expectedHost: 'voucha.example',
      signatureHeader: `keyId="${actor}#main-key",headers="(request-target) host date digest",signature="bytes"`,
      digestHeader: 'SHA-256=exact-digest',
      dateHeader: 'Thu, 01 Jan 2026 00:00:00 GMT',
      contentTypeHeader: 'application/activity+json',
      rawBody: Buffer.from(JSON.stringify({ id: activityId, type: 'Create', actor })),
      claimedActivityId: activityId,
      claimedActivityType: 'Create',
      claimedActorUri: actor,
      senderHostname,
    }

    try {
      const { result, error } = await withPostgresPoolQueryFailureForTest(
        '/* acceptActivityPubInboxDelivery */',
        () => acceptActivityPubInboxDelivery(envelope).catch((err: unknown) => err),
        { command: 'INSERT' },
      )

      expect(result).toBe(error)
      expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(activityId)).toBe(false)
      await expect(acceptActivityPubInboxDelivery(envelope)).resolves.toMatchObject({
        outcome: 'applied',
      })
      expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(activityId)).toBe(true)
    } finally {
      await cleanupActivityPubInboxStorageFixturesForTest([activityId])
    }
  })
})
