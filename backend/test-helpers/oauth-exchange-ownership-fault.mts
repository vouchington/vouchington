import type { OAuthExchangeOwnership } from '../services/oauth/authorization-exchange.mts'
import { expireTestOAuthAuthorization } from './entities/oauth-authorizations.mts'

/** Inject one response or persistence failure at the actual production ownership boundary. */
export function createTestOAuthOwnershipPersistence(
  authorizationId: string,
  ownership: OAuthExchangeOwnership,
  fault: string,
  injectedError: Error,
  expireOnWriteFailure: boolean,
  state: { used: boolean },
): OAuthExchangeOwnership['persist'] {
  return async (claimId, providerRequestArmed) => {
    if (
      !state.used &&
      (((fault === 'ownership-write' || fault === 'ownership-response') && claimId) ||
        (fault === 'clear-write' && !claimId))
    ) {
      state.used = true
      if (fault === 'ownership-response') await ownership.persist(claimId, providerRequestArmed)
      if (expireOnWriteFailure) await expireTestOAuthAuthorization(authorizationId)
      throw injectedError
    }
    await ownership.persist(claimId, providerRequestArmed)
  }
}
