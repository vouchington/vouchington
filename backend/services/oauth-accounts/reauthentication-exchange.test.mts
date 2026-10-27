import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { completeProviderReAuthExchange } from './reauthentication-exchange.mts'

describe('linked-provider fresh exchange admission', () => {
  it('rejects a different verified provider subject before any persistence', async () => {
    const context = {
      userId: randomUUID(),
      provider: 'google' as const,
      providerUserId: `linked-${randomUUID()}`,
      flowId: randomUUID(),
      nonceHash: 'verified-nonce-hash',
    }
    await expect(
      completeProviderReAuthExchange('google', `other-${randomUUID()}`, { reAuth: context }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('requires the exact claimed callback before looking up the linked account', async () => {
    const context = {
      userId: randomUUID(),
      provider: 'google' as const,
      providerUserId: `linked-${randomUUID()}`,
      flowId: randomUUID(),
      nonceHash: 'verified-nonce-hash',
    }
    await expect(
      completeProviderReAuthExchange('google', context.providerUserId, {
        reAuth: context,
        authorizationId: randomUUID(),
        authorizationClaimId: randomUUID(),
      }),
    ).rejects.toThrow('requires its own claimed authorization')
  })

  it('does not complete a claim after the linked account is gone', async () => {
    const context = {
      userId: randomUUID(),
      provider: 'google' as const,
      providerUserId: `removed-${randomUUID()}`,
      flowId: randomUUID(),
      nonceHash: 'verified-nonce-hash',
    }
    await expect(
      completeProviderReAuthExchange('google', context.providerUserId, {
        reAuth: context,
        authorizationId: context.flowId,
        authorizationClaimId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
