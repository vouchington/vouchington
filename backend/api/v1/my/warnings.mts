import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { listReceivedUserWarnings, userWarningsPagination } from '@services/user-warnings'

// GET /api/v1/my/warnings — list current user's received warnings
app.route('/api/v1/my/warnings').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/warnings')

  const pagination = userWarningsPagination.parse(ctx.query)

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
