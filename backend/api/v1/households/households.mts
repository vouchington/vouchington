import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import {
  getHouseholdsByUser,
  createHousehold,
  type HouseholdAccess,
} from '@services/individuals-households'
import { createPaginationParser, defineQueryContract, queryEnum } from '@modules/pagination'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'

/** Closed empty request body: a household is created without client-supplied fields. */
interface CreateHouseholdBody {}

const householdsPaginationParser = createPaginationParser({
  cursor: { type: 'precise_timestamp' },
  limit: { min: 1, max: 100, default: 25 },
})
const householdsFilterQuery = defineQueryContract({
  access: queryEnum(['all', 'owned', 'member'] as const),
})

app
  .route('/api/v1/households')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/households', householdsPaginationParser, householdsFilterQuery)
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/households')
    const { after, limit } = parseAndValidatePaginatedRequest(
      ctx,
      'GET:/api/v1/households',
      householdsPaginationParser,
      { extraQueryContracts: [householdsFilterQuery.queryContract] },
    )
    const access = (ctx.query.access ?? 'all') as HouseholdAccess
    ctx.json(await getHouseholdsByUser(currentUser, { access, after, limit }))
  })
  .post(async (ctx: Context) => {
    // ast-grep-ignore: no-three-sequential-awaits -- route handler validates auth/input before dependent mutation or response work
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/households')
    const body = (await ctx.request.json('1mb')) as CreateHouseholdBody
    validateRequestContract(ctx, 'POST:/api/v1/households', { body })

    const household = await createHousehold(currentUser)
    ctx.setStatus(201)
    ctx.json({ household })
  })
