import { describe, expect, it, vi } from 'vitest'
import { createTestOAuthExchangeDependencies } from '@voucha/test-helpers/oauth-exchange-dependencies'
import { processOAuthAuthorizationExchange } from '../authorization-exchange.mts'

describe('Microsoft OAuth exchange admission', () => {
  it('does not admit provider I/O when the claimed PKCE verifier cannot be decrypted', async () => {
    const dependencies = createTestOAuthExchangeDependencies('microsoft')
    const decryptionFailure = new Error('invalid encrypted PKCE verifier')
    vi.mocked(dependencies.decryptVerifier).mockImplementation(() => {
      throw decryptionFailure
    })

    await expect(processOAuthAuthorizationExchange('flow-id', dependencies)).rejects.toBe(
      decryptionFailure,
    )

    expect(dependencies.validateClaim).not.toHaveBeenCalled()
    expect(dependencies.upsertMicrosoft).not.toHaveBeenCalled()
    expect(dependencies.rejectExhausted).toHaveBeenCalledExactlyOnceWith('flow-id', 'claim-id')
    expect(dependencies.releaseClaim).toHaveBeenCalledExactlyOnceWith('flow-id', 'claim-id')
  })
})
