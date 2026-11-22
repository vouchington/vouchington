import { randomUUID } from 'node:crypto'
import {
  Environment,
  InAppOwnershipType,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMembershipByUserId, getMembershipVerification } from '@services/memberships'
import { processMembershipVerification } from '@services/memberships/process-verification'
import {
  createTestMembershipProviderLineage,
  createTestUser,
  getTestMembershipProviderLineageAccountId,
} from '@voucha/test-helpers'
import { beforePostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import {
  createTestAppleVerificationFixture,
  submitTestAppleVerification,
} from '@voucha/test-helpers/apple-membership-verification'
import { MembershipProviderUnavailableError } from '../provider-unavailable.mts'
import { processAppleMembershipVerification } from './process-verification.mts'
import type { AppleTransactionVerifier } from './types.mts'

describe('Apple verification finalization', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('keeps a verification pending through a configuration outage and verifies it once restored', async () => {
    const user = await createTestUser()
    const fixture = await createTestAppleVerificationFixture(
      user.id,
      `ai.voucha.apple-production-${randomUUID()}`,
      'production',
    )
    const verification = await submitTestAppleVerification(
      user.id,
      fixture,
      `signed-config-recovery-${randomUUID()}`,
    )
    vi.stubEnv('APPLE_APP_STORE_APP_ID', undefined)

    await expect(processMembershipVerification(verification.id)).rejects.toBeInstanceOf(
      MembershipProviderUnavailableError,
    )
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'pending',
      reason_code: null,
    })

    vi.stubEnv('APPLE_APP_STORE_APP_ID', '123456789')
    await processAppleMembershipVerification(verification.id, {
      createVerifier: () => makeProductionVerifier(fixture),
    })

    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'verified',
      reason_code: 'verified',
    })
  })

  it.each(['same', 'different'] as const)(
    'preserves the winning token if a %s account binds the notification-first lineage',
    async account => {
      const user = await createTestUser()
      const fixture = await createTestAppleVerificationFixture(user.id, undefined, 'production')
      const winnerUser = account === 'same' ? user : await createTestUser()
      const winnerFixture =
        account === 'same'
          ? fixture
          : await createTestAppleVerificationFixture(
              winnerUser.id,
              fixture.applicationId,
              'production',
            )
      const providerLineageId = `notification-first-race-${randomUUID()}`
      const sourceIdentity = {
        provider: 'apple_app_store' as const,
        environment: 'production' as const,
        applicationId: fixture.applicationId,
        providerLineageId,
      }
      await createTestMembershipProviderLineage(sourceIdentity)
      const verification = await submitTestAppleVerification(
        user.id,
        fixture,
        `signed-${randomUUID()}`,
      )
      const winner = await submitTestAppleVerification(
        winnerUser.id,
        winnerFixture,
        `signed-${randomUUID()}`,
      )

      const restore = beforePostgresTransactionQueryForTest(
        '/* bindAppleVerificationLineageAccount */',
        values => values[0] === fixture.purchaseIntentId,
        () =>
          processAppleMembershipVerification(winner.id, {
            createVerifier: () => makeProductionVerifier(winnerFixture, providerLineageId),
          }),
      )
      try {
        await processAppleMembershipVerification(verification.id, {
          createVerifier: () => makeProductionVerifier(fixture, providerLineageId),
        })
      } finally {
        restore()
      }

      await expect(getTestMembershipProviderLineageAccountId(sourceIdentity)).resolves.toBe(
        winnerFixture.purchaseIntentId,
      )
      await expect(getMembershipVerification(winnerUser.id, winner.id)).resolves.toMatchObject({
        status: 'verified',
      })
      await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject(
        account === 'same'
          ? { status: 'verified', reason_code: 'verified' }
          : { status: 'conflict', reason_code: 'wrong_account' },
      )
      await expect(getMembershipByUserId(winnerUser.id)).resolves.toMatchObject({ plan: 'plus' })
      const contenderMembership = await getMembershipByUserId(user.id)
      expect(contenderMembership?.plan ?? null).toBe(account === 'same' ? 'plus' : null)
    },
  )
})

function makeProductionVerifier(
  fixture: { applicationId: string; providerProductId: string; purchaseIntentId: string },
  providerLineageId = `original-transaction-${randomUUID()}`,
): AppleTransactionVerifier {
  return {
    async verifyAndDecodeTransaction(): Promise<JWSTransactionDecodedPayload> {
      return {
        appAccountToken: fixture.purchaseIntentId,
        originalTransactionId: providerLineageId,
        transactionId: `transaction-${randomUUID()}`,
        bundleId: fixture.applicationId,
        productId: fixture.providerProductId,
        purchaseDate: Date.parse('2026-08-01T00:00:00.000Z'),
        expiresDate: Math.floor(performance.timeOrigin) + 30 * 86_400_000,
        signedDate: Date.parse('2026-09-01T00:00:00.000Z'),
        environment: Environment.PRODUCTION,
        inAppOwnershipType: InAppOwnershipType.PURCHASED,
      }
    },
  }
}
