import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { processMembershipVerification } from './process-verification.mts'
import { MembershipProviderUnavailableError } from './provider-unavailable.mts'
import { createMembershipVerification, getMembershipVerification } from './verifications.mts'

describe('membership verification provider dispatch', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('keeps a Google Play verification pending and replayable when its service account is unconfigured', async () => {
    const user = await createTestUser()
    const options = {
      userId: user.id,
      provider: 'google_play' as const,
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: `google-token-${randomUUID()}` },
    }
    const verification = await createMembershipVerification(options)
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', undefined)
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY', undefined)

    await expect(processMembershipVerification(verification.id)).rejects.toBeInstanceOf(
      MembershipProviderUnavailableError,
    )
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'pending',
      reason_code: null,
    })
    await expect(createMembershipVerification(options)).resolves.toMatchObject({
      id: verification.id,
      replayed: true,
      status: 'pending',
    })
  })

  it.each(['apple_app_store', 'google_play', 'microsoft_store'] as const)(
    'dispatches malformed %s evidence to its provider rejection path without provider I/O',
    async provider => {
      const user = await createTestUser()
      const applicationId = `ai.voucha.dispatch-${randomUUID()}`
      if (provider === 'google_play') {
        const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
        vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', `dispatch-${randomUUID()}@example.test`)
        vi.stubEnv(
          'GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY',
          privateKey.export({ format: 'pem', type: 'pkcs8' }),
        )
      }
      if (provider === 'microsoft_store')
        vi.stubEnv('MICROSOFT_STORE_CLIENT_ID', `dispatch-${randomUUID()}`)
      const verification = await createMembershipVerification({
        userId: user.id,
        provider,
        purchaseIntentId: null,
        idempotencyKey: randomUUID(),
        trustedProviderContext: { environment: 'test', applicationId },
        evidence: {},
      })

      await expect(processMembershipVerification(verification.id)).resolves.toBeUndefined()
      await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
        status: 'rejected',
        reason_code: 'invalid_evidence',
      })
    },
  )

  it('ignores a verification ID that has no durable provider record', async () => {
    await expect(processMembershipVerification(randomUUID())).resolves.toBeUndefined()
  })

  it('terminalizes a pending verification whose provider has no verification adapter', async () => {
    const user = await createTestUser()
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'stripe',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { checkout_session_id: `cs_test_${randomUUID()}` },
    })

    await expect(processMembershipVerification(verification.id)).resolves.toBeUndefined()
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'rejected',
      reason_code: 'provider_unavailable',
    })
  })
})
