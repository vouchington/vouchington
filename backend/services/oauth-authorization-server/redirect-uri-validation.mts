import { invalidRedirectUri } from './errors.mts'

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])
const MAX_URI_LENGTH = 2048
export const MAX_REDIRECT_URIS = 10

export function validateRedirectUris(values: unknown): string[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > MAX_REDIRECT_URIS) {
    throw invalidRedirectUri(
      `redirect_uris must contain between 1 and ${MAX_REDIRECT_URIS} entries`,
    )
  }
  const redirectUris = values.map(value => {
    if (typeof value !== 'string' || value.length > MAX_URI_LENGTH) {
      throw invalidRedirectUri('redirect_uris contains an invalid URI')
    }
    let uri: URL
    try {
      uri = new URL(value)
    } catch {
      throw invalidRedirectUri('redirect_uris contains an invalid URI')
    }
    if (value.includes('*') || uri.pathname.includes('*')) {
      throw invalidRedirectUri('redirect URIs cannot contain wildcards')
    }
    if (uri.username || uri.password || uri.hash) {
      throw invalidRedirectUri('redirect URIs cannot contain userinfo or fragments')
    }
    const loopback = isLoopbackHostname(uri.hostname)
    if (uri.protocol !== 'https:' && !(uri.protocol === 'http:' && loopback)) {
      throw invalidRedirectUri('redirect URIs must use HTTPS or loopback HTTP')
    }
    const serialized = uri.toString()
    if (serialized.length > MAX_URI_LENGTH) {
      throw invalidRedirectUri('redirect_uris contains an invalid URI')
    }
    return serialized
  })
  if (new Set(redirectUris).size !== redirectUris.length) {
    throw invalidRedirectUri('redirect_uris contains duplicates')
  }
  return redirectUris
}

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname) || hostname === '[::1]'
}
