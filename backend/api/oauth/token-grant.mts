import {
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
  OAuthProtocolError,
  type OAuthTokenResponse,
} from '@services/oauth-authorization-server'
import { requiredFormValue } from './protocol-helpers.mts'

// RFC 8707 makes `resource` optional at the token endpoint; the service rejects a value that does
// not match the resource the code or refresh family is bound to.
export async function exchangeOAuthTokenGrant(
  form: URLSearchParams,
  client: { clientId: string; clientSecret?: string },
): Promise<OAuthTokenResponse> {
  const grantType = form.get('grant_type')
  const resource = form.has('resource') ? { resource: requiredFormValue(form, 'resource') } : {}
  if (grantType === 'authorization_code') {
    return exchangeOAuthAuthorizationCode({
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      code: requiredFormValue(form, 'code'),
      codeVerifier: form.get('code_verifier'),
      redirectUri: requiredFormValue(form, 'redirect_uri'),
      ...resource,
    })
  }
  if (grantType === 'refresh_token') {
    return exchangeOAuthRefreshToken({
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      refreshToken: requiredFormValue(form, 'refresh_token'),
      ...(form.has('scope') ? { scope: requiredFormValue(form, 'scope') } : {}),
      ...resource,
    })
  }
  throw new OAuthProtocolError('unsupported_grant_type', 'grant_type is not supported')
}
