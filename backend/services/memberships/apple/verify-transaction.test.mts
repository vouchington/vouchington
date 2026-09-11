import {
  createConfiguredAppleSignedTransactionEvidenceVerifier,
  createConfiguredAppleTransactionVerifier,
} from './configured-verifier.mts'
import {
  Environment,
  InAppOwnershipType,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library'
import { describe, expect, it } from 'vitest'
import {
  createAppleSignedTransactionEvidenceVerifier,
  verifyAppleSignedTransactionEvidence,
  type AppleSignedTransactionExpectation,
  type AppleSignedTransactionVerifierConfig,
  type AppleTransactionVerifier,
} from './verify-transaction.mts'

describe('Apple App Store signed transaction verification', () => {
  it('normalizes a verified direct purchase', async () => {
    const result = await verifyAppleSignedTransactionEvidence({
      evidence: { signed_transaction_info: 'signed-direct-transaction' },
      expected: expectedTransaction(),
      now: new Date('2026-09-10T00:00:00.000Z'),
      verifier: makeVerifier(),
    })

    expect(result).toEqual({
      accepted: true,
      observation: {
        provider: 'apple_app_store',
        environment: 'test',
        applicationId: 'ai.voucha.ios',
        membershipProductId: 'membership-product-id',
        providerProductId: 'ai.voucha.plus.monthly',
        providerLineageId: 'original-transaction-id',
        providerEventId: 'transaction-id',
        providerRevision: 'transaction-id',
        providerOrder: 0,
        sourceKind: 'direct',
        appAccountToken: 'purchase-intent-id',
        effectiveAt: new Date('2026-08-01T00:00:00.000Z'),
        expiresAt: new Date('2026-10-01T00:00:00.000Z'),
        terminalAt: null,
        lifecycle: 'active',
        autoRenews: false,
      },
    })
  })

  it('accepts family-shared evidence without matching an app account token', async () => {
    const result = await verifyAppleSignedTransactionEvidence({
      evidence: { signed_transaction_info: 'signed-family-transaction' },
      expected: expectedTransaction(),
      verifier: makeVerifier({
        appAccountToken: 'family-organizer-token',
        inAppOwnershipType: InAppOwnershipType.FAMILY_SHARED,
      }),
    })

    expect(result).toMatchObject({
      accepted: true,
      observation: { sourceKind: 'family', appAccountToken: null },
    })
  })

  it('preserves a direct account token for restore binding without an expected intent', async () => {
    const expected = expectedTransaction()
    delete expected.purchaseIntentId

    const result = await verifyAppleSignedTransactionEvidence({
      evidence: { signed_transaction_info: 'restore-transaction' },
      expected,
      verifier: makeVerifier({ appAccountToken: 'restorable-purchase-intent' }),
    })

    expect(result).toMatchObject({
      accepted: true,
      observation: { sourceKind: 'direct', appAccountToken: 'restorable-purchase-intent' },
    })
  })

  it('rejects malformed evidence and provider verification failures', async () => {
    await expect(
      verifyAppleSignedTransactionEvidence({
        evidence: { signed_transaction_info: 'signed', unexpected: true },
        expected: expectedTransaction(),
        verifier: makeVerifier(),
      }),
    ).resolves.toEqual({ accepted: false, reasonCode: 'invalid_evidence' })

    await expect(
      verifyAppleSignedTransactionEvidence({
        evidence: { signed_transaction_info: 'signed' },
        expected: expectedTransaction(),
        verifier: makeVerifier(undefined, new Error('Apple rejected signature')),
      }),
    ).resolves.toEqual({ accepted: false, reasonCode: 'invalid_evidence' })
  })

  it('rejects transaction claims that do not match the expected account or provider context', async () => {
    const cases = [
      [{ appAccountToken: undefined }, 'missing_account_token'],
      [{ appAccountToken: 'another-purchase-intent' }, 'wrong_account'],
      [{ bundleId: 'other.application' }, 'wrong_application'],
      [{ environment: Environment.PRODUCTION }, 'wrong_environment'],
      [{ productId: 'other.product' }, 'wrong_product'],
      [{ purchaseDate: Date.parse('2026-10-01T00:00:00.000Z') }, 'purchase_pending'],
    ] as const

    for (const [transaction, reasonCode] of cases) {
      await expect(
        verifyAppleSignedTransactionEvidence({
          evidence: { signed_transaction_info: 'signed' },
          expected: expectedTransaction(),
          now: new Date('2026-09-10T00:00:00.000Z'),
          verifier: makeVerifier(transaction),
        }),
      ).resolves.toEqual({ accepted: false, reasonCode })
    }
  })

  it('normalizes expired and revoked transaction lifecycle evidence', async () => {
    const now = new Date('2026-09-10T00:00:00.000Z')
    const expired = await verifyAppleSignedTransactionEvidence({
      evidence: { signed_transaction_info: 'expired' },
      expected: expectedTransaction(),
      now,
      verifier: makeVerifier({ expiresDate: Date.parse('2026-09-01T00:00:00.000Z') }),
    })
    const revoked = await verifyAppleSignedTransactionEvidence({
      evidence: { signed_transaction_info: 'revoked' },
      expected: expectedTransaction(),
      now,
      verifier: makeVerifier({ revocationDate: Date.parse('2026-09-05T00:00:00.000Z') }),
    })

    expect(expired).toMatchObject({
      accepted: true,
      observation: {
        lifecycle: 'expired',
        terminalAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    })
    expect(revoked).toMatchObject({
      accepted: true,
      observation: {
        lifecycle: 'revoked',
        terminalAt: new Date('2026-09-05T00:00:00.000Z'),
      },
    })
  })

  it('constructs the Apple verifier with offline checks by default', async () => {
    let receivedConfig: AppleSignedTransactionVerifierConfig | undefined
    const verifier = createAppleSignedTransactionEvidenceVerifier(
      {
        appleRootCertificates: [Buffer.from('root-certificate')],
        environment: 'test',
        applicationId: 'ai.voucha.ios',
      },
      config => {
        receivedConfig = config
        return makeVerifier()
      },
    )

    await verifier.verify({ signed_transaction_info: 'signed' }, expectedTransaction())

    expect(receivedConfig).toMatchObject({ enableOnlineChecks: false })
  })

  it('uses the pinned Apple trust roots for membership verification', async () => {
    const transactionVerifier = createConfiguredAppleTransactionVerifier({
      applicationId: 'ai.voucha.ios',
      environment: 'test',
    })
    const evidenceVerifier = createConfiguredAppleSignedTransactionEvidenceVerifier({
      applicationId: 'ai.voucha.ios',
      environment: 'test',
    })

    await expect(
      transactionVerifier.verifyAndDecodeTransaction('not-a-jws'),
    ).rejects.toBeInstanceOf(Error)
    await expect(
      evidenceVerifier.verify({ signed_transaction_info: 'not-a-jws' }, expectedTransaction()),
    ).resolves.toEqual({ accepted: false, reasonCode: 'invalid_evidence' })
  })

  it('rejects missing identity fields, invalid dates, and invalid revocation dates', async () => {
    const cases = [
      [{ transactionId: undefined }, 'invalid_evidence'],
      [{ expiresDate: Date.parse('2026-07-01T00:00:00.000Z') }, 'invalid_evidence'],
      [{ signedDate: -1 }, 'invalid_evidence'],
      [{ revocationDate: Date.parse('2026-07-01T00:00:00.000Z') }, 'invalid_evidence'],
    ] as const

    for (const [transaction, reasonCode] of cases) {
      await expect(
        verifyAppleSignedTransactionEvidence({
          evidence: { signed_transaction_info: 'signed' },
          expected: expectedTransaction(),
          verifier: makeVerifier(transaction),
        }),
      ).resolves.toEqual({ accepted: false, reasonCode })
    }
  })
})

function expectedTransaction(): AppleSignedTransactionExpectation {
  return {
    applicationId: 'ai.voucha.ios',
    environment: 'test' as const,
    expectedProduct: {
      membershipProductId: 'membership-product-id',
      providerProductId: 'ai.voucha.plus.monthly',
    },
    purchaseIntentId: 'purchase-intent-id',
  }
}

function makeVerifier(
  overrides: Partial<JWSTransactionDecodedPayload> = {},
  verificationError?: Error,
): AppleTransactionVerifier {
  return {
    async verifyAndDecodeTransaction(): Promise<JWSTransactionDecodedPayload> {
      if (verificationError) throw verificationError
      return {
        originalTransactionId: 'original-transaction-id',
        transactionId: 'transaction-id',
        bundleId: 'ai.voucha.ios',
        productId: 'ai.voucha.plus.monthly',
        purchaseDate: Date.parse('2026-08-01T00:00:00.000Z'),
        expiresDate: Date.parse('2026-10-01T00:00:00.000Z'),
        signedDate: Date.parse('2026-09-01T00:00:00.000Z'),
        environment: Environment.SANDBOX,
        inAppOwnershipType: InAppOwnershipType.PURCHASED,
        appAccountToken: 'purchase-intent-id',
        ...overrides,
      }
    },
  }
}
