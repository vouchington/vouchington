const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

export const MAX_OAUTH_REDIRECT_URIS = 10
export const MAX_OAUTH_REDIRECT_URI_LENGTH = 2048

export type OAuthRedirectUriValidationCode =
  | 'invalid_count'
  | 'invalid_uri'
  | 'wildcard'
  | 'userinfo_or_fragment'
  | 'invalid_scheme'
  | 'duplicate'

export type OAuthRedirectUriValidationResult =
  | { valid: true; redirectUris: string[] }
  | { valid: false; code: OAuthRedirectUriValidationCode }

/**
 * Validates OAuth redirect URIs without runtime-specific APIs so the web form and server share one
 * contract. The backend adapts its stable protocol descriptions from the returned error code.
 */
export function validateOAuthRedirectUris(
  values: unknown,
  options: { serialize?: boolean } = {},
): OAuthRedirectUriValidationResult {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_OAUTH_REDIRECT_URIS) {
    return { valid: false, code: 'invalid_count' }
  }

  const redirectUris: string[] = []
  for (const value of values) {
    if (typeof value !== 'string' || value.length > MAX_OAUTH_REDIRECT_URI_LENGTH) {
      return { valid: false, code: 'invalid_uri' }
    }
    if (/[\s\p{Cc}\p{Z}]/u.test(value)) return { valid: false, code: 'invalid_uri' }

    let uri: URL
    try {
      uri = new URL(value)
    } catch {
      return { valid: false, code: 'invalid_uri' }
    }

    if (value.includes('*') || uri.pathname.includes('*')) {
      return { valid: false, code: 'wildcard' }
    }
    if (uri.username || uri.password || uri.hash) {
      return { valid: false, code: 'userinfo_or_fragment' }
    }
    if (
      uri.protocol !== 'https:' &&
      !(uri.protocol === 'http:' && isLoopbackHostname(uri.hostname))
    ) {
      return { valid: false, code: 'invalid_scheme' }
    }

    const redirectUri = options.serialize === false ? value : uri.toString()
    if (redirectUri.length > MAX_OAUTH_REDIRECT_URI_LENGTH) {
      return { valid: false, code: 'invalid_uri' }
    }
    redirectUris.push(redirectUri)
  }

  if (new Set(redirectUris).size !== redirectUris.length) {
    return { valid: false, code: 'duplicate' }
  }
  return { valid: true, redirectUris }
}

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname) || hostname === '[::1]'
}
