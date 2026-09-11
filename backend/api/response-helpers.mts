import type { Context } from '@jongleberry/api-server'
import type { PrivateUser } from '@services/users/types'
import type { PageInfo } from '@voucha/types/pagination'
import { isUUID } from '@modules/utils'
export { setAnonymousPublicCacheHeaders } from './cache-headers.mts'

export async function requireAuth(ctx: Context, routeId: string): Promise<PrivateUser> {
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
  return currentUser
}
export function validateUUIDParam(ctx: Context, name: string): string {
  const value = ctx.params[name] ?? ''
  const label = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/Id$/, 'ID')
  ctx.assert(isUUID(value), 422, `Invalid ${label}`)
  return value
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
    error => error,
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
  if (error) throw error
}
