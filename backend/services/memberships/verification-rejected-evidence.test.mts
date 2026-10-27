import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createTestMembershipVerificationForPriorEvidence } from '@voucha/test-helpers/membership-verification-evidence'
import { createMembershipVerification, getMembershipVerification } from './verifications.mts'
import { getMembershipByUserId } from './index.mts'
import { processGooglePlayMembershipVerification } from './google/process-verification.mts'
import { processMicrosoftStoreMembershipVerification } from './microsoft/process-verification.mts'

describe('provider verification of already rejected evidence', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each(['google_play', 'microsoft_store'] as const)(
    'rejects a fresh %s delivery without accessing the provider again',
    async provider => {
      const user = await createTestUser()
      vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', `client-${randomUUID()}`)
      const initial = await createMembershipVerification({
        userId: user.id,
        provider,
        purchaseIntentId: null,
        idempotencyKey: randomUUID(),
        trustedProviderContext: {
          environment: 'test',
          applicationId: `ai.voucha.rejected-${randomUUID()}`,
        },
        evidence:
          provider === 'google_play' ? { purchase_token: ' ' } : { publisher_user_id: null },
      })
      let providerCalls = 0
      const unavailable = async (): Promise<never> => {
        providerCalls++
        throw new Error('Rejected evidence must not access an external provider')
      }
      const process = (id: string) =>
        provider === 'google_play'
          ? processGooglePlayMembershipVerification(id, {
              client: {
                getSubscription: unavailable,
                acknowledgeSubscription: unavailable,
              },
            })
          : processMicrosoftStoreMembershipVerification(id, {
              client: {
                queryCollections: unavailable,
                queryRecurrences: unavailable,
              },
            })
      await process(initial.id)
      await expect(getMembershipVerification(user.id, initial.id)).resolves.toMatchObject({
        status: 'rejected',
        reason_code: 'invalid_evidence',
      })
      const replayId = await createTestMembershipVerificationForPriorEvidence(initial.id)
      await expect(getMembershipVerification(user.id, replayId)).resolves.toMatchObject({
        status: 'pending',
      })
      await process(replayId)
      await process(replayId)
      expect(providerCalls).toBe(0)
      await expect(getMembershipVerification(user.id, replayId)).resolves.toMatchObject({
        status: 'rejected',
        reason_code: 'invalid_evidence',
      })
      await expect(getMembershipByUserId(user.id)).resolves.toBeNull()
    },
  )
})
