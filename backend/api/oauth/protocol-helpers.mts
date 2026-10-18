import {
  buildOAuthErrorResponse,
  invalidClientMetadata,
  invalidRequest,
  OAUTH_RESPONSE_HEADERS,
  parseFormBody as parseOAuthFormBody,
  parseRegistrationBody,
  type OAuthProtocolError,
} from '@vouchington/oauth-server'
import type { Context } from '@jongleberry/api-server'

const FORM_BODY_LIMIT = '16kb'

export async function parseFormBody(ctx: Context): Promise<URLSearchParams> {
  const contentType = ctx.req.headers['content-type']
  if (contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/x-www-form-urlencoded') {
    throw invalidRequest('content type must be form encoded')
  }
  return parseOAuthFormBody(contentType, await ctx.request.buffer(FORM_BODY_LIMIT))
}

export async function parseOAuthRegistrationBody(ctx: Context): Promise<unknown> {
  const contentType = ctx.req.headers['content-type']
  if (contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    throw invalidClientMetadata('registration metadata must use application/json')
  }
  return parseRegistrationBody(contentType, await ctx.request.buffer(FORM_BODY_LIMIT))
}

export function queryString(ctx: Context, name: string): string {
  const value = ctx.query[name]
  return typeof value === 'string' ? value : ''
}

export function setOAuthResponseHeaders(ctx: Context): void {
  for (const [name, value] of Object.entries(OAUTH_RESPONSE_HEADERS)) ctx.set(name, value)
}

export function redirect(ctx: Context, location: string): void {
  ctx.setStatus(302)
  ctx.set('Location', location)
  ctx.response.empty()
}

export function sendOAuthError(ctx: Context, error: OAuthProtocolError): void {
  const response = buildOAuthErrorResponse(error)
  ctx.setStatus(response.status)
  for (const [name, value] of Object.entries(response.headers)) ctx.set(name, value)
  ctx.json(response.body)
}
