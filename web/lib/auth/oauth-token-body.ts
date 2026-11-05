import type { OAuthLoginToken } from '@/lib/auth/oauth-login-token'

// oxlint-disable-next-line typescript/consistent-return -- Typed token.provider switch is exhaustive; Oxlint misses its terminal flow.
export function tokenToBody(token: OAuthLoginToken): Record<string, unknown> {
  switch (token.provider) {
    case 'facebook': {
      return { token: token.token }
    }
    case 'apple': {
      return {
        token: token.token,
        nonce: token.nonce,
        ...(token.userData && { userData: token.userData }),
      }
    }
    case 'google': {
      return { credential: token.credential }
    }
    case 'x':
    case 'linkedin':
    case 'microsoft': {
      return { code: token.code, codeVerifier: token.codeVerifier, redirectUri: token.redirectUri }
    }
    case 'github': {
      return { code: token.code, redirectUri: token.redirectUri }
    }
  }
}
