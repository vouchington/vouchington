import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { processMembershipVerification } from './process-verification.mts'
import { createMembershipVerification, getMembershipVerification } from './verifications.mts'

describe('membership verification provider dispatch', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('does not claim a Google Play verification when its service account is unconfigured', async () => {
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

    await expect(processMembershipVerification(verification.id)).rejects.toThrow(
      'GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL',
    )
    await expect(getMembershipVerification(user.id, verification.id)).resolves.toMatchObject({
      status: 'pending',
    })
  })

  it('ignores a verification ID that has no durable provider record', async () => {
    await expect(processMembershipVerification(randomUUID())).resolves.toBeUndefined()
  })
})
