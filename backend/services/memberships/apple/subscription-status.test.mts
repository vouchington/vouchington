import {
  AutoRenewStatus,
  Environment,
  InAppOwnershipType,
  Status,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library'
import { describe, expect, it } from 'vitest'
import {
  fetchAppleSubscriptionStatuses,
  verifyAuthoritativeAppleSubscriptionStatus,
  type AppleSubscriptionStatusClient,
} from './subscription-status.mts'
import type { AppleRenewalInfoVerifier } from './types.mts'

describe('Apple authoritative subscription status', () => {
  it('uses the provider status and verified renewal information for an active auto-renewing subscription', async () => {
    const status = await verifyAuthoritativeAppleSubscriptionStatus({
      latestTransaction: transaction(),
      expected: expected(),
      statusResponse: response(Status.ACTIVE),
      verifier: verifier(AutoRenewStatus.ON),
    })

    expect(status).toEqual({ autoRenews: true, lifecycle: 'active', terminalAt: null })
  })

  it('keeps an active subscription entitled while cancellation is pending at period end', async () => {
    const status = await verifyAuthoritativeAppleSubscriptionStatus({
      latestTransaction: transaction(),
      expected: expected(),
      statusResponse: response(Status.ACTIVE),
      verifier: verifier(AutoRenewStatus.OFF),
    })

    expect(status).toEqual({ autoRenews: false, lifecycle: 'active', terminalAt: null })
  })

  it('derives expiration from the authoritative subscription status', async () => {
    const status = await verifyAuthoritativeAppleSubscriptionStatus({
      latestTransaction: transaction(),
      expected: expected(),
      statusResponse: response(Status.EXPIRED),
      verifier: verifier(AutoRenewStatus.OFF),
    })

    expect(status).toEqual({
      autoRenews: false,
      lifecycle: 'expired',
      terminalAt: new Date('2026-09-01T00:00:00.000Z'),
    })
  })

  it('derives refund revocation from the authoritative transaction history', async () => {
    const status = await verifyAuthoritativeAppleSubscriptionStatus({
      latestTransaction: transaction({ revocationDate: Date.parse('2026-08-15T00:00:00.000Z') }),
      expected: expected(),
      statusResponse: response(Status.ACTIVE),
      verifier: verifier(AutoRenewStatus.OFF, {
        revocationDate: Date.parse('2026-08-15T00:00:00.000Z'),
      }),
    })

    expect(status).toEqual({
      autoRenews: false,
      lifecycle: 'revoked',
      terminalAt: new Date('2026-08-15T00:00:00.000Z'),
    })
  })

  it('derives revocation from the authoritative subscription status', async () => {
    const status = await verifyAuthoritativeAppleSubscriptionStatus({
      latestTransaction: transaction(),
      expected: expected(),
      statusResponse: response(Status.REVOKED),
      verifier: verifier(AutoRenewStatus.OFF),
    })

    expect(status).toMatchObject({ autoRenews: false, lifecycle: 'revoked' })
  })

  it('rejects status entries outside the verified lineage and product context', async () => {
    await expect(
      verifyAuthoritativeAppleSubscriptionStatus({
        latestTransaction: transaction(),
        expected: expected(),
        statusResponse: response(Status.ACTIVE, 'other-lineage'),
        verifier: verifier(AutoRenewStatus.ON),
      }),
    ).rejects.toThrow('Apple subscription status did not include the authoritative transaction')
  })

  it('rejects ambiguous statuses for the authoritative transaction instead of selecting one by response order', async () => {
    const statusResponse = response(Status.ACTIVE)
    const entries = statusResponse.data?.[0]?.lastTransactions
    if (!entries) throw new Error('Apple status fixture did not contain a transaction')
    entries.push({ ...entries[0], status: Status.EXPIRED })

    await expect(
      verifyAuthoritativeAppleSubscriptionStatus({
        latestTransaction: transaction(),
        expected: expected(),
        statusResponse,
        verifier: verifier(AutoRenewStatus.ON),
      }),
    ).rejects.toThrow('Apple subscription status did not include the authoritative transaction')
  })

  it('rejects mismatched provider and renewal context plus unknown status values', async () => {
    await expect(
      verifyAuthoritativeAppleSubscriptionStatus({
        latestTransaction: transaction(),
        expected: expected(),
        statusResponse: { ...response(Status.ACTIVE), bundleId: 'other.application' },
        verifier: verifier(AutoRenewStatus.ON),
      }),
    ).rejects.toThrow('Apple subscription status context did not match the provider evidence')
    await expect(
      verifyAuthoritativeAppleSubscriptionStatus({
        latestTransaction: transaction(),
        expected: expected(),
        statusResponse: response(Status.ACTIVE),
        verifier: verifier(AutoRenewStatus.ON, {}, { productId: 'other.product' }),
      }),
    ).rejects.toThrow('Apple signed renewal information did not match the provider evidence')
    await expect(
      verifyAuthoritativeAppleSubscriptionStatus({
        latestTransaction: transaction(),
        expected: expected(),
        statusResponse: response(999 as Status),
        verifier: verifier(AutoRenewStatus.ON),
      }),
    ).rejects.toThrow('Apple subscription status was not recognized')
  })

  it('fetches all subscription statuses only through the injected worker client', async () => {
    const calls: string[] = []
    const client: AppleSubscriptionStatusClient = {
      async getAllSubscriptionStatuses(transactionId) {
        calls.push(transactionId)
        return response(Status.ACTIVE)
      },
    }

    await expect(
      fetchAppleSubscriptionStatuses(client, 'original-transaction-id'),
    ).resolves.toEqual(response(Status.ACTIVE))
    expect(calls).toEqual(['original-transaction-id'])
  })
})

function expected() {
  return {
    applicationId: 'ai.voucha.ios',
    environment: 'test' as const,
    providerLineageId: 'original-transaction-id',
    providerProductId: 'ai.voucha.plus.monthly',
  }
}

function transaction(
  overrides: Partial<JWSTransactionDecodedPayload> = {},
): JWSTransactionDecodedPayload {
  return {
    appAccountToken: 'purchase-intent-id',
    bundleId: 'ai.voucha.ios',
    environment: Environment.SANDBOX,
    expiresDate: Date.parse('2026-09-01T00:00:00.000Z'),
    inAppOwnershipType: InAppOwnershipType.PURCHASED,
    originalTransactionId: 'original-transaction-id',
    productId: 'ai.voucha.plus.monthly',
    transactionId: 'latest-transaction-id',
    ...overrides,
  }
}

function response(status: Status, lineage = 'original-transaction-id') {
  return {
    bundleId: 'ai.voucha.ios',
    environment: Environment.SANDBOX,
    data: [
      {
        lastTransactions: [
          {
            status,
            originalTransactionId: lineage,
            signedTransactionInfo: 'latest-transaction',
            signedRenewalInfo: 'latest-renewal',
          },
        ],
      },
    ],
  }
}

function verifier(
  autoRenewStatus: AutoRenewStatus,
  transactionOverrides: Partial<JWSTransactionDecodedPayload> = {},
  renewalOverrides: Partial<{
    environment: Environment
    originalTransactionId: string
    productId: string
  }> = {},
): AppleRenewalInfoVerifier & {
  verifyAndDecodeTransaction: () => Promise<JWSTransactionDecodedPayload>
} {
  return {
    async verifyAndDecodeTransaction() {
      return transaction(transactionOverrides)
    },
    async verifyAndDecodeRenewalInfo() {
      return {
        autoRenewStatus,
        environment: Environment.SANDBOX,
        originalTransactionId: 'original-transaction-id',
        productId: 'ai.voucha.plus.monthly',
        ...renewalOverrides,
      }
    },
  }
}
