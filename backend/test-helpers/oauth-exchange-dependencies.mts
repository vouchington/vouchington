import { vi } from 'vitest'
import type { BrokerOAuthProvider } from '../services/oauth/broker-config.mts'
import type { OAuthAuthorizationExchangeDependencies as ExchangeDependencies } from '../services/oauth/authorization-exchange.mts'

export function createTestOAuthExchangeDependencies(
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
    validateClaim: vi.fn<ExchangeDependencies['validateClaim']>(async () => undefined),
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
    upsertLinkedIn: vi.fn<ExchangeDependencies['upsertLinkedIn']>(async () => {
      if (provider === 'linkedin' && providerFailure) throw providerFailure
      return successfulAccount
    }),
    upsertMicrosoft: vi.fn<ExchangeDependencies['upsertMicrosoft']>(async () => {
      if (provider === 'microsoft' && providerFailure) throw providerFailure
      return successfulAccount
    }),
    upsertX: vi.fn<ExchangeDependencies['upsertX']>(async () => {
      if (provider === 'x' && providerFailure) throw providerFailure
      return successfulAccount
    }),
    upsertGoogle: vi.fn<ExchangeDependencies['upsertGoogle']>(async () => successfulAccount),
    rejectExhausted: vi.fn<ExchangeDependencies['rejectExhausted']>(async () => false),
    releaseClaim: vi.fn<ExchangeDependencies['releaseClaim']>(async () => undefined),
  }
}
