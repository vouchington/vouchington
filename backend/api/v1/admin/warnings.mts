import { issueUserWarning } from '@services/user-warnings/issue-warning'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
} from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import {
  parseCreateUserWarningInput,
  listIssuedUserWarnings,
  currentUserCanIssueUserWarning,
  currentUserCanViewUserWarnings,
  userWarningsPagination,
} from '@services/user-warnings'
import { isUUID } from '@modules/utils'

type IssueUserWarningRequest = {
  userId: ApiUuidContract
  reason: string
  publicMessage?: string | null
  communityId?: ApiUuidContract | null
  reportId?: ApiUuidContract | null
  resolveReport?: boolean
}

// POST /api/v1/admin/warnings — issue a warning (mod staff only)
app.route('/api/v1/admin/warnings').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanIssueUserWarning,
    'POST:/api/v1/admin/warnings',
  )
  const body = await parseJsonBody<IssueUserWarningRequest>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/admin/warnings', { body })
  const input = parseCreateUserWarningInput({
    userId: body.userId,
    reason: body.reason,
    publicMessage: body.publicMessage,
    communityId: body.communityId,
    reportId: body.reportId,
    resolveReport: body.resolveReport,
  })

  const warning = await issueUserWarning(currentUser.id, input, 'staff_or_user')

  ctx.setStatus(201)
  ctx.json({ warning })
})

// GET /api/v1/admin/warnings — list warnings for a user (mod staff)
app.route('/api/v1/admin/warnings').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanViewUserWarnings, 'GET:/api/v1/admin/warnings')

  const userId = ctx.query.userId
  ctx.assert(
    typeof userId === 'string' && isUUID(userId),
    422,
    'userId query param is required and must be a UUID',
  )

  const pagination = userWarningsPagination.parse(ctx.query)

  const { warnings, hasNextPage, startCursor, endCursor } = await listIssuedUserWarnings({
    userId,
    limit: pagination.limit,
    after: pagination.after,
  })

  ctx.json({
    warnings,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: startCursor,
      end_cursor: endCursor,
    },
  })
})
