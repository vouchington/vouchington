import type { Context } from '@jongleberry/api-server'
import createHttpError from 'http-errors'
import app from '../../app.mts'
import {
  getHouseholdsByUser,
  createHousehold,
  type HouseholdAccess,
} from '@services/individuals-households'
import { createPaginationParser, defineQueryContract, queryEnum } from '@modules/pagination'
import { requireAuth } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'

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
    const { after, limit } = householdsPaginationParser.parse(ctx.query)
    const access = parseHouseholdAccess(ctx.query.access)
    ctx.json(await getHouseholdsByUser(currentUser, { access, after, limit }))
  })
  .post(async (ctx: Context) => {
    // ast-grep-ignore: no-three-sequential-awaits -- route handler validates auth/input before dependent mutation or response work
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/households')
    await ctx.request.json('1mb')

    const household = await createHousehold(currentUser)
    ctx.setStatus(201)
    ctx.json({ household })
  })

function parseHouseholdAccess(value: unknown): HouseholdAccess {
  if (value === undefined) return 'all'
  if (value === 'all' || value === 'owned' || value === 'member') return value
  throw createHttpError(400, 'access must be one of: all, owned, member')
}
