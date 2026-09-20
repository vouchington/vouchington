const APPLE_APP_STORE_NOTIFICATION_PATH = '/api/v1/memberships/apple-app-store/notifications'
const GOOGLE_PLAY_NOTIFICATION_PATH = '/api/v1/memberships/google-play/notifications'
const OAUTH_SERVER_POST_PATHS = new Set(['/register', '/revoke', '/token'])
const FEDERATION_GET_INGRESS_PATHS = new Set([
  '/.well-known/webfinger',
  '/.well-known/nodeinfo',
  '/nodeinfo/2.0',
  '/client-metadata.json',
])
const ACTIVITYPUB_ACTOR_PATH_RE =
  /^\/ap\/users\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const normalizeIngressPathname = (pathname: string): string => {
  const withoutTrailingSlash =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return withoutTrailingSlash.toLowerCase()
}

/**
 * Requests from external servers do not carry a browser session. Keeping their method/path
 * classification centralized prevents a new ingress from accidentally minting or forwarding dt/st
 * cookies, while each origin remains responsible for authenticating its own sender.
 */
export const isExternalServerToServerIngress = (method: string, pathname: string): boolean => {
  const normalizedPathname = normalizeIngressPathname(pathname)
  const normalizedMethod = method.toUpperCase()
  if (
    normalizedMethod === 'POST' &&
    (normalizedPathname === APPLE_APP_STORE_NOTIFICATION_PATH ||
      normalizedPathname === GOOGLE_PLAY_NOTIFICATION_PATH ||
      OAUTH_SERVER_POST_PATHS.has(normalizedPathname))
  ) {
    return true
  }

  if (normalizedMethod === 'GET') {
    return (
      FEDERATION_GET_INGRESS_PATHS.has(normalizedPathname) ||
      ACTIVITYPUB_ACTOR_PATH_RE.test(normalizedPathname)
    )
  }

  return normalizedMethod === 'POST' && normalizedPathname === '/ap/inbox'
}
