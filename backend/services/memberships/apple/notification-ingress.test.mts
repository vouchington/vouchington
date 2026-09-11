import { randomUUID } from 'node:crypto'
import { Environment, type JWSTransactionDecodedPayload } from '@apple/app-store-server-library'
import { afterEach, describe, expect, it } from 'vitest'
import { memberships } from '@queues/memberships/queues'
import { getTestMembershipProviderEvidence } from '@voucha/test-helpers'
import { ingestAppleAppStoreNotification } from './notification-ingress.mts'
import type { AppleNotificationVerifier } from './types.mts'

describe('Apple App Store notification ingress persistence', () => {
  afterEach(() => memberships.obliterate({ force: true }))

  it('durably deduplicates an accepted notification before queueing its lineage', async () => {
    const notificationId = randomUUID()
    const evidence = { signedPayload: `signed-notification-${notificationId}` }
    const options = {
      evidence,
      environment: 'test' as const,
      applicationId: 'ai.voucha.ios',
      verifier: makeVerifier(notificationId),
    }

    const first = await ingestAppleAppStoreNotification(options)
    const replay = await ingestAppleAppStoreNotification(options)
    const storedEvidence = await getTestMembershipProviderEvidence(first.evidenceId)

    expect(replay).toEqual({ evidenceId: first.evidenceId, replayed: true })
    expect(storedEvidence).toEqual({
      provider_event_id: notificationId,
      membership_provider_lineage_id: expect.any(String),
    })
    await expect(
      memberships.getJob(`apple-notification__${first.evidenceId}`),
    ).resolves.toMatchObject({
      data: {
        evidenceId: first.evidenceId,
        providerLineageId: 'original-transaction-id',
        environment: 'test',
      },
    })
  })

  it('rejects a notification identifier replayed for another lineage', async () => {
    const notificationId = randomUUID()
    await ingestAppleAppStoreNotification({
      evidence: { signedPayload: `signed-notification-${notificationId}` },
      environment: 'test',
      applicationId: 'ai.voucha.ios',
      verifier: makeVerifier(notificationId),
    })

    await expect(
      ingestAppleAppStoreNotification({
        evidence: { signedPayload: `conflicting-notification-${notificationId}` },
        environment: 'test',
        applicationId: 'ai.voucha.ios',
        verifier: makeVerifier(notificationId, 'other-original-transaction'),
      }),
    ).rejects.toThrow('Apple notification identity conflicts with its lineage')
  })
})

function makeVerifier(
  notificationId: string,
  providerLineageId = 'original-transaction-id',
): AppleNotificationVerifier {
  return {
    async verifyAndDecodeNotification() {
      return {
        notificationUUID: notificationId,
        data: {
          bundleId: 'ai.voucha.ios',
          environment: Environment.SANDBOX,
          signedTransactionInfo: 'signed-transaction',
        },
      }
    },
    async verifyAndDecodeTransaction(): Promise<JWSTransactionDecodedPayload> {
      return {
        originalTransactionId: providerLineageId,
        bundleId: 'ai.voucha.ios',
        environment: Environment.SANDBOX,
      }
    },
  }
}
