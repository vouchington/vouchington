import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { createPaginationParser } from '@modules/pagination'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'
import {
  getHouseholdMemberships,
  addHouseholdMembership,
  removeHouseholdMembership,
} from '@services/individuals-households'

/** Closed request body for `POST /api/v1/households/:id/memberships`. */
type AddHouseholdMembershipBody = { individual_id: ApiUuidContract; relationship?: string }

const householdMembershipsPaginationParser = createPaginationParser({
  cursor: { type: 'precise_timestamp' },
  limit: { min: 1, max: 100, default: 25 },
})

app
  .route('/api/v1/households/:id/memberships')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/households/:id/memberships', householdMembershipsPaginationParser)
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/households/:id/memberships')
    validateUUIDParam(ctx, 'id')
    const { after, limit } = parseAndValidatePaginatedRequest(
      ctx,
      'GET:/api/v1/households/:id/memberships',
      householdMembershipsPaginationParser,
      { path: true },
    )
    ctx.json(await getHouseholdMemberships(currentUser, ctx.params.id!, { after, limit }))
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/households/:id/memberships')
    validateUUIDParam(ctx, 'id')
    const body = (await ctx.request.json('1mb')) as AddHouseholdMembershipBody
    validateRequestContract(ctx, 'POST:/api/v1/households/:id/memberships', {
      body,
      path: ctx.params,
    })

    const membership = await addHouseholdMembership(
      currentUser,
      ctx.params.id!,
      body.individual_id,
      body.relationship,
    )
    ctx.setStatus(201)
    ctx.json({ membership })
  })

app.route('/api/v1/households/:id/memberships/:membershipId').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/households/:id/memberships/:membershipId',
  )
  validateUUIDParam(ctx, 'id')
  validateUUIDParam(ctx, 'membershipId')
  validateRequestContract(ctx, 'DELETE:/api/v1/households/:id/memberships/:membershipId', {
    path: ctx.params,
  })
  await removeHouseholdMembership(currentUser, ctx.params.id!, ctx.params.membershipId!)
  ctx.setStatus(204)
})
