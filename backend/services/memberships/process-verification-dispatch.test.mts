import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { processMembershipVerification } from './process-verification.mts'
import { rejectUnavailableMembershipProvider } from './provider-unavailable.mts'
import { createMembershipVerification, getMembershipVerification } from './verifications.mts'

describe('membership verification provider dispatch', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('terminalizes a Google Play verification when its service account is unconfigured', async () => {
    const user = await createTestUser()
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: `google-token-${randomUUID()}` },
    })
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', undefined)
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY', undefined)

    await expect(processMembershipVerification(verification.id)).resolves.toBeUndefined()
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'rejected',
      reason_code: 'provider_unavailable',
    })
  })

  it('leaves an already-terminal verification unchanged when provider setup is unavailable', async () => {
    const user = await createTestUser()
    const verification = await createMembershipVerification({
      userId: user.id,
      provider: 'google_play',
      purchaseIntentId: null,
      idempotencyKey: randomUUID(),
      evidence: { purchase_token: `google-token-${randomUUID()}` },
    })
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', undefined)
    vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY', undefined)

    await processMembershipVerification(verification.id)
    const terminal = await getMembershipVerification(user.id, verification.id)
    await rejectUnavailableMembershipProvider(verification.id)
    await expect(processMembershipVerification(verification.id)).resolves.toBeUndefined()
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toEqual(terminal)
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
