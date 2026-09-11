import { describe, expect, it, vi } from 'vitest'
import { processOAuthAuthorizationExchange } from '../authorization-exchange.mts'
import type { BrokerOAuthProvider } from '../broker-config.mts'

type ExchangeDependencies = NonNullable<Parameters<typeof processOAuthAuthorizationExchange>[1]>

describe('OAuth authorization provider exchange processing', () => {
  it('releases the claim when authorization-code decryption fails', async () => {
    const failure = new Error('authorization code decryption failed')
    const dependencies = exchangeDependencies('x')
    vi.mocked(dependencies.decryptCode).mockImplementation(() => {
      throw failure
    })

    await expect(processOAuthAuthorizationExchange('flow-id', dependencies)).rejects.toBe(failure)

    expect(dependencies.rejectExhausted).toHaveBeenCalledWith('flow-id', 'claim-id')
    expect(dependencies.releaseClaim).toHaveBeenCalledWith('flow-id', 'claim-id')
    expect(dependencies.decryptVerifier).not.toHaveBeenCalled()
    expect(dependencies.upsertX).not.toHaveBeenCalled()
  })

  it('routes a claimed Facebook code without PKCE', async () => {
    const dependencies = exchangeDependencies('facebook')

    await processOAuthAuthorizationExchange('flow-id', dependencies)

    expect(dependencies.decryptCode).toHaveBeenCalledWith('flow-id', 'encrypted-code')
    expect(dependencies.upsertFacebook).toHaveBeenCalledWith(
      'provider-code',
      'https://example.com/callback',
      expect.objectContaining({
        authorizationId: 'flow-id',
        authorizationClaimId: 'claim-id',
        signal: expect.any(AbortSignal),
      }),
    )
    expect(dependencies.decryptVerifier).not.toHaveBeenCalled()
  })

  it('routes a claimed X code with its PKCE verifier', async () => {
    const dependencies = exchangeDependencies('x')

    await processOAuthAuthorizationExchange('flow-id', dependencies)

    expect(dependencies.decryptVerifier).toHaveBeenCalledWith('flow-id', 'encrypted-verifier')
    expect(dependencies.upsertX).toHaveBeenCalledWith(
      'provider-code',
      'https://example.com/callback',
      'provider-verifier',
      expect.objectContaining({ authorizationId: 'flow-id' }),
    )
  })

  it('routes a claimed GitHub code with its PKCE verifier', async () => {
    const dependencies = exchangeDependencies('github')

    await processOAuthAuthorizationExchange('flow-id', dependencies)

    expect(dependencies.decryptVerifier).toHaveBeenCalledWith('flow-id', 'encrypted-verifier')
    expect(dependencies.upsertGithub).toHaveBeenCalledWith(
      'provider-code',
      'https://example.com/callback',
      expect.objectContaining({
        codeVerifier: 'provider-verifier',
        authorizationId: 'flow-id',
      }),
    )
  })

  it('treats an exhausted provider failure as durably terminal', async () => {
    const dependencies = exchangeDependencies('facebook', new Error('provider unavailable'))
    vi.mocked(dependencies.rejectExhausted).mockResolvedValue(true)

    await expect(
      processOAuthAuthorizationExchange('flow-id', dependencies),
    ).resolves.toBeUndefined()

    expect(dependencies.releaseClaim).not.toHaveBeenCalled()
  })

  it('releases a retryable claim and preserves the provider failure', async () => {
    const failure = new Error('provider unavailable')
    const dependencies = exchangeDependencies('facebook', failure)

    await expect(processOAuthAuthorizationExchange('flow-id', dependencies)).rejects.toBe(failure)
    expect(dependencies.releaseClaim).toHaveBeenCalledWith('flow-id', 'claim-id')
  })

  it('aggregates provider and durable-claim release failures', async () => {
    const providerFailure = new Error('provider unavailable')
    const releaseFailure = new Error('database unavailable')
    const dependencies = exchangeDependencies('facebook', providerFailure)
    vi.mocked(dependencies.releaseClaim).mockRejectedValue(releaseFailure)

    const error = await processOAuthAuthorizationExchange('flow-id', dependencies).catch(
      caught => caught as AggregateError,
    )

    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError)) throw new Error('Expected AggregateError')
    expect(error.errors).toEqual([providerFailure, releaseFailure])
    expect(error.cause).toBe(releaseFailure)
  })
})

function exchangeDependencies(
  provider: BrokerOAuthProvider,
  providerFailure?: Error,
): ExchangeDependencies {
  const successfulAccount = {
    user_id: null,
    provider_user_id: 'provider-user',
    provider_user_email_address: null,
    provider_user_data: {},
  }
  return {
    claim: vi.fn<ExchangeDependencies['claim']>(async () => ({
      id: 'flow-id',
      provider,
      redirect_uri: 'https://example.com/callback',
      callback_code_ciphertext: 'encrypted-code',
      pkce_verifier_ciphertext: 'encrypted-verifier',
      exchange_claim_id: 'claim-id',
    })),
    decryptCode: vi.fn<ExchangeDependencies['decryptCode']>(() => 'provider-code'),
    decryptVerifier: vi.fn<ExchangeDependencies['decryptVerifier']>(() => 'provider-verifier'),
    upsertFacebook: vi.fn<ExchangeDependencies['upsertFacebook']>(async () => {
      if (provider === 'facebook' && providerFailure) throw providerFailure
      return successfulAccount
    }),
    upsertGithub: vi.fn<ExchangeDependencies['upsertGithub']>(async () => {
      if (provider === 'github' && providerFailure) throw providerFailure
      return successfulAccount
    }),
    upsertX: vi.fn<ExchangeDependencies['upsertX']>(async () => {
      if (provider === 'x' && providerFailure) throw providerFailure
      return successfulAccount
    }),
    rejectExhausted: vi.fn<ExchangeDependencies['rejectExhausted']>(async () => false),
    releaseClaim: vi.fn<ExchangeDependencies['releaseClaim']>(async () => undefined),
  }
}
