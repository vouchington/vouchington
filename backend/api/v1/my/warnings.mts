import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { listReceivedUserWarnings, userWarningsPagination } from '@services/user-warnings'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

// GET /api/v1/my/warnings — list current user's received warnings
app.route('/api/v1/my/warnings').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/warnings', userWarningsPagination)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/warnings')

  const pagination = userWarningsPagination.parse(ctx.query)
  const query = prepareQueryForValidation(ctx.query, userWarningsPagination.queryContract)
  if (ctx.query.limit !== undefined) query.limit = pagination.limit
  validateRequestContract(ctx, 'GET:/api/v1/my/warnings', { query })

  const { warnings, hasNextPage, startCursor, endCursor } = await listReceivedUserWarnings(
    currentUser.id,
    {
      limit: pagination.limit,
      after: pagination.after,
    },
  )

  ctx.json({
    warnings,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: startCursor,
      end_cursor: endCursor,
    },
  })
})
