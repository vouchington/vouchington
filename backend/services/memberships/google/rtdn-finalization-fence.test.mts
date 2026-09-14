import { createHash, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMembershipByUserId } from '../get.mts'
import { createMembershipVerification, getMembershipVerification } from '../verifications.mts'
import {
  createTestNativeMembershipProviderProduct,
  createTestSku,
  createTestUser,
} from '@voucha/test-helpers'
import { createTestGooglePlayRtdnEvidence } from '@voucha/test-helpers/google-play-memberships'
import {
  getTestMembershipProviderEvidence,
  getTestMembershipProviderEvidenceTerminalState,
} from '@voucha/test-helpers/entities/memberships/provider-evidence'
import { reconcileGooglePlayRtdnNotification } from './reconcile-notification.mts'
import { processGooglePlayMembershipVerification } from './process-verification.mts'
import type { GooglePlaySubscriptionsV2Client } from './types.mts'

describe('Google Play RTDN finalization fence', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('keeps the successor projection when an older RTDN finalizes after the successor token commits', async () => {
    const owner = await createTestUser()
    const applicationId = `ai.voucha.google-${randomUUID()}`
    const oldProductId = `plus.monthly.${randomUUID()}`
    const successorProductId = `pro.monthly.${randomUUID()}`
    const oldToken = `google-old-${randomUUID()}`
    const successorToken = `google-successor-${randomUUID()}`
    const accountId = createHash('sha256').update(owner.id).digest('hex')
    configureGooglePlay(applicationId)
    const plusSku = await createTestSku({ plan: 'plus' })
    const proSku = await createTestSku({ plan: 'pro' })
    await Promise.all([
      createTestNativeMembershipProviderProduct({
        membershipProductId: plusSku.id,
        provider: 'google_play',
        environment: 'test',
        applicationId,
        providerProductId: oldProductId,
      }),
      createTestNativeMembershipProviderProduct({
        membershipProductId: proSku.id,
        provider: 'google_play',
        environment: 'test',
        applicationId,
        providerProductId: successorProductId,
      }),
    ])
    const initial = await createMembershipVerification({
      userId: owner.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: oldToken },
    })
    await processGooglePlayMembershipVerification(initial.id, {
      client: makeGooglePlayClient({
        accountId,
        oldProductId,
        pending: true,
        oldToken,
        successorToken,
      }),
    })
    await expect(getMembershipVerification(owner.id, initial.id)).resolves.toMatchObject({
      status: 'pending',
    })

    const predecessorFinalFetch = deferred<void>()
    const releasePredecessorFinalFetch = deferred<void>()
    let oldTokenFetches = 0
    const client = makeGooglePlayClient({
      accountId,
      oldProductId,
      oldToken,
      successorProductId,
      successorToken,
      onOldTokenFetch: async () => {
        oldTokenFetches += 1
        if (oldTokenFetches !== 2) return
        predecessorFinalFetch.resolve()
        await releasePredecessorFinalFetch.promise
      },
    })
    const rtdnEvidenceId = await createTestGooglePlayRtdnEvidence({
      applicationId,
      rawBody: makeRtdnBody(applicationId, oldProductId, oldToken),
    })
    const predecessor = reconcileGooglePlayRtdnNotification({ evidenceId: rtdnEvidenceId, client })

    await predecessorFinalFetch.promise
    const successor = await createMembershipVerification({
      userId: owner.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: successorToken },
    })
    await processGooglePlayMembershipVerification(successor.id, { client })
    await expect(getMembershipVerification(owner.id, successor.id)).resolves.toMatchObject({
      status: 'verified',
    })
    await expect(getMembershipByUserId(owner.id)).resolves.toMatchObject({
      plan: 'pro',
      status: 'active',
    })

    releasePredecessorFinalFetch.resolve()
    await predecessor

    await expect(getTestMembershipProviderEvidence(rtdnEvidenceId)).resolves.toMatchObject({
      membership_provider_lineage_id: expect.any(String),
    })
    await expect(
      getTestMembershipProviderEvidenceTerminalState(rtdnEvidenceId),
    ).resolves.toMatchObject({
      rejected_at: null,
    })
    await expect(getMembershipByUserId(owner.id)).resolves.toMatchObject({
      plan: 'pro',
      status: 'active',
    })
  })
})

function configureGooglePlay(applicationId: string): void {
  vi.stubEnv('ENVIRONMENT', 'staging')
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('GOOGLE_PLAY_APPLICATION_ID', applicationId)
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve: ((value: T) => void) | undefined
  const promise = new Promise<T>(resolved => {
    resolve = resolved
  })
  return {
    promise,
    resolve(value) {
      if (!resolve) throw new Error('Deferred promise was not initialized')
      resolve(value)
    },
  }
}

function makeGooglePlayClient(options: {
  accountId: string
  oldProductId: string
  oldToken: string
  pending?: boolean
  successorProductId?: string
  successorToken: string
  onOldTokenFetch?: () => Promise<void>
}): GooglePlaySubscriptionsV2Client {
  return {
    async getSubscription({ purchaseToken }) {
      if (purchaseToken === options.oldToken) await options.onOldTokenFetch?.()
      const successor = purchaseToken === options.successorToken
      return {
        latestOrderId: `synthetic-order-${purchaseToken}`,
        linkedPurchaseToken: successor ? options.oldToken : undefined,
        subscriptionState: options.pending
          ? 'SUBSCRIPTION_STATE_PENDING'
          : 'SUBSCRIPTION_STATE_ACTIVE',
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        testPurchase: {},
        externalAccountIdentifiers: { obfuscatedExternalAccountId: options.accountId },
        lineItems: [
          {
            productId: successor ? options.successorProductId : options.oldProductId,
            expiryTime: new Date(Date.now() + 60 * 86_400_000).toISOString(),
          },
        ],
      }
    },
    acknowledgeSubscription: async () => undefined,
  }
}

function makeRtdnBody(applicationId: string, productId: string, purchaseToken: string): Buffer {
  return Buffer.from(
    JSON.stringify({
      message: {
        messageId: `test-rtdn-${randomUUID()}`,
        data: Buffer.from(
          JSON.stringify({
            packageName: applicationId,
            eventTimeMillis: String(Date.now()),
            subscriptionNotification: {
              notificationType: 2,
              purchaseToken,
              subscriptionId: productId,
            },
          }),
        ).toString('base64'),
      },
    }),
  )
}
