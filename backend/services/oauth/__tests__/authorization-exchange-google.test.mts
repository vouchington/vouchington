import { describe, expect, it } from 'vitest'
import { processOAuthAuthorizationExchange } from '../authorization-exchange.mts'
import { createTestOAuthExchangeDependencies as exchangeDependencies } from '@voucha/test-helpers/oauth-exchange-dependencies'

describe('Google OAuth authorization exchange routing', () => {
  it('decrypts and forwards the PKCE verifier with the durable claim signal', async () => {
    const dependencies = exchangeDependencies('google')

    await processOAuthAuthorizationExchange('flow-id', dependencies)

    expect(dependencies.decryptCode).toHaveBeenCalledExactlyOnceWith('flow-id', 'encrypted-code')
    expect(dependencies.decryptVerifier).toHaveBeenCalledExactlyOnceWith(
      'flow-id',
      'encrypted-verifier',
    )
    expect(dependencies.upsertGoogle).toHaveBeenCalledExactlyOnceWith(
      'provider-code',
      'https://example.com/callback',
      'provider-verifier',
      expect.objectContaining({
        authorizationId: 'flow-id',
        authorizationClaimId: 'claim-id',
        signal: expect.any(AbortSignal),
      }),
    )
    for (const upsert of [
      dependencies.upsertFacebook,
      dependencies.upsertX,
      dependencies.upsertGithub,
      dependencies.upsertLinkedIn,
      dependencies.upsertMicrosoft,
    ]) {
      expect(upsert).not.toHaveBeenCalled()
    }
  })
})
