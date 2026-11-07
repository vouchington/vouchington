import type { Context } from '@jongleberry/api-server'
import { boundedString } from '@services/copyright-notices/http-input'
import { currentUserCanReviewCopyrightNotices } from '@services/copyright-notices'
import { assertNotSuspended } from '@services/users'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateUUIDParam,
} from '../../response-helpers.mts'

export async function parseCopyrightReviewRequest(ctx: Context, routeId: string) {
  setPrivateNoStoreCacheHeaders(ctx)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    routeId,
  )
  assertNotSuspended(currentUser)
  const intakeId = validateUUIDParam(ctx, 'id')
  const parsedBody: unknown = await parseJsonBody(ctx, '1mb')
  const body = parsedBody as Record<string, unknown>
  ctx.assert(boundedString(body.rationale, 10_000), 422, 'rationale is required')
  return { currentUser, intakeId, body }
}
