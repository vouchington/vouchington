const OAUTH_AUTHORIZATION_SERVER_PATHS: ReadonlySet<string> = new Set([
  '/authorize',
  '/register',
  '/revoke',
  '/token',
])

export const isOAuthAuthorizationServerRoute = (pathname: string): boolean =>
  OAUTH_AUTHORIZATION_SERVER_PATHS.has(pathname)

export const isOAuthClientAuthenticatedRoute = (pathname: string): boolean =>
  pathname === '/token' || pathname === '/revoke'
