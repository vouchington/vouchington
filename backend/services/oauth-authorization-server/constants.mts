export const AUTHORIZATION_REQUEST_TTL_MS = 10 * 60 * 1000
export const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

export const OAUTH_SECRET_PURPOSES = {
  accessToken: 'oauth-server-access-token',
  authorizationCode: 'oauth-server-authorization-code',
  browserBinding: 'oauth-server-browser-binding',
  clientSecret: 'oauth-server-client-secret',
  refreshToken: 'oauth-server-refresh-token',
} as const
