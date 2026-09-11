import { Environment, type JWSTransactionDecodedPayload } from '@apple/app-store-server-library'
import { describe, expect, it } from 'vitest'
import { verifyAppleNotification } from './verify-notification.mts'
import type { AppleNotificationVerifier } from './types.mts'

describe('Apple App Store notification verification', () => {
  it('requires a verified notification and nested transaction in one provider context', async () => {
    await expect(
      verifyAppleNotification({
        evidence: { signedPayload: 'signed-notification' },
        environment: 'test',
        applicationId: 'ai.voucha.ios',
        verifier: makeVerifier(),
      }),
    ).resolves.toEqual({
      notificationId: 'notification-id',
      providerLineageId: 'original-transaction-id',
      signedTransactionInfo: 'signed-transaction',
      signedPayload: 'signed-notification',
    })
  })

  it('rejects malformed, wrong-context, and incomplete notification evidence', async () => {
    await expect(
      verifyAppleNotification({
        evidence: { signed_payload: 'wrong-shape' },
        environment: 'test',
        applicationId: 'ai.voucha.ios',
        verifier: makeVerifier(),
      }),
    ).resolves.toBeNull()
    await expect(
      verifyAppleNotification({
        evidence: { signedPayload: 'signed-notification' },
        environment: 'test',
        applicationId: 'ai.voucha.ios',
        verifier: makeVerifier({ notificationError: true }),
      }),
    ).resolves.toBeNull()
    await expect(
      verifyAppleNotification({
        evidence: { signedPayload: 'signed-notification' },
        environment: 'test',
        applicationId: 'ai.voucha.ios',
        verifier: makeVerifier({ transactionBundleId: 'other.application' }),
      }),
    ).resolves.toBeNull()
    await expect(
      verifyAppleNotification({
        evidence: { signedPayload: 'signed-notification' },
        environment: 'test',
        applicationId: 'ai.voucha.ios',
        verifier: makeVerifier({ transactionError: true }),
      }),
    ).resolves.toBeNull()
    await expect(
      verifyAppleNotification({
        evidence: { signedPayload: 'signed-notification' },
        environment: 'test',
        applicationId: 'ai.voucha.ios',
        verifier: makeVerifier({ omitNotificationId: true }),
      }),
    ).resolves.toBeNull()
  })
})

function makeVerifier(
  overrides: {
    omitNotificationId?: boolean
    notificationError?: boolean
    transactionError?: boolean
    transactionBundleId?: string
  } = {},
): AppleNotificationVerifier {
  return {
    async verifyAndDecodeNotification() {
      if (overrides.notificationError) throw new Error('notification signature rejected')
      return {
        notificationUUID: overrides.omitNotificationId ? undefined : 'notification-id',
        data: {
          bundleId: 'ai.voucha.ios',
          environment: Environment.SANDBOX,
          signedTransactionInfo: 'signed-transaction',
        },
      }
    },
    async verifyAndDecodeTransaction(): Promise<JWSTransactionDecodedPayload> {
      if (overrides.transactionError) throw new Error('transaction signature rejected')
      return {
        originalTransactionId: 'original-transaction-id',
        bundleId: overrides.transactionBundleId ?? 'ai.voucha.ios',
        environment: Environment.SANDBOX,
      }
    },
  }
}
