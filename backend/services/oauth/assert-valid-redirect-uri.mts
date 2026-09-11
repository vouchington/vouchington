import createHttpError from 'http-errors'
import type { OAuthProvider } from './providers.mts'

export function assertValidRedirectUri(
  redirectUri: string,
  provider: OAuthProvider,
  expectedOrigin: string,
): void {
  let url: URL
  try {
    url = new URL(redirectUri)
  } catch {
    throw createHttpError(422, 'Invalid redirectUri')
  }
  if (url.pathname !== `/auth/callback/${provider}`) {
    throw createHttpError(422, 'Invalid redirectUri')
  }
  if (url.origin !== expectedOrigin) {
    throw createHttpError(422, 'Invalid redirectUri')
  }
}
