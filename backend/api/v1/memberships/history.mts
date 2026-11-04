import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import { createPaginationParser } from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { apiQuery } from '../../api-query-contract.mts'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { currentUserCanViewMembershipHistory } from '@services/memberships/authorization'
import { getMembershipHistory } from '@services/memberships/get'

const historyPagination = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

app.route('/api/v1/memberships/history/:userId').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/memberships/history/:userId', historyPagination)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/memberships/history/:userId')

  const userId = ctx.params.userId!

  if (!currentUserCanViewMembershipHistory(currentUser, userId)) {
    ctx.throw(403, 'Admin access required')
  }
  const pagination = parseRuntimePagination(historyPagination, ctx.query)
  const query = prepareQueryForValidation(ctx.query, historyPagination.queryContract)
  if (ctx.query.limit !== undefined) query.limit = pagination.limit
  validateRequestContract(ctx, 'GET:/api/v1/memberships/history/:userId', {
    path: ctx.params,
    query,
  })
  ctx.json(await getMembershipHistory(userId, { limit: pagination.limit, after: pagination.after }))
})
