import {
  FACEBOOK_APP_ID,
  FACEBOOK_GRAPHQL_VERSION,
  MICROSOFT_TENANT_ID,
  GITHUB_CLIENT_ID,
  GOOGLE_CLIENT_ID,
  LINKEDIN_CLIENT_ID,
  MICROSOFT_CLIENT_ID,
  X_CLIENT_ID,
} from '@voucha/config'
import type { BrokerCallbackMode, BrokerOAuthProvider } from './broker-config.mts'

export function buildProviderAuthorizationUrl(options: {
  provider: BrokerOAuthProvider
  callbackMode: BrokerCallbackMode
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  reAuthNonce?: string
}): string {
  const shared = {
    redirect_uri: options.redirectUri,
    state: options.state,
    response_type: 'code',
  }
  switch (options.provider) {
    case 'facebook':
      // Facebook's authorization endpoint does not accept RFC 7636 PKCE parameters.
      return withQuery(`https://www.facebook.com/${FACEBOOK_GRAPHQL_VERSION}/dialog/oauth`, {
        ...shared,
        client_id: options.clientId,
        scope: 'email,user_friends',
      })
    case 'x':
      return withQuery('https://x.com/i/oauth2/authorize', {
        ...shared,
        client_id: options.clientId,
        scope: 'tweet.read users.read follows.read offline.access',
        code_challenge: options.codeChallenge,
        code_challenge_method: 'S256',
      })
    case 'github':
      return withQuery('https://github.com/login/oauth/authorize', {
        ...shared,
        client_id: options.clientId,
        scope: 'read:user user:email',
        code_challenge: options.codeChallenge,
        code_challenge_method: 'S256',
      })
    case 'linkedin':
      // This broker uses a confidential HTTPS callback, not LinkedIn's separate native-PKCE endpoint.
      return withQuery('https://www.linkedin.com/oauth/v2/authorization', {
        ...shared,
        client_id: options.clientId,
        scope: 'openid profile email',
        ...(options.callbackMode === 'native' ? { enable_extended_login: 'true' } : {}),
      })
    case 'microsoft':
      return withQuery(
        `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID || 'common'}/oauth2/v2.0/authorize`,
        {
          ...shared,
          client_id: options.clientId,
          scope: 'openid profile email User.Read',
          response_mode: 'query',
          ...(options.reAuthNonce && {
            nonce: options.reAuthNonce,
            prompt: 'login',
          }),
          code_challenge: options.codeChallenge,
          code_challenge_method: 'S256',
        },
      )
    case 'google':
      return withQuery('https://accounts.google.com/o/oauth2/v2/auth', {
        ...shared,
        client_id: options.clientId,
        scope: 'openid profile email',
        access_type: 'online',
        code_challenge: options.codeChallenge,
        code_challenge_method: 'S256',
      })
  }
}

function withQuery(url: string, params: Record<string, string>): string {
  return `${url}?${new URLSearchParams(params).toString()}`
}

export function getProviderClientId(provider: BrokerOAuthProvider): string {
  const clientIds = {
    facebook: FACEBOOK_APP_ID,
    x: X_CLIENT_ID,
    github: GITHUB_CLIENT_ID,
    linkedin: LINKEDIN_CLIENT_ID,
    microsoft: MICROSOFT_CLIENT_ID,
    google: GOOGLE_CLIENT_ID,
  }
  const clientId = clientIds[provider]
  if (!clientId) throw new Error(`${provider} OAuth client ID is not configured`)
  return clientId
}
