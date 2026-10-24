import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import { parseJsonBody, requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../api-query-contract.mts'
import {
  listMyHouseholdMemberships,
  addMyHouseholdMembership,
  removeMyHouseholdMembership,
  householdMembershipsPaginationParser,
} from '@services/individuals-households/households/household-commands'

/** Closed request body for `POST /api/v1/households/:id/memberships`. */
type AddHouseholdMembershipBody = { individual_id: ApiUuidContract; relationship?: string }

app
  .route('/api/v1/households/:id/memberships')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/households/:id/memberships', householdMembershipsPaginationParser)
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/households/:id/memberships')
    ctx.json(
      await listMyHouseholdMemberships(currentUser, ctx.params, ctx.query, input =>
        validateRequestContract(ctx, 'GET:/api/v1/households/:id/memberships', input),
      ),
    )
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/households/:id/memberships')
    const result = await addMyHouseholdMembership(
      currentUser,
      ctx.params,
      async () => (await parseJsonBody(ctx, '1mb')) as AddHouseholdMembershipBody,
      input => validateRequestContract(ctx, 'POST:/api/v1/households/:id/memberships', input),
    )
    ctx.setStatus(201)
    ctx.json(result)
  })

app.route('/api/v1/households/:id/memberships/:membershipId').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/households/:id/memberships/:membershipId',
  )
  await removeMyHouseholdMembership(currentUser, ctx.params, input =>
    validateRequestContract(ctx, 'DELETE:/api/v1/households/:id/memberships/:membershipId', input),
  )
  ctx.setStatus(204)
})
