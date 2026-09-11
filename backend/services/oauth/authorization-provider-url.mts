import { FACEBOOK_GRAPHQL_VERSION } from '@voucha/config'
import type { BrokerOAuthProvider } from './broker-config.mts'

export function buildProviderAuthorizationUrl(options: {
  provider: BrokerOAuthProvider
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
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
  }
}

function withQuery(url: string, params: Record<string, string>): string {
  return `${url}?${new URLSearchParams(params).toString()}`
}
