import createHttpError from 'http-errors'
import { assertValidRedirectUri } from './assert-valid-redirect-uri.mts'

export type ParsedOAuthCallbackBody<RequireCodeVerifier extends boolean> =
  RequireCodeVerifier extends true
    ? { code: string; redirectUri: string; codeVerifier: string }
    : { code: string; redirectUri: string }

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function parseOAuthCallbackBody<RequireCodeVerifier extends boolean>(
  body: Record<string, unknown>,
  provider: 'x' | 'linkedin' | 'microsoft' | 'github',
  expectedOrigin: string | undefined,
  opts: { requireCodeVerifier: RequireCodeVerifier },
): ParsedOAuthCallbackBody<RequireCodeVerifier> {
  const code = str(body.code)
  const redirectUri = str(body.redirectUri)
  const codeVerifier = str(body.codeVerifier)
  if (!code) throw createHttpError(422, 'code is required')
  if (!redirectUri) throw createHttpError(422, 'redirectUri is required')
  if (opts.requireCodeVerifier && !codeVerifier) {
    throw createHttpError(422, 'codeVerifier is required')
  }
  if (expectedOrigin) assertValidRedirectUri(redirectUri, provider, expectedOrigin)
  // codeVerifier's presence is enforced above precisely when RequireCodeVerifier is true, which
  // TS can't infer from the runtime check — the assertion here is the only place that fact needs
  // to be encoded.
  return (
    opts.requireCodeVerifier ? { code, redirectUri, codeVerifier } : { code, redirectUri }
  ) as ParsedOAuthCallbackBody<RequireCodeVerifier>
}
