import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { parseJsonBody, requireAuthAndRateLimit } from '../../response-helpers.mts'
import {
  parseCreateUserWarningInput,
  createUserWarning,
  listIssuedUserWarnings,
  currentUserCanIssueUserWarning,
  currentUserCanViewUserWarnings,
  userWarningsPagination,
} from '@services/user-warnings'
import {
  getModerationReportTargetUserId,
  isModerationReportInCommunityScope,
} from '@services/moderation-reports'
import { isUUID } from '@modules/utils'

// POST /api/v1/admin/warnings — issue a warning (mod staff only)
app.route('/api/v1/admin/warnings').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanIssueUserWarning,
    'POST:/api/v1/admin/warnings',
  )
  const body = await parseJsonBody<Record<string, unknown>>(ctx)
  const input = parseCreateUserWarningInput({
    userId: body.userId,
    reason: body.reason,
    publicMessage: body.publicMessage,
    communityId: body.communityId,
    reportId: body.reportId,
    resolveReport: body.resolveReport,
  })

  // If a report is linked, validate ownership before creating the warning.
  if (input.reportId) {
    const targetUserId = await getModerationReportTargetUserId(input.reportId)
    ctx.assert(targetUserId !== null, 404, 'Report not found')
    ctx.assert(targetUserId === input.userId, 422, 'Report does not target the warned user')
    if (input.communityId) {
      const inScope = await isModerationReportInCommunityScope(input.reportId, input.communityId)
      ctx.assert(inScope, 422, 'Report does not belong to the specified community')
    }
  }

  // Create the warning first — if this fails, the report stays pending (retryable).
  // Resolving the report after creation means a warning always exists before the report
  // is marked 'actioned', avoiding the inverse failure where the report is resolved but
  // no warning was created.
  const warning = await createUserWarning(currentUser.id, input, { returnExistingForReport: true })

  if (input.reportId && input.resolveReport) {
    const { resolveModerationReport } = await import('@services/moderation-reports/resolve')
    await resolveModerationReport(input.reportId, {
      status: 'actioned',
      resolvedById: currentUser.id,
    })
  }

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
