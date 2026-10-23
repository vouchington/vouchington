import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import {
  listMyHouseholds,
  createMyHousehold,
  householdsPaginationParser,
  householdsFilterQuery,
} from '@services/individuals-households/households/household-commands'
import { parseJsonBody, requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../api-query-contract.mts'

/** Closed empty request body: a household is created without client-supplied fields. */
type CreateHouseholdBody = Record<string, never>

app
  .route('/api/v1/households')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/households', householdsPaginationParser, householdsFilterQuery)
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/households')
    ctx.json(
      await listMyHouseholds(currentUser, ctx.query, input =>
        validateRequestContract(ctx, 'GET:/api/v1/households', input),
      ),
    )
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/households')
    const result = await createMyHousehold(
      currentUser,
      async () => (await parseJsonBody(ctx, '1mb')) as CreateHouseholdBody,
      input => validateRequestContract(ctx, 'POST:/api/v1/households', input),
    )
    ctx.setStatus(201)
    ctx.json(result)
  })
