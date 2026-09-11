import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { createPaginationParser } from '@modules/pagination'
import { requireAuth } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import {
  getHouseholdMemberships,
  addHouseholdMembership,
  removeHouseholdMembership,
} from '@services/individuals-households'

const householdMembershipsPaginationParser = createPaginationParser({
  cursor: { type: 'precise_timestamp' },
  limit: { min: 1, max: 100, default: 25 },
})

app
  .route('/api/v1/households/:id/memberships')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/households/:id/memberships', householdMembershipsPaginationParser)
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/households/:id/memberships')
    const { after, limit } = householdMembershipsPaginationParser.parse(ctx.query)
    ctx.json(await getHouseholdMemberships(currentUser, ctx.params.id!, { after, limit }))
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/households/:id/memberships')
    const body = (await ctx.request.json('1mb')) as Record<string, unknown>
    const { individual_id, relationship } = body

    ctx.assert(individual_id, 422, 'individual_id is required')

    const membership = await addHouseholdMembership(
      currentUser,
      ctx.params.id!,
      individual_id as string,
      relationship as string | undefined,
    )
    ctx.setStatus(201)
    ctx.json({ membership })
  })

app.route('/api/v1/households/:id/memberships/:membershipId').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/households/:id/memberships/:membershipId',
  )
  await removeHouseholdMembership(currentUser, ctx.params.id!, ctx.params.membershipId!)
  ctx.setStatus(204)
})
