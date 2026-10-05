import type { Context } from '@jongleberry/api-server'
import { isHttpError } from 'http-errors'
import type { PrivateUser } from '@services/users/types'
import type { PageInfo } from '@voucha/types/pagination'
import { isUUID } from '@modules/utils'
import { RuntimeRequestValidatorRegistry } from '@services/runtime-request-validation'
import { assertNotSuspended } from '@services/users/suspension-guard'
export { setAnonymousPublicCacheHeaders } from './cache-headers.mts'

const SUSPENDED_EXCEPTION_ROUTES = [
  'POST:/api/v1/appeals',
  'DELETE:/api/v1/my/consents/:type',
  'DELETE:/api/v1/users/:idOrSlug',
  'POST:/api/v1/users/:idOrSlug/data-request',
  'POST:/api/v1/memberships/billing-portal-sessions',
  'POST:/api/v1/markdown/preview',
] as const
type SuspendedExceptionRoute = (typeof SUSPENDED_EXCEPTION_ROUTES)[number]
const SUSPENDED_PROTOCOL_ROUTES = [
  'POST:/api/v1/auth/oauth/:provider/continue',
  'POST:/api/v1/auth/oauth/:provider/authorizations',
  'POST:/api/v1/auth/oauth/authorizations/:flowId/complete',
  'POST:/api/v1/copyright-notices/:id/guest-filings',
] as const
type SuspendedProtocolRoute = (typeof SUSPENDED_PROTOCOL_ROUTES)[number]

function isUnsafeRoute(routeId: string): boolean {
  return /^(POST|PUT|PATCH|DELETE):/.test(routeId)
}

function assertActiveForRoute(currentUser: PrivateUser | null, routeId: string): void {
  if (isUnsafeRoute(routeId)) assertNotSuspended(currentUser)
}

export async function requireAuth(ctx: Context, routeId: string): Promise<PrivateUser> {
  const currentUser = await requireUserAfterAnonRateLimit(ctx, routeId)
  const signatureError = captureSignatureVerificationError(ctx)
  await applyRouteRateLimitBeforeSignatureError(ctx, routeId, signatureError)
  assertActiveForRoute(currentUser, routeId)
  return currentUser
}
export async function requireAuthForSuspendedException(
  ctx: Context,
  routeId: SuspendedExceptionRoute,
): Promise<PrivateUser> {
  if (!SUSPENDED_EXCEPTION_ROUTES.includes(routeId))
    throw new Error(`Unapproved suspension exception: ${routeId}`)
  const currentUser = await requireUserAfterAnonRateLimit(ctx, routeId)
  const signatureError = captureSignatureVerificationError(ctx)
  await applyRouteRateLimitBeforeSignatureError(ctx, routeId, signatureError)
  return currentUser
}
export async function getOptionalAuthAndRateLimit(
  ctx: Context,
  routeId: string,
): Promise<PrivateUser | null> {
  const signatureError = captureSignatureVerificationError(ctx)
  const currentUser = await ctx.getCurrentUser()
  await applyRouteRateLimitBeforeSignatureError(ctx, routeId, signatureError)
  assertActiveForRoute(currentUser, routeId)
  return currentUser
}
export async function getOptionalProtocolAuthAndRateLimit(
  ctx: Context,
  routeId: SuspendedProtocolRoute,
): Promise<PrivateUser | null> {
  if (!SUSPENDED_PROTOCOL_ROUTES.includes(routeId))
    throw new Error(`Unapproved protocol route: ${routeId}`)
  const signatureError = captureSignatureVerificationError(ctx)
  const currentUser = await ctx.getCurrentUser()
  await applyRouteRateLimitBeforeSignatureError(ctx, routeId, signatureError)
  return currentUser
}
export async function requireAuthAndRateLimit(
  ctx: Context,
  canFn: (user: PrivateUser) => boolean,
  routeId: string,
): Promise<PrivateUser> {
  const currentUser = await requireUserAfterAnonRateLimit(ctx, routeId)
  ctx.assert(canFn(currentUser), 403, 'Forbidden')
  const signatureError = captureSignatureVerificationError(ctx)
  await applyRouteRateLimitBeforeSignatureError(ctx, routeId, signatureError)
  assertActiveForRoute(currentUser, routeId)
  return currentUser
}
export function validateUUIDParam(ctx: Context, name: string): string {
  const value = ctx.params[name] ?? ''
  const label = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/Id$/, 'ID')
  ctx.assert(isUUID(value), 422, `Invalid ${label}`)
  return value
}
/**
 * Validates the declared path/query/JSON carriers of a generated request contract, throwing 422
 * with the registry's redacted message on failure. The registry does not enforce call order —
 * the caller must invoke this after the route's existing preamble and before handing any carrier
 * value to a service. For an authenticated route that preamble is authentication and any
 * ownership/suspension checks, so unauthorized callers never see a schema diagnostic. For a
 * public/anonymous route (no auth step exists) it is instead the route's rate limiter and any
 * honeypot or attempt-limit counters, so a malformed-shape probe still counts against them rather
 * than short-circuiting for free. Unknown operations fail closed with a thrown `Error` (not a
 * 422) — see `RuntimeRequestValidatorRegistry.validateAuthenticated`.
 */
/** Re-throws HTTP errors without leaving a declaration-only call in a route file. */
export function rethrowHttpError(err: unknown): void {
  if (isHttpError(err)) throw err
}

export function validateRequestContract(
  ctx: Context,
  operation: string,
  input: Parameters<RuntimeRequestValidatorRegistry['validateAuthenticated']>[1],
): void {
  const error = RuntimeRequestValidatorRegistry.shared.validateAuthenticated(operation, input)
  if (error) ctx.throw(422, error.message)
}
export async function parseJsonBody<T = unknown>(ctx: Context, maxSize = '1mb'): Promise<T> {
  return (await ctx.request.json(maxSize)) as T
}
export const EMPTY_PAGE_INFO: PageInfo = {
  has_next_page: false,
  end_cursor: null,
  start_cursor: null,
}
function captureSignatureVerificationError(ctx: Context): Promise<unknown | null> {
  return ctx.verifyAttestedRequestSignature().then(
    () => null,
    err => err,
  )
}
async function requireUserAfterAnonRateLimit(ctx: Context, routeId: string): Promise<PrivateUser> {
  const currentUser = await ctx.getCurrentUser()
  if (currentUser) return currentUser
  await ctx.applyRouteRateLimit(routeId)
  ctx.assert(false, 401, 'Unauthorized')
  throw new Error('Unauthorized')
}
async function applyRouteRateLimitBeforeSignatureError(
  ctx: Context,
  routeId: string,
  signatureError: Promise<unknown | null>,
): Promise<void> {
  await ctx.applyRouteRateLimit(routeId)
  const error = await signatureError
  if (error)
    throw error instanceof Error
      ? error
      : new Error('Signature verification failed', { cause: error })
}
