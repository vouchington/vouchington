import {
  type OAuthProtocolError,
  authorizationErrorRedirect,
  matchesRegisteredRedirectUri,
} from '@vouchington/oauth-server'
import { getOAuthIssuer } from './resources.mts'
import type { OAuthClient } from './types.mts'
import { createProtocolClientLookup } from './protocol-client.mts'
import { findNativeOAuthClientDocument } from './native-clients.mts'

export async function getOAuthAuthorizationErrorRedirect(
  input: {
    clientId: string
    redirectUri: string
    state: unknown
    error: OAuthProtocolError
  },
  eligibleClient: OAuthClient | null,
): Promise<string | null> {
  if (
    !findNativeOAuthClientDocument(input.clientId) ||
    !eligibleClient ||
    eligibleClient.client_id !== input.clientId ||
    !matchesRegisteredRedirectUri(input.redirectUri, eligibleClient.redirect_uris)
  )
    return null
  return authorizationErrorRedirect(input, {
    issuer: getOAuthIssuer(),
    clients: {
      findClient: createProtocolClientLookup(async () => eligibleClient, undefined),
    },
  })
}
