import type { Context } from '@jongleberry/api-server'
import { createPaginationParser, decodeScopedUuidCursor, buildPageInfo } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import {
  copyrightTrustedFlaggerCursorScope,
  createCopyrightTrustedFlagger,
  currentUserCanApproveCopyrightJurisdictionPolicy,
  currentUserCanReviewCopyrightNotices,
  getCopyrightTrustedFlagger,
  listCopyrightTrustedFlaggers,
  recordCopyrightTrustedFlaggerChange,
} from '@services/copyright-notices'
import { boundedString } from '@services/copyright-notices/http-input'
import { assertNotSuspended } from '@services/users'
import app from '../../app.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiOpenApiNoContent, apiQuery, apiResponse } from '../../response-contract.mts'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'
import type {
  CopyrightTrustedFlaggerChangeRequest,
  CopyrightTrustedFlaggerCreateRequest,
} from './trusted-flagger-request-types.mts'

const path = '/api/v1/copyright-trusted-flaggers'
const listRoute = `GET:${path}`
const createRoute = `POST:${path}`
const itemRoute = `GET:${path}/:id`
const listParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

function assertCreateInput(ctx: Context, body: CopyrightTrustedFlaggerCreateRequest): void {
  if (!boundedString(body.name, 200)) ctx.throw(422, 'name is required')
  if (typeof body.user_id !== 'string' || !isUUID(body.user_id)) {
    ctx.throw(422, 'user_id must be a UUID')
  }
  if (!boundedString(body.awarding_coordinator_name, 200)) {
    ctx.throw(422, 'awarding_coordinator_name is required')
  }
  if (
    typeof body.awarding_member_state !== 'string' ||
    !/^[A-Z]{2}$/.test(body.awarding_member_state)
  ) {
    ctx.throw(422, 'awarding_member_state must be an uppercase two-letter code')
  }
  if (
    typeof body.awarded_at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.awarded_at) ||
    body.awarded_at.slice(0, 4) === '0000' ||
    Number.isNaN(Date.parse(`${body.awarded_at}T00:00:00Z`)) ||
    new Date(`${body.awarded_at}T00:00:00Z`).toISOString().slice(0, 10) !== body.awarded_at
  ) {
    ctx.throw(422, 'awarded_at must be a valid YYYY-MM-DD date')
  }
  if (!['intellectual_property', 'other'].includes(body.area_of_expertise)) {
    ctx.throw(422, 'area_of_expertise is invalid')
  }
  if (!boundedString(body.area_description, 500)) ctx.throw(422, 'area_description is required')
  if (body.award_reference != null && !boundedString(body.award_reference, 2048)) {
    ctx.throw(422, 'award_reference must be 1 to 2048 characters')
  }
}

function assertObjectBody(ctx: Context, body: unknown): asserts body is Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    ctx.throw(422, 'Invalid request body')
}

app.route('/api/v1/copyright-trusted-flaggers').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/copyright-trusted-flaggers', listParser)
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    listRoute,
  )
  assertNotSuspended(currentUser)
  const options = parseAndValidatePaginatedRequest(ctx, listRoute, listParser)
  const afterId = options.after
    ? decodeScopedUuidCursor(
        options.after,
        copyrightTrustedFlaggerCursorScope,
        'Invalid cursor format',
      ).id
    : undefined
  const { results, hasNextPage } = await listCopyrightTrustedFlaggers(currentUser, {
    limit: options.limit,
    afterId,
  })
  ctx.json(
    apiResponse('GET:/api/v1/copyright-trusted-flaggers', {
      copyright_trusted_flaggers: results,
      page_info: buildPageInfo(results, {
        hasNextPage,
        getCursor: row => ({ id: row.id, scope: copyrightTrustedFlaggerCursorScope }),
      }),
    }),
  )
})

app.route('/api/v1/copyright-trusted-flaggers').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanApproveCopyrightJurisdictionPolicy,
    createRoute,
  )
  assertNotSuspended(currentUser)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const body = await parseJsonBody<CopyrightTrustedFlaggerCreateRequest>(ctx)
  assertObjectBody(ctx, body)
  assertCreateInput(ctx, body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-trusted-flaggers', { body })
  const entry = await createCopyrightTrustedFlagger(currentUser, {
    name: body.name,
    userId: body.user_id,
    awardingCoordinatorName: body.awarding_coordinator_name,
    awardingMemberState: body.awarding_member_state,
    awardedAt: body.awarded_at,
    areaOfExpertise: body.area_of_expertise,
    areaDescription: body.area_description,
    awardReference: body.award_reference,
  })
  ctx.setStatus(201)
  ctx.json(
    apiResponse('POST:/api/v1/copyright-trusted-flaggers', { copyright_trusted_flagger: entry }),
  )
})

app
  .route('/api/v1/copyright-trusted-flaggers/:id')
  .get(async (ctx: Context) => {
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      itemRoute,
    )
    assertNotSuspended(currentUser)
    const id = validateUUIDParam(ctx, 'id')
    validateRequestContract(ctx, 'GET:/api/v1/copyright-trusted-flaggers/:id', { path: ctx.params })
    const entry = await getCopyrightTrustedFlagger(currentUser, id)
    ctx.assert(entry, 404, 'Trusted flagger not found')
    ctx.json(
      apiResponse('GET:/api/v1/copyright-trusted-flaggers/:id', {
        copyright_trusted_flagger: entry,
      }),
    )
  })
  .patch((ctx: Context) => {
    apiOpenApiNoContent('PATCH:/api/v1/copyright-trusted-flaggers/:id', 405)
    ctx.set('Allow', 'GET')
    ctx.setStatus(405)
    ctx.response.empty()
  })
  .delete((ctx: Context) => {
    apiOpenApiNoContent('DELETE:/api/v1/copyright-trusted-flaggers/:id', 405)
    ctx.set('Allow', 'GET')
    ctx.setStatus(405)
    ctx.response.empty()
  })

app.route('/api/v1/copyright-trusted-flaggers/:id/status-changes').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanApproveCopyrightJurisdictionPolicy,
    'POST:/api/v1/copyright-trusted-flaggers/:id/status-changes',
  )
  assertNotSuspended(currentUser)
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const id = validateUUIDParam(ctx, 'id')
  const body = await parseJsonBody<CopyrightTrustedFlaggerChangeRequest>(ctx)
  assertObjectBody(ctx, body)
  if (!['suspended', 'reinstated', 'revoked'].includes(body.change_type)) {
    ctx.throw(422, 'change_type is invalid')
  }
  if (!boundedString(body.reason, 4000)) ctx.throw(422, 'reason is required')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-trusted-flaggers/:id/status-changes', {
    path: ctx.params,
    body,
  })
  const change = await recordCopyrightTrustedFlaggerChange(currentUser, id, {
    changeType: body.change_type,
    reason: body.reason,
  })
  ctx.setStatus(201)
  ctx.json(
    apiResponse('POST:/api/v1/copyright-trusted-flaggers/:id/status-changes', {
      copyright_trusted_flagger_change: change,
    }),
  )
})
