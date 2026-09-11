import { getSiteUrl } from '@modules/utils'
import type { OAuthClientMetadataInput } from '@atproto/oauth-client-node'
import { BLUESKY_JWT_ALGORITHM, getBlueskyKeyset } from './keyset.mts'

// AT Protocol OAuth scope granting the full read/write account access this app needs to place
// app.bsky.graph.follow writes on the user's behalf (Phase D3). Per-lexicon
// scopes are not yet standardized across the ecosystem; 'transition:generic' is the documented
// interim scope for that access. 'atproto' is required by every AT Protocol OAuth client.
const BLUESKY_OAUTH_SCOPE = 'atproto transition:generic'

export function getBlueskyClientId(): string {
  return getSiteUrl('/client-metadata.json')
}

export function getBlueskyRedirectUri(): string {
  return getSiteUrl('/api/v1/auth/bluesky/callback')
}

// The client metadata document this app both self-hosts (at GET /client-metadata.json, so the
// authorization server can fetch and validate it by client_id) and passes to NodeOAuthClient's
// constructor — both call sites import this same function (and the same getBlueskyKeyset()
// promise-memoized singleton) so the document served and the document the SDK validates itself
// against can never drift apart.
//
// token_endpoint_auth_method is 'private_key_jwt' (a confidential client), not 'none': a public
// client's refresh tokens are more tightly scoped and shorter-lived by AT Protocol authorization
// servers, since there's no way to prove the token-refresh request came from this app rather than
// anyone who intercepted a stored refresh token. Signing token requests with a private key this
// app alone holds buys the confidential-client refresh-token lifetime — see keyset.mts for the
// ES256 signing key this depends on. The public half is embedded inline as `jwks` (rather than a
// separate `jwks_uri` route) since @atproto/oauth-types' client-metadata schema accepts inline
// JWKS directly, and @atproto/oauth-client's validateClientMetadata already does this same
// keyset-to-jwks derivation internally when jwks/jwks_uri are omitted — see validate-client-metadata.ts.
export async function getBlueskyClientMetadata(): Promise<OAuthClientMetadataInput> {
  const keyset = await getBlueskyKeyset()
  return {
    client_id: getBlueskyClientId(),
    client_name: 'Voucha',
    client_uri: getSiteUrl('/'),
    redirect_uris: [getBlueskyRedirectUri()],
    scope: BLUESKY_OAUTH_SCOPE,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    application_type: 'web',
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_signing_alg: BLUESKY_JWT_ALGORITHM,
    jwks: keyset.toJSON(),
    dpop_bound_access_tokens: true,
  }
}
