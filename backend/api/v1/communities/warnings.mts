import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { parseJsonBody, requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { loadCommunityForModerator, getCommunityOrThrow } from '@services/communities'
import { isModerationStaff } from '@services/users'
import { parseCreateUserWarningInput, createUserWarning } from '@services/user-warnings'
import {
  getModerationReportTargetUserId,
  isModerationReportInCommunityScope,
} from '@services/moderation-reports'

// POST /api/v1/communities/:idOrSlug/warnings — issue a community-scoped warning
app.route('/api/v1/communities/:idOrSlug/warnings').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities/:idOrSlug/warnings')
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  // Site moderation staff can issue community warnings without community membership.
  const { community } = isModerationStaff(currentUser)
    ? { community: await getCommunityOrThrow(idOrSlug) }
    : await loadCommunityForModerator(currentUser, idOrSlug)
  const body = await parseJsonBody<Record<string, unknown>>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/communities/:idOrSlug/warnings', {
    path: ctx.params,
    body,
  })
  const input = parseCreateUserWarningInput({
    userId: body.userId,
    reason: body.reason,
    publicMessage: body.publicMessage,
    communityId: community.id,
    reportId: body.reportId,
    resolveReport: body.resolveReport,
  })

  // If a report is linked, validate community scope and derive the target user regardless of resolveReport.
  if (input.reportId) {
    const targetUserId = await getModerationReportTargetUserId(input.reportId)
    ctx.assert(targetUserId !== null, 404, 'Report not found')
    const inScope = await isModerationReportInCommunityScope(input.reportId, community.id)
    ctx.assert(inScope, 403, 'Report is not within this community')
    // Derive userId from the report — do not validate caller-supplied userId to avoid
    // exposing an oracle for deanonymizing anonymous post authors.
    input.userId = targetUserId
  }

  // Create the warning first — if this fails, the report stays pending (retryable).
  // Resolving the report after creation means a warning always exists before the report
  // is marked 'actioned', avoiding the inverse failure where the report is resolved but
  // no warning was created.
  const warning = await createUserWarning(currentUser.id, input, { returnExistingForReport: true })

  if (input.reportId && input.resolveReport) {
    const { resolveModerationReport } = await import('@services/moderation-reports/resolve')
    await resolveModerationReport(input.reportId, {
      communityId: community.id,
      status: 'actioned',
      resolvedById: currentUser.id,
    })
  }

  // Omit user_id and case_id from the response — community moderators must not learn the
  // identity of anonymous post authors or the internal case reference.
  const { user_id: _uid, case_id: _cid, ...warningForResponse } = warning
  ctx.setStatus(201)
  ctx.json({ warning: warningForResponse })
})
