import { describe, expect, it, vi } from 'vitest'
import {
  processOAuthAuthorizationExchange,
  type OAuthExchangeOwnership,
} from '../authorization-exchange.mts'
import { createTestOAuthExchangeDependencies as exchangeDependencies } from '@voucha/test-helpers/oauth-exchange-dependencies'

describe('OAuth authorization provider exchange processing', () => {
  it.each(['facebook', 'x', 'github', 'linkedin'] as const)(
    'persists the armed marker before admitting the %s provider and clears it only after success',
    async provider => {
      const dependencies = exchangeDependencies(provider)
      const writes: Array<{ claimId: string | null; armed: boolean | undefined }> = []
      const providerCall =
        provider === 'facebook'
          ? dependencies.upsertFacebook
          : provider === 'x'
            ? dependencies.upsertX
            : provider === 'github'
              ? dependencies.upsertGithub
              : dependencies.upsertLinkedIn
      vi.mocked(providerCall).mockImplementation(async () => {
        expect(writes.at(-1)).toEqual({ claimId: 'claim-id', armed: true })
        return {
          user_id: null,
          provider_user_id: 'provider-user',
          provider_user_email_address: null,
          provider_user_data: {},
        }
      })
      await processOAuthAuthorizationExchange('flow-id', dependencies, {
        async persist(claimId, armed) {
          writes.push({ claimId, armed })
        },
      })
      expect(writes).toEqual([
        { claimId: 'claim-id', armed: undefined },
        { claimId: 'claim-id', armed: true },
        { claimId: null, armed: undefined },
      ])
      expect(providerCall).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['facebook', 'x', 'github', 'linkedin'] as const)(
    'does not admit the %s provider when the armed ownership write fails',
    async provider => {
      const dependencies = exchangeDependencies(provider)
      const failure = new Error('owned provider admission storage failure')
      await expect(
        processOAuthAuthorizationExchange('flow-id', dependencies, {
          async persist(_claimId, armed) {
            if (armed) throw failure
          },
        }),
      ).rejects.toBe(failure)
      expect(dependencies.upsertFacebook).not.toHaveBeenCalled()
      expect(dependencies.upsertX).not.toHaveBeenCalled()
      expect(dependencies.upsertGithub).not.toHaveBeenCalled()
      expect(dependencies.upsertLinkedIn).not.toHaveBeenCalled()
      expect(dependencies.releaseClaim).toHaveBeenCalledWith('flow-id', 'claim-id')
    },
  )

  it.each(['facebook', 'x', 'github', 'linkedin'] as const)(
    'retains armed ownership and the raw %s provider exception for terminal continuation',
    async provider => {
      const failure =
        provider === 'github'
          ? Symbol('raw provider outcome failure')
          : new Error('provider outcome is unknown')
      const dependencies = exchangeDependencies(provider)
      const providerCall =
        provider === 'facebook'
          ? dependencies.upsertFacebook
          : provider === 'x'
            ? dependencies.upsertX
            : provider === 'github'
              ? dependencies.upsertGithub
              : dependencies.upsertLinkedIn
      vi.mocked(providerCall).mockRejectedValue(failure)
      const writes: Array<{ claimId: string | null; armed: boolean | undefined }> = []
      await expect(
        processOAuthAuthorizationExchange('flow-id', dependencies, {
          async persist(claimId, armed) {
            writes.push({ claimId, armed })
          },
        }),
      ).rejects.toBe(failure)
      expect(writes).toEqual([
        { claimId: 'claim-id', armed: undefined },
        { claimId: 'claim-id', armed: true },
      ])
      expect(providerCall).toHaveBeenCalledTimes(1)
      expect(dependencies.upsertFacebook).toHaveBeenCalledTimes(provider === 'facebook' ? 1 : 0)
      expect(dependencies.upsertX).toHaveBeenCalledTimes(provider === 'x' ? 1 : 0)
      expect(dependencies.upsertGithub).toHaveBeenCalledTimes(provider === 'github' ? 1 : 0)
      expect(dependencies.upsertLinkedIn).toHaveBeenCalledTimes(provider === 'linkedin' ? 1 : 0)
      expect(dependencies.rejectExhausted).not.toHaveBeenCalled()
      expect(dependencies.releaseClaim).not.toHaveBeenCalled()
    },
  )

  it('releases the exact unused claim when initial ownership persistence fails', async () => {
    const dependencies = exchangeDependencies('x')
    const failure = new Error('initial ownership write failed')
    await expect(
      processOAuthAuthorizationExchange('flow-id', dependencies, {
        persist: vi.fn<OAuthExchangeOwnership['persist']>().mockRejectedValue(failure),
      }),
    ).rejects.toBe(failure)
    expect(dependencies.releaseClaim).toHaveBeenCalledExactlyOnceWith('flow-id', 'claim-id')
    expect(dependencies.decryptCode).not.toHaveBeenCalled()
    expect(dependencies.upsertX).not.toHaveBeenCalled()
    expect(dependencies.rejectExhausted).toHaveBeenCalledExactlyOnceWith('flow-id', 'claim-id')
  })

  it('retains ownership persistence as primary when releasing the unused claim also fails', async () => {
    const dependencies = exchangeDependencies('x')
    const failure = new Error('initial ownership write failed')
    const releaseFailure = new Error('unused claim release failed')
    vi.mocked(dependencies.releaseClaim).mockRejectedValue(releaseFailure)
    const outcome = await processOAuthAuthorizationExchange('flow-id', dependencies, {
      persist: vi.fn<OAuthExchangeOwnership['persist']>().mockRejectedValue(failure),
    }).catch(err => err)
    expect(outcome).toBeInstanceOf(AggregateError)
    if (!(outcome instanceof AggregateError)) throw new Error('Expected ordered cleanup failures')
    expect(outcome.errors).toEqual([failure, releaseFailure])
    expect(outcome.cause).toBe(failure)
    expect(dependencies.decryptCode).not.toHaveBeenCalled()
    expect(dependencies.upsertX).not.toHaveBeenCalled()
  })

  it('does not admit a provider after the persisted marker loses its native claim authority', async () => {
    const dependencies = exchangeDependencies('github')
    const failure = new Error('owned claim was terminalized during queue persistence')
    const writes: Array<{ claimId: string | null; armed: boolean | undefined }> = []
    vi.mocked(dependencies.validateClaim).mockImplementation(async () => {
      expect(writes.at(-1)).toEqual({ claimId: 'claim-id', armed: true })
      throw failure
    })
    await expect(
      processOAuthAuthorizationExchange('flow-id', dependencies, {
        async persist(claimId, armed) {
          writes.push({ claimId, armed })
        },
      }),
    ).rejects.toBe(failure)
    expect(dependencies.validateClaim).toHaveBeenCalledExactlyOnceWith('flow-id', 'claim-id')
    expect(dependencies.upsertGithub).not.toHaveBeenCalled()
    expect(dependencies.releaseClaim).not.toHaveBeenCalled()
    expect(writes.at(-1)).toEqual({ claimId: 'claim-id', armed: true })
  })

  it('settles exhaustion before propagating the fifth initial ownership write failure', async () => {
    const dependencies = exchangeDependencies('x')
    const failure = new Error('fifth ownership write failed')
    vi.mocked(dependencies.rejectExhausted).mockResolvedValue(true)
    await expect(
      processOAuthAuthorizationExchange('flow-id', dependencies, {
        persist: vi.fn<OAuthExchangeOwnership['persist']>().mockRejectedValue(failure),
      }),
    ).rejects.toBe(failure)
    expect(dependencies.rejectExhausted).toHaveBeenCalledExactlyOnceWith('flow-id', 'claim-id')
    expect(dependencies.releaseClaim).not.toHaveBeenCalled()
    expect(dependencies.decryptCode).not.toHaveBeenCalled()
    expect(dependencies.upsertX).not.toHaveBeenCalled()
  })

  it('retains ownership failure before native exhaustion failure without an uncertain release', async () => {
    const dependencies = exchangeDependencies('x')
    const failure = new Error('ownership write failed')
    const nativeFailure = new Error('exhaustion mutation failed')
    vi.mocked(dependencies.rejectExhausted).mockRejectedValue(nativeFailure)
    const outcome = await processOAuthAuthorizationExchange('flow-id', dependencies, {
      persist: vi.fn<OAuthExchangeOwnership['persist']>().mockRejectedValue(failure),
    }).catch(err => err)
    expect(outcome).toBeInstanceOf(AggregateError)
    if (!(outcome instanceof AggregateError)) throw new Error('Expected ordered cleanup errors')
    expect(outcome.errors).toEqual([failure, nativeFailure])
    expect(outcome.cause).toBe(failure)
    expect(dependencies.releaseClaim).not.toHaveBeenCalled()
    expect(dependencies.upsertX).not.toHaveBeenCalled()
  })

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

  it('routes a claimed LinkedIn code through confidential exchange and durable claim', async () => {
    const dependencies = exchangeDependencies('linkedin')
    await processOAuthAuthorizationExchange('flow-id', dependencies)

    expect(dependencies.decryptVerifier).not.toHaveBeenCalled()
    expect(dependencies.upsertLinkedIn).toHaveBeenCalledWith(
      'provider-code',
      'https://example.com/callback',
      undefined,
      expect.objectContaining({
        authorizationId: 'flow-id',
        authorizationClaimId: 'claim-id',
        signal: expect.any(AbortSignal),
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
      err => err as AggregateError,
    )

    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError)) throw new Error('Expected AggregateError')
    expect(error.errors).toEqual([providerFailure, releaseFailure])
    expect(error.cause).toBe(providerFailure)
  })
})
