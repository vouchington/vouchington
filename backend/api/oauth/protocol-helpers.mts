import { OAuthProtocolError } from '@services/oauth-authorization-server'
import type { Context } from '@jongleberry/api-server'

const FORM_BODY_LIMIT = '16kb'

export async function parseFormBody(ctx: Context): Promise<URLSearchParams> {
  const contentType = ctx.req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/x-www-form-urlencoded') {
    throw new OAuthProtocolError('invalid_request', 'content type must be form encoded')
  }
  const body = await ctx.request.buffer(FORM_BODY_LIMIT)
  const form = new URLSearchParams(body.toString('utf8'))
  for (const name of new Set(form.keys())) {
    if (form.getAll(name).length !== 1) {
      throw new OAuthProtocolError('invalid_request', `${name} must not be repeated`)
    }
  }
  return form
}

export function parseOAuthClientAuthentication(
  ctx: Context,
  form: URLSearchParams,
): { clientId: string; clientSecret?: string } {
  const authorization = ctx.req.headers.authorization
  const bodyClientId = form.get('client_id')
  const bodyClientSecret = form.get('client_secret')
  if (!authorization) {
    if (!bodyClientId) throw new OAuthProtocolError('invalid_client', 'client_id is required', 401)
    if (bodyClientSecret !== null) {
      throw new OAuthProtocolError('invalid_client', 'client_secret_post is not supported', 401)
    }
    return { clientId: bodyClientId }
  }
  const match = /^basic +(.+)$/i.exec(authorization)
  if (!match || bodyClientId || bodyClientSecret !== null) {
    throw new OAuthProtocolError('invalid_client', 'client authentication failed', 401)
  }
  const decoded = decodeBasicCredentials(match[1]!)
  const separator = decoded.indexOf(':')
  if (separator < 1) {
    throw new OAuthProtocolError('invalid_client', 'client authentication failed', 401)
  }
  return {
    clientId: decodeFormComponent(decoded.slice(0, separator)),
    clientSecret: decodeFormComponent(decoded.slice(separator + 1)),
  }
}

export function requiredFormValue(form: URLSearchParams, name: string): string {
  const value = form.get(name)
  if (!value) throw new OAuthProtocolError('invalid_request', `${name} is required`)
  return value
}

export function queryString(ctx: Context, name: string): string {
  const value = ctx.query[name]
  return typeof value === 'string' ? value : ''
}

export function setOAuthResponseHeaders(ctx: Context): void {
  ctx.set('Cache-Control', 'no-store')
  ctx.set('Pragma', 'no-cache')
  ctx.set('Referrer-Policy', 'no-referrer')
  ctx.set('X-Robots-Tag', 'noindex, nofollow')
}

export function redirect(ctx: Context, location: string): void {
  ctx.setStatus(302)
  ctx.set('Location', location)
  ctx.response.empty()
}

export function sendOAuthError(ctx: Context, error: OAuthProtocolError): void {
  ctx.setStatus(error.status)
  if (error.code === 'invalid_client') ctx.set('WWW-Authenticate', 'Basic realm="token"')
  ctx.json({ error: error.code, error_description: error.message })
}

function decodeBasicCredentials(encoded: string): string {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new OAuthProtocolError('invalid_client', 'client authentication failed', 401)
  }
  const decoded = Buffer.from(encoded, 'base64').toString('utf8')
  if (decoded.includes('\uFFFD')) {
    throw new OAuthProtocolError('invalid_client', 'client authentication failed', 401)
  }
  return decoded
}

function decodeFormComponent(value: string): string {
  try {
    return decodeURIComponent(value.replaceAll('+', ' '))
  } catch {
    throw new OAuthProtocolError('invalid_client', 'client authentication failed', 401)
  }
}
